#!/usr/bin/env python3
"""
Enrich water_sections geometries by projecting each section's put-in/take-out
onto the OSM river centerline fetched from Overpass, then storing the sub-line
in the database.

Usage:
    python enrich_geometry.py [--waterway NAME] [--dry-run] [--limit N]
    DATABASE_URL=postgresql://... python enrich_geometry.py

Requires: shapely, requests, psycopg2-binary (already in venv)
"""

import argparse
import json
import os
import sys
import time
import urllib.parse
from collections import defaultdict

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
) -> LineString | None:
    """Project put-in and take-out onto river line and return the sub-linestring."""
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
    return sub


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--waterway", help="Only process this waterway name (substring match)"
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, help="Max number of waterways to process")
    args = parser.parse_args()

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
            ST_NPoints(s.location)          AS npoints
        FROM waterways w
        JOIN water_sections s ON s.waterway_id = w.id
        ORDER BY w.id, s.id
    """)
    rows = cur.fetchall()

    by_waterway: dict[tuple, list] = defaultdict(list)
    for wid, wname, sid, pi_lon, pi_lat, to_lon, to_lat, npoints in rows:
        by_waterway[(wid, wname)].append((sid, pi_lon, pi_lat, to_lon, to_lat, npoints))

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
        already_rich = sum(1 for s in sections if (s[5] or 0) > 2)
        if already_rich == len(sections):
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

        for sid, pi_lon, pi_lat, to_lon, to_lat, npoints in sections:
            if (npoints or 0) > 2:
                print(f"  Section {sid}: already has {npoints} nodes, skipping")
                continue

            put_in = Point(pi_lon, pi_lat)
            take_out = Point(to_lon, to_lat)

            # Sanity: check distance to nearest point on river (degrees)
            dist_in = river.distance(put_in)
            dist_out = river.distance(take_out)
            if dist_in > 0.05 or dist_out > 0.05:
                print(
                    f"  Section {sid}: endpoints too far from OSM line ({dist_in:.4f}, {dist_out:.4f} deg), skipping"
                )
                skipped += 1
                continue

            sub = extract_subsection(river, put_in, take_out)
            if not sub:
                print(f"  Section {sid}: could not extract sub-section, skipping")
                skipped += 1
                continue

            geojson = json.dumps(sub.__geo_interface__)
            print(f"  Section {sid}: {npoints} → {len(sub.coords)} nodes")

            if not args.dry_run:
                cur.execute(
                    "UPDATE water_sections SET location = ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326) WHERE id = %s",
                    (geojson, sid),
                )
                updated += 1

    if not args.dry_run:
        conn.commit()

    cur.close()
    conn.close()
    print(f"\nDone — updated: {updated}, skipped: {skipped}, failed: {failed}")


if __name__ == "__main__":
    main()
