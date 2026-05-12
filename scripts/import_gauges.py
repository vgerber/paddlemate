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
  - tirol   (pure numbers):  "{hzbnr}:W"  / "{hzbnr}:Q"
  - by      (Bavaria BLfU):  "{local_id}:w" / "{local_id}:q"   (lowercase)
  - nve     (Norway):        "{api_station_id}:1000" (stage) / "{api_station_id}:1001" (discharge)
                              api_station_id = "2.32.0" from "nve.0002.00032.000"
  - vbg     (Vorarlberg):    "{WISID}:W"  / "{WISID}:Q"
  - ehyd    (AT provinces):  "{prefix.local_id}:W" / "{prefix.local_id}:Q"
                              prefix = ooe/noe/sbg/stmk/ktn
  - bafu    (Switzerland):   "{station_id}:height" / "{station_id}:flow"
  - hubeau  (France):        "{station_id}:H"  / "{station_id}:Q"
  All others:                "{local_id}:W" / "{local_id}:Q"  (stub, no reader yet)

Usage:
    python import_gauges.py [--dry-run]
    DATABASE_URL=postgresql://... python import_gauges.py
"""

import argparse
import csv
import os
import sys

import psycopg2
import psycopg2.extras

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:6432/paddlemate",
)
DEFAULT_INPUT = os.path.join(os.path.dirname(__file__), "gauges.csv")


# ---------------------------------------------------------------------------
# Provider + source_id derivation
# ---------------------------------------------------------------------------

def _nve_api_id(raw: str) -> str:
    """Convert "0002.00032.000" → "2.32.0" (strip leading zeros per segment)."""
    return ".".join(str(int(seg)) for seg in raw.split("."))


def derive_provider_and_source_ids(station_id: str, units: str):
    """
    Return (provider_key, [(source_id, measurement_type, unit), ...]).

    measurement_type is 'water_level' or 'discharge'.
    Multiple tuples when a station has both level and flow series.
    """
    if "." in station_id:
        prefix, local_id = station_id.split(".", 1)
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

    elif prefix in ("rz",):
        provider = "rz"
        if is_discharge:
            return provider, [(f"{local_id}:Q", "discharge", "m³/s")]
        else:
            return provider, [(f"{local_id}:W", "water_level", "cm")]

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
    stats = {"gauges": 0, "series": 0, "ranges": 0, "skipped_range": 0, "skipped_section": 0}

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

            river_names = [r.strip() for r in row["rivers"].split("|") if r.strip()]

            provider, series_defs = derive_provider_and_source_ids(station_id, units)

            if not dry_run:
                # Upsert the gauge
                cur.execute("""
                    INSERT INTO gauges (name, provider, source_id, lat, lon)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (provider, source_id) DO UPDATE
                      SET name = EXCLUDED.name,
                          lat  = EXCLUDED.lat,
                          lon  = EXCLUDED.lon
                    RETURNING id
                """, (name, provider, series_defs[0][0].rsplit(":", 1)[0], lat, lon))
                gauge_id = cur.fetchone()[0]
            else:
                gauge_id = -1
            stats["gauges"] += 1

            for (source_id, mtype, unit) in series_defs:
                if not dry_run:
                    cur.execute("""
                        INSERT INTO gauge_series (gauge_id, measurement_type, unit)
                        VALUES (%s, %s::measurement_type, %s)
                        ON CONFLICT DO NOTHING
                        RETURNING id
                    """, (gauge_id, mtype, unit))
                    row_result = cur.fetchone()
                    if row_result is None:
                        # Already existed — look it up
                        cur.execute("""
                            SELECT id FROM gauge_series
                            WHERE gauge_id = %s AND measurement_type = %s::measurement_type
                        """, (gauge_id, mtype))
                        series_id = cur.fetchone()[0]
                    else:
                        series_id = row_result[0]
                else:
                    series_id = -1
                stats["series"] += 1

                # Only link ranges when we have all three thresholds
                if lw is None or mw is None or hw is None:
                    stats["skipped_range"] += len(river_names)
                    continue
                if lw >= mw or mw >= hw:
                    stats["skipped_range"] += len(river_names)
                    continue

                for river_section in river_names:
                    feature_id = section_feature_map.get(river_section)
                    if feature_id is None:
                        stats["skipped_section"] += 1
                        continue

                    if not dry_run:
                        cur.execute("""
                            INSERT INTO feature_water_ranges
                              (feature_id, series_id, range_low, range_medium, range_high)
                            VALUES (%s, %s, %s, %s, %s)
                            ON CONFLICT (feature_id, series_id) DO UPDATE
                              SET range_low    = EXCLUDED.range_low,
                                  range_medium = EXCLUDED.range_medium,
                                  range_high   = EXCLUDED.range_high
                        """, (feature_id, series_id, lw, mw, hw))
                    stats["ranges"] += 1

    if not dry_run:
        conn.commit()

    print(f"\nImport {'(dry-run) ' if dry_run else ''}complete:")
    print(f"  Gauges upserted:      {stats['gauges']}")
    print(f"  Series upserted:      {stats['series']}")
    print(f"  Water ranges upserted:{stats['ranges']}")
    print(f"  Ranges skipped (no thresholds): {stats['skipped_range']}")
    print(f"  Sections not found:   {stats['skipped_section']}")


def main():
    parser = argparse.ArgumentParser(description="Import gauges.csv into the paddlemate DB")
    parser.add_argument("input", nargs="?", default=DEFAULT_INPUT, help="Path to gauges.csv")
    parser.add_argument("--dry-run", action="store_true", help="Parse but don't write to DB")
    args = parser.parse_args()

    with open(args.input, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    print(f"Read {len(rows)} gauges from {args.input}")

    conn = psycopg2.connect(DATABASE_URL)
    try:
        import_gauges(conn, rows, dry_run=args.dry_run)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
