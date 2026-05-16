#!/usr/bin/env python3
"""
Import gauges.csv into the paddlemate database.

For each gauge row:
  1. Insert a `gauges` row (provider + source_id).
  2. Insert one or two `gauge_series` rows (water_level / discharge) based on
     the gauge's `units` column.
  3. For each river section listed in the `rivers` column, look up the
     matching `features` row and insert a `feature_water_ranges` row with the
     lw/mw/hw thresholds from the CSV.

source_id conventions (must match reader expectations):
  - tirol   (pure numbers, country AT): "{hzbnr}:W"  / "{hzbnr}:Q"
  - bafu    (pure numbers, country CH or explicit "bafu." prefix):
              "{station_id}:height" / "{station_id}:flow"
  - hubeau  (letter-code IDs, country FR or explicit "hubeau." prefix):
              "{station_id}:H" / "{station_id}:Q"
  - by      (Bavaria BLfU):  "{local_id}:w" / "{local_id}:q"   (lowercase)
  - nve     (Norway):        "{api_station_id}:1000" (stage) / "{api_station_id}:1001" (discharge)
                              api_station_id = "2.32.0" from "nve.0002.00032.000"
  - vbg     (Vorarlberg):    "{WISID}:W"  / "{WISID}:Q"
  - ehyd    (AT provinces):  "{prefix.local_id}:W" / "{prefix.local_id}:Q"
                              prefix = ooe/noe/sbg/stmk/ktn
  - bafu    (Switzerland):   "{station_id}:height" / "{station_id}:flow"
  - hubeau  (France):        "{station_id}:H"  / "{station_id}:Q"
  - rz (IT only):            "{station_uuid}:W" / "{station_uuid}:Q"
                              uuid resolved by name-matching against riverzone.eu HTML
  - pl      (Poland):        "{local_id}:W" / "{local_id}:Q"
  - cz      (Czech):         "{local_id}:H" / "{local_id}:Q"
  - bw      (Baden-W.):      "{local_id}:W" / "{local_id}:Q"
  - bw-x    (Baden-W. ext): same provider "bw", local_id zero-padded to 4 digits
                              e.g. bw-x.170 → source_id "0170:W/Q"
  - po      (PEGELONLINE):   "{station_uuid}:W" / "{station_uuid}:Q"
  - sx      (Saxony HWIMS):  "{station_id}:W" / "{station_id}:Q"
  All others:                "{local_id}:W" / "{local_id}:Q"  (stub, no reader yet)

Usage:
    python import_gauges.py [--dry-run]
    DATABASE_URL=postgresql://... python import_gauges.py
"""

import argparse
import csv
import json
import os
import re
import sys
from typing import Optional

import psycopg2
import psycopg2.extras

try:
    import urllib.request as _urllib
except ImportError:
    pass  # stdlib always present

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:6432/paddlemate",
)
DEFAULT_INPUT = os.path.join(os.path.dirname(__file__), "gauges.csv")


# ---------------------------------------------------------------------------
# Provider + source_id derivation
# ---------------------------------------------------------------------------


_RZ_UUID_CACHE: Optional[dict] = None


