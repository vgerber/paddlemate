#!/usr/bin/env python3
"""
Enrich water_sections geometries by projecting each section's put-in/take-out
onto the OSM river centerline fetched from Overpass, then storing the sub-line
in the database.

Usage:
    python enrich_geometry.py [--waterway NAME] [--dry-run] [--limit N] [--log-file PATH]
    DATABASE_URL=postgresql://... python enrich_geometry.py

Progress is written to a JSONL log file (one entry per enriched section).
Re-runs skip sections already recorded in the log file.
The database is committed after each waterway so progress is never lost on abort.

Requires: shapely, requests, psycopg2-binary (already in venv)
"""

import argparse
import json
import os
import sys
import time
import urllib.parse
from collections import defaultdict
from datetime import datetime, timezone

import psycopg2
import requests
from shapely.geometry import LineString, MultiLineString, Point
from shapely.ops import linemerge
from shapely.ops import substring as shapely_substring

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:6432/paddlemate",
)
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
REQUEST_DELAY = 1.5
DEFAULT_LOG_FILE = "enrich_geometry_progress.jsonl"


def fetch_osm_ways(
    name: str, south: float, west: float, north: float, east: float
) -> list[list[tuple[float, float]]]:
    """Return list of coordinate lists for OSM waterway ways matching name in bbox."""
    # Escape special regex chars in name for Overpass regex
    safe_name = (
        name.replace("(", r"\(")
        .replace(")", r"\)")
        .replace(".", r"\.")
        .replace("+", r"\+")
    )
    query = f"""
[out:json][timeout:30];
(
  way["waterway"~"river|stream"]["name"~"{safe_name}",i]
    ({south},{west},{north},{east});
  way["waterway"~"river|stream"]["name:de"~"{safe_name}",i]
    ({south},{west},{north},{east});
);
out geom;
"""
    resp = requests.post(
        OVERPASS_URL,
        data=urllib.parse.urlencode({"data": query}),
        headers={
            "Accept": "*/*",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "paddlemate-enrich/1.0",
        },
        timeout=35,
    )
    resp.raise_for_status()
    data = resp.json()
    ways = []
    for elem in data.get("elements", []):
        if elem["type"] == "way" and "geometry" in elem:
            coords = [(n["lon"], n["lat"]) for n in elem["geometry"]]
            if len(coords) >= 2:
                ways.append(coords)
    return ways


def stitch_ways(ways: list[list[tuple]]) -> LineString | None:
    """Merge OSM way segments into the longest continuous linestring."""
    if not ways:
        return None
    lines = [LineString(w) for w in ways]
    merged = linemerge(lines)
    if merged.geom_type == "LineString":
        return merged
    if merged.geom_type == "MultiLineString":
        return max(merged.geoms, key=lambda l: l.length)
    return None


def extract_subsection(
    river: LineString, put_in: Point, take_out: Point
) -> tuple[LineString, float, float] | None:
    """Project put-in and take-out onto river line and return (sub-linestring, upstream_pos, downstream_pos)."""
    t0 = river.project(put_in, normalized=True)
    t1 = river.project(take_out, normalized=True)

    if abs(t0 - t1) < 0.001:
        return None

    start = min(t0, t1)
    end = max(t0, t1)
    length = river.length
    sub = shapely_substring(river, start * length, end * length)

    if sub.geom_type != "LineString" or len(sub.coords) < 2:
        return None
    return sub, start, end