def _load_rz_stations() -> dict:
    """Fetch riverzone.eu HTML and return a lookup: (river_lower, name_lower) -> uuid."""
    global _RZ_UUID_CACHE
    if _RZ_UUID_CACHE is not None:
        return _RZ_UUID_CACHE

    try:
        import urllib.request

        with urllib.request.urlopen("https://riverzone.eu/", timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    except Exception as exc:
        print(f"WARNING: could not fetch riverzone.eu: {exc}", file=sys.stderr)
        _RZ_UUID_CACHE = {}
        return _RZ_UUID_CACHE

    m = re.search(r"var\s+data\s*=\s*(\{.*?\})\s*;", html, re.DOTALL)
    if not m:
        print("WARNING: could not parse riverzone.eu data blob", file=sys.stderr)
        _RZ_UUID_CACHE = {}
        return _RZ_UUID_CACHE

    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError as exc:
        print(f"WARNING: riverzone.eu JSON parse error: {exc}", file=sys.stderr)
        _RZ_UUID_CACHE = {}
        return _RZ_UUID_CACHE

    lookup: dict = {}
    for uuid, station in data.get("stations", {}).items():
        name = station.get("name", "").strip().lower()
        river = station.get("river", "").strip().lower()
        # Store both (river, name) and name-only for fallback
        key = (river, name)
        lookup[key] = uuid
        # Also index by name alone for cases where river label differs
        if name not in lookup:
            lookup[name] = uuid

    _RZ_UUID_CACHE = lookup
    print(
        f"Loaded {len([k for k in lookup if isinstance(k, tuple)])} Riverzone stations",
        file=sys.stderr,
    )
    return _RZ_UUID_CACHE


def _resolve_rz_uuid(station_id: str) -> Optional[str]:
    """Resolve an rz.{id} CSV entry to a Riverzone station UUID.

    The CSV name field follows the pattern "{river} @ {station_name}".
    We match against the Riverzone page's (river, name) pairs.
    The caller must pass the original CSV station name via module-level
    _rz_name_map populated in derive_provider_and_source_ids.
    """
    # Name resolution is driven by the caller via _rz_name_map.
    return _rz_name_map.get(station_id)


# Maps rz local_id -> station UUID, populated during pre-processing in main.
_rz_name_map: dict = {}


def _nve_api_id(raw: str) -> str:
    """Convert "0002.00032.000" → "2.32.0" (strip leading zeros per segment)."""
    return ".".join(str(int(seg)) for seg in raw.split("."))


def derive_provider_and_source_ids(station_id: str, units: str, country: str = "AT"):
    """
    Return (provider_key, [(source_id, measurement_type, unit), ...]).

    measurement_type is 'water_level' or 'discharge'.
    Multiple tuples when a station has both level and flow series.
    """
    if "." in station_id:
        prefix, local_id = station_id.split(".", 1)
    else:
        # No prefix — derive from country
        if country == "CH":
            prefix = "bafu"
        elif country == "FR":
            prefix = "hubeau"
        else:
            prefix = "tirol"
        local_id = station_id

    is_level = units == "cm"
    is_discharge = units == "m³/s"

    if prefix == "tirol":
        provider = "tirol"
        if is_discharge:
            return provider, [(f"{local_id}:Q", "discharge", "m³/s")]
        else:
            return provider, [(f"{local_id}:W", "water_level", "cm")]

    elif prefix == "by":
        provider = "by"
        # Bavaria BLfU: lowercase w/q
        if is_discharge:
            return provider, [(f"{local_id}:q", "discharge", "m³/s")]
        else:
            return provider, [(f"{local_id}:w", "water_level", "cm")]

    elif prefix == "nve":
        provider = "nve"
        api_id = _nve_api_id(local_id)
        if is_discharge:
            return provider, [(f"{api_id}:1001", "discharge", "m³/s")]
        else:
            return provider, [(f"{api_id}:1000", "water_level", "m")]

    elif prefix == "vbg":
        provider = "vbg"
        if is_discharge:
            return provider, [(f"{local_id}:Q", "discharge", "m³/s")]
        else:
            return provider, [(f"{local_id}:W", "water_level", "cm")]

    elif prefix in ("ooe", "noe", "sbg", "stmk", "ktn"):
        provider = "ehyd"
        full = f"{prefix}.{local_id}"
        if is_discharge:
            return provider, [(f"{full}:Q", "discharge", "m³/s")]
        else:
            return provider, [(f"{full}:W", "water_level", "cm")]

    elif prefix == "pl":
        provider = "pl"
        if is_discharge:
            return provider, [(f"{local_id}:Q", "discharge", "m³/s")]
        else:
            return provider, [(f"{local_id}:W", "water_level", "cm")]

    elif prefix == "cz":
        provider = "cz"
        if is_discharge:
            return provider, [(f"{local_id}:Q", "discharge", "m³/s")]
        else:
            return provider, [(f"{local_id}:H", "water_level", "cm")]

    elif prefix == "bw":
        provider = "bw"
        if is_discharge:
            return provider, [(f"{local_id}:Q", "discharge", "m³/s")]
        else:
            return provider, [(f"{local_id}:W", "water_level", "cm")]

    elif prefix == "bw-x":
        # bw-x stations are in the same HVZ BW snapshot but use 3- or 4-digit IDs.
        # The BW reader adds one leading zero to derive the 5-digit snapshot key,
        # so we zero-pad local_id to 4 digits here to keep the convention.
        provider = "bw"
        padded = local_id.zfill(4)
        if is_discharge:
            return provider, [(f"{padded}:Q", "discharge", "m³/s")]
        else:
            return provider, [(f"{padded}:W", "water_level", "cm")]

    elif prefix == "po":
        # PEGELONLINE WSV — station UUID used directly as the identifier.
        provider = "po"
        if is_discharge:
            return provider, [(f"{local_id}:Q", "discharge", "m³/s")]
        else:
            return provider, [(f"{local_id}:W", "water_level", "cm")]

    elif prefix == "sx":
        # Saxony HWIMS RSS feed — station number used directly.
        provider = "sx"
        if is_discharge:
            return provider, [(f"{local_id}:Q", "discharge", "m³/s")]
        else:
            return provider, [(f"{local_id}:W", "water_level", "cm")]

    elif prefix == "bafu":
        # Swiss BAFU / FOEN via existenz.ch — uses :flow / :height suffixes.
        provider = "bafu"
        if is_discharge:
            return provider, [(f"{local_id}:flow", "discharge", "m³/s")]
        else:
            return provider, [(f"{local_id}:height", "water_level", "cm")]

    elif prefix == "hubeau":
        # French Hub'Eau Hydrométrie — uses :Q / :H suffixes.
        provider = "hubeau"
        if is_discharge:
            return provider, [(f"{local_id}:Q", "discharge", "m³/s")]
        else:
            return provider, [(f"{local_id}:H", "water_level", "cm")]

    elif prefix in ("rz",):
        provider = "rz"
        uuid = _rz_name_map.get(local_id)
        if uuid:
            key = uuid
        else:
            # UUID not resolved (non-IT station or lookup failed) – use
            # the numeric local_id as a fallback stub source_id.
            key = local_id
        if is_discharge:
            return provider, [(f"{key}:Q", "discharge", "m³/s")]
        else:
            return provider, [(f"{key}:W", "water_level", "cm")]

    else:
        # Generic stub for unimplemented providers
        provider = prefix
        if is_discharge:
            return provider, [(f"{local_id}:Q", "discharge", "m³/s")]
        else:
            return provider, [(f"{local_id}:W", "water_level", "cm")]


# ---------------------------------------------------------------------------
# Main import
# ---------------------------------------------------------------------------


def import_gauges(conn, rows: list[dict], dry_run: bool) -> None:
    stats = {
        "gauges": 0,
        "series": 0,
        "ranges": 0,
        "skipped_range": 0,
        "skipped_section": 0,
    }

    with conn.cursor() as cur:
        # Build a lookup: "River / Section name" -> feature_id
        # We need features that are of type 'whitewater' attached to sections
        cur.execute("""
            SELECT CONCAT(w.name, ' / ', s.name), f.id
            FROM features f
            JOIN water_sections s ON f.section_id = s.id
            JOIN waterways w ON s.waterway_id = w.id
            WHERE f.feature_type = 'whitewater'
        """)
        section_feature_map: dict[str, int] = dict(cur.fetchall())
        print(f"Loaded {len(section_feature_map)} section→feature mappings")

        for row in rows:
            station_id = row["station_id"]
            name = row["name"]
            lat = float(row["lat"]) if row["lat"] else None
            lon = float(row["lng"]) if row["lng"] else None
            units = row["units"]
            lw = float(row["lw"]) if row["lw"] not in ("", "None", None) else None
            mw = float(row["mw"]) if row["mw"] not in ("", "None", None) else None
            hw = float(row["hw"]) if row["hw"] not in ("", "None", None) else None

            # Parse river entries. Each entry is either:
            #   "River / Section"            — uses gauge-level lw/mw/hw
            #   "River / Section:lw:mw:hw"  — per-section override
            river_entries: list[
                tuple[str, float | None, float | None, float | None]
            ] = []
            for entry in row["rivers"].split("|"):
                entry = entry.strip()
                if not entry:
                    continue
                parts = entry.rsplit(":", 3)
                if len(parts) == 4:
                    section_name = parts[0].strip()
                    try:
                        s_lw = (
                            float(parts[1])
                            if parts[1].strip() not in ("", "None")
                            else None
                        )
                        s_mw = (
                            float(parts[2])
                            if parts[2].strip() not in ("", "None")
                            else None
                        )
                        s_hw = (
                            float(parts[3])
                            if parts[3].strip() not in ("", "None")
                            else None
                        )
                    except ValueError:
                        # Not a threshold suffix — treat whole thing as section name
                        section_name = entry
                        s_lw, s_mw, s_hw = lw, mw, hw
                else:
                    section_name = entry
                    s_lw, s_mw, s_hw = lw, mw, hw
                river_entries.append((section_name, s_lw, s_mw, s_hw))

            provider, series_defs = derive_provider_and_source_ids(
                station_id, units, country=row.get("country", "AT")
            )

            if not dry_run:
                # Upsert the gauge
                cur.execute(
                    """
                    INSERT INTO gauges (name, provider, source_id, lat, lon)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (provider, source_id) DO UPDATE
                      SET name = EXCLUDED.name,
                          lat  = EXCLUDED.lat,
                          lon  = EXCLUDED.lon
                    RETURNING id
                """,
                    (name, provider, series_defs[0][0].rsplit(":", 1)[0], lat, lon),
                )
                gauge_id = cur.fetchone()[0]
            else:
                gauge_id = -1
            stats["gauges"] += 1

            for source_id, mtype, unit in series_defs:
                if not dry_run:
                    cur.execute(
                        """
                        INSERT INTO gauge_series (gauge_id, measurement_type, unit, source_id)
                        VALUES (%s, %s::measurement_type, %s, %s)
                        ON CONFLICT (gauge_id, measurement_type)
                        DO UPDATE SET source_id = EXCLUDED.source_id, unit = EXCLUDED.unit
                        RETURNING id
                    """,
                        (gauge_id, mtype, unit, source_id),
                    )
                    series_id = cur.fetchone()[0]
                else:
                    series_id = -1
                stats["series"] += 1

                for river_section, s_lw, s_mw, s_hw in river_entries:
                    # Skip if thresholds exist but are out of order
                    if s_lw is not None and s_mw is not None and s_lw >= s_mw:
                        stats["skipped_range"] += 1
                        continue
                    if s_mw is not None and s_hw is not None and s_mw >= s_hw:
                        stats["skipped_range"] += 1
                        continue

                    feature_id = section_feature_map.get(river_section)
                    if feature_id is None:
                        stats["skipped_section"] += 1
                        continue

                    if not dry_run:
                        cur.execute(
                            """
                            INSERT INTO feature_water_ranges
                              (feature_id, series_id, range_low, range_medium, range_high)
                            VALUES (%s, %s, %s, %s, %s)
                            ON CONFLICT (feature_id, series_id) DO UPDATE
                              SET range_low    = EXCLUDED.range_low,
                                  range_medium = EXCLUDED.range_medium,
                                  range_high   = EXCLUDED.range_high
                        """,
                            (feature_id, series_id, s_lw, s_mw, s_hw),
                        )
                    stats["ranges"] += 1

    if not dry_run:
        conn.commit()

    print(f"\nImport {'(dry-run) ' if dry_run else ''}complete:")
    print(f"  Gauges upserted:      {stats['gauges']}")
    print(f"  Series upserted:      {stats['series']}")
    print(f"  Water ranges upserted:{stats['ranges']}")
    print(f"  Ranges skipped (no thresholds): {stats['skipped_range']}")
    print(f"  Sections not found:   {stats['skipped_section']}")


def _build_rz_name_map(rows: list[dict]) -> None:
    """Populate _rz_name_map by matching rz.* CSV rows against Riverzone station names.

    The CSV name field for rz entries follows the pattern:
        "{river} @ {station_name}"   or   "{station_name}"
    We match against the Riverzone HTML lookup keyed by (river_lower, name_lower).
    """
    global _rz_name_map

    rz_rows = [r for r in rows if r["station_id"].startswith("rz.")]
    if not rz_rows:
        return

    station_lookup = _load_rz_stations()
    if not station_lookup:
        print(
            "WARNING: Riverzone UUID lookup is empty; rz stations will use numeric stub IDs",
            file=sys.stderr,
        )
        return

    resolved = 0
    for row in rz_rows:
        sid = row["station_id"]  # e.g. "rz.101"
        local_id = sid.split(".", 1)[1]  # "101"
        csv_name = row["name"]  # e.g. "Chiese @ Gavardo"

        if "@" in csv_name:
            river_part, name_part = csv_name.split("@", 1)
            river_key = river_part.strip().lower()
            name_key = name_part.strip().lower()
        else:
            river_key = ""
            name_key = csv_name.strip().lower()

        uuid = station_lookup.get((river_key, name_key)) or station_lookup.get(name_key)
        if uuid:
            _rz_name_map[local_id] = uuid
            resolved += 1
        # else: leave unmapped; derive_provider_and_source_ids will fall back to numeric id

    print(
        f"Resolved {resolved}/{len(rz_rows)} rz station UUIDs from riverzone.eu",
        file=sys.stderr,
    )


def main():
    parser = argparse.ArgumentParser(
        description="Import gauges.csv into the paddlemate DB"
    )
    parser.add_argument(
        "input", nargs="?", default=DEFAULT_INPUT, help="Path to gauges.csv"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Parse but don't write to DB"
    )
    args = parser.parse_args()

    with open(args.input, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    print(f"Read {len(rows)} gauges from {args.input}")

    # Pre-resolve Riverzone station UUIDs for all rz.* rows.
    _build_rz_name_map(rows)

    conn = psycopg2.connect(DATABASE_URL)
    try:
        import_gauges(conn, rows, dry_run=args.dry_run)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