def load_log(log_file: str) -> set[int]:
    """Return set of section IDs already recorded in the progress log."""
    done: set[int] = set()
    if not os.path.exists(log_file):
        return done
    with open(log_file, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                done.add(entry["section_id"])
            except (json.JSONDecodeError, KeyError):
                pass
    return done


def append_log(log_file: str, entry: dict) -> None:
    """Append a single JSON entry to the progress log (newline-delimited)."""
    entry.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
    with open(log_file, "a") as f:
        f.write(json.dumps(entry) + "\n")
        f.flush()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--waterway", help="Only process this waterway name (substring match)"
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, help="Max number of waterways to process")
    parser.add_argument(
        "--log-file",
        default=DEFAULT_LOG_FILE,
        help=f"JSONL progress file (default: {DEFAULT_LOG_FILE})",
    )
    args = parser.parse_args()

    done_sections = load_log(args.log_file)
    if done_sections:
        print(
            f"Resuming — {len(done_sections)} section(s) already in log, will skip them."
        )

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    cur.execute("""
        SELECT
            w.id, w.name,
            s.id,
            ST_X(ST_StartPoint(s.location)) AS put_in_lon,
            ST_Y(ST_StartPoint(s.location)) AS put_in_lat,
            ST_X(ST_EndPoint(s.location))   AS take_out_lon,
            ST_Y(ST_EndPoint(s.location))   AS take_out_lat,
            ST_NPoints(s.location)          AS npoints,
            s.river_km_start
        FROM waterways w
        JOIN water_sections s ON s.waterway_id = w.id
        ORDER BY w.id, s.id
    """)
    rows = cur.fetchall()

    by_waterway: dict[tuple, list] = defaultdict(list)
    for wid, wname, sid, pi_lon, pi_lat, to_lon, to_lat, npoints, river_km in rows:
        by_waterway[(wid, wname)].append(
            (sid, pi_lon, pi_lat, to_lon, to_lat, npoints, river_km)
        )

    if args.waterway:
        by_waterway = {
            k: v
            for k, v in by_waterway.items()
            if args.waterway.lower() in k[1].lower()
        }

    updated = skipped = failed = 0
    waterways = list(by_waterway.items())
    if args.limit:
        waterways = waterways[: args.limit]

    for i, ((wid, wname), sections) in enumerate(waterways):
        already_rich = sum(1 for s in sections if (s[5] or 0) > 2 and s[6] is not None)
        log_done = sum(1 for s in sections if s[0] in done_sections)
        if already_rich == len(sections) or log_done == len(sections):
            print(
                f"[{i + 1}/{len(waterways)}] {wname}: all sections already enriched, skipping"
            )
            continue

        all_lons = [s[1] for s in sections] + [s[3] for s in sections]
        all_lats = [s[2] for s in sections] + [s[4] for s in sections]
        pad = 0.03
        south, north = min(all_lats) - pad, max(all_lats) + pad
        west, east = min(all_lons) - pad, max(all_lons) + pad

        print(f"[{i + 1}/{len(waterways)}] {wname}: querying Overpass...", flush=True)
        try:
            ways = fetch_osm_ways(wname, south, west, north, east)
        except Exception as e:
            print(f"  Overpass error: {e}")
            failed += 1
            time.sleep(REQUEST_DELAY)
            continue
        time.sleep(REQUEST_DELAY)

        if not ways:
            print(f"  No OSM ways found")
            skipped += 1
            continue

        river = stitch_ways(ways)
        if not river:
            print(f"  Could not stitch {len(ways)} ways")
            skipped += 1
            continue

        print(f"  River line: {len(river.coords)} nodes from {len(ways)} ways")

        waterway_updated = 0
        for sid, pi_lon, pi_lat, to_lon, to_lat, npoints, river_km in sections:
            if sid in done_sections:
                print(f"  Section {sid}: already in log, skipping")
                continue
            if (npoints or 0) > 2 and river_km is not None:
                print(
                    f"  Section {sid}: already has {npoints} nodes and river_km, skipping"
                )
                continue

            put_in = Point(pi_lon, pi_lat)
            take_out = Point(to_lon, to_lat)

            # Snap endpoints to the nearest point on the river line.
            # If either is too far (> 0.05 deg) we still use the closest
            # point rather than skipping — the section is at least on the
            # right river.
            dist_in = river.distance(put_in)
            dist_out = river.distance(take_out)
            if dist_in > 0.05:
                snapped = river.interpolate(river.project(put_in))
                print(f"  Section {sid}: put-in {dist_in:.4f} deg from river, snapping")
                put_in = snapped
            if dist_out > 0.05:
                snapped = river.interpolate(river.project(take_out))
                print(
                    f"  Section {sid}: take-out {dist_out:.4f} deg from river, snapping"
                )
                take_out = snapped

            result = extract_subsection(river, put_in, take_out)
            if not result:
                print(f"  Section {sid}: could not extract sub-section, skipping")
                skipped += 1
                continue

            sub, upstream_pos, downstream_pos = result
            geojson = json.dumps(sub.__geo_interface__)
            print(
                f"  Section {sid}: {npoints} → {len(sub.coords)} nodes  ✓",
                flush=True,
            )

            if not args.dry_run:
                cur.execute(
                    "UPDATE water_sections SET location = ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), river_km_start = %s, river_km_end = %s WHERE id = %s",
                    (geojson, upstream_pos, downstream_pos, sid),
                )
                append_log(
                    args.log_file,
                    {
                        "section_id": sid,
                        "waterway_id": wid,
                        "waterway_name": wname,
                        "nodes": len(sub.coords),
                    },
                )
                done_sections.add(sid)
                waterway_updated += 1
                updated += 1

        # Commit after each waterway so progress survives an abort
        if not args.dry_run and waterway_updated:
            conn.commit()
            print(f"  Committed {waterway_updated} section(s) for {wname}")

    cur.close()
    conn.close()
    print(f"\nDone — updated: {updated}, skipped: {skipped}, failed: {failed}")


if __name__ == "__main__":
    main()
