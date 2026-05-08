#!/usr/bin/env python3
"""
Import sections.json into the paddlemate database.

For each river → waterways row
For each section with put_in + take_out → water_sections row (LineString geometry)
For each section with a difficulty → features row (type=whitewater)

Point-only sections (coordinates only, length=0) are skipped for water_sections
but imported as a whitewater feature on a zero-length linestring.

Usage:
    python import_sections.py [sections.json]
    python import_sections.py --dry-run
    DATABASE_URL=postgresql://... python import_sections.py
"""

import argparse
import json
import os
import sys

import psycopg2
import psycopg2.extras

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:6432/paddlemate",
)
IMPORT_ACTOR = "rivermap-import"
DEFAULT_INPUT = os.path.join(os.path.dirname(__file__), "sections.json")


def linestring(p1: list[float], p2: list[float]) -> str:
    """WKT LineString from two [lat, lon] points (PostGIS expects lon lat)."""
    return f"LINESTRING({p1[1]} {p1[0]}, {p2[1]} {p2[0]})"


def point_linestring(p: list[float]) -> str:
    """Degenerate LineString (same point twice) for zero-length spots."""
    return f"LINESTRING({p[1]} {p[0]}, {p[1]} {p[0]})"


def import_data(conn, rivers: list[dict], dry_run: bool) -> None:
    stats = {"waterways": 0, "sections": 0, "features": 0, "skipped": 0}

    with conn.cursor() as cur:
        for river in rivers:
            river_name = river["name"]
            region = river["region"]
            country = river["country"]

            # --- waterway ---
            cur.execute(
                """
                INSERT INTO waterways (waterway_type, name, description)
                VALUES ('river', %s, %s)
                ON CONFLICT DO NOTHING
                RETURNING id
                """,
                (river_name, f"Imported from rivermap.org — {region}, {country}"),
            )
            row = cur.fetchone()
            if row:
                waterway_id = row[0]
                stats["waterways"] += 1
            else:
                # Already exists — look it up by name (best-effort; names not globally unique)
                cur.execute(
                    "SELECT id FROM waterways WHERE name = %s ORDER BY id LIMIT 1",
                    (river_name,),
                )
                existing = cur.fetchone()
                if not existing:
                    print(
                        f"  [WARN] Could not find or insert waterway '{river_name}', skipping river",
                        file=sys.stderr,
                    )
                    stats["skipped"] += len(river["sections"])
                    continue
                waterway_id = existing[0]

            for section in river["sections"]:
                sec_name = section["name"]
                put_in = section["put_in"]
                take_out = section["take_out"]
                coordinates = section["coordinates"]
                difficulty = section["difficulty"]
                length_km = section["length_km"]

                # Build geometry
                if put_in and take_out:
                    geom_wkt = linestring(put_in, take_out)
                    geom_start = put_in
                elif coordinates:
                    geom_wkt = point_linestring(coordinates)
                    geom_start = coordinates
                else:
                    print(
                        f"  [SKIP] {river_name} / {sec_name}: no coordinates",
                        file=sys.stderr,
                    )
                    stats["skipped"] += 1
                    continue

                # --- water_section ---
                cur.execute(
                    """
                    INSERT INTO water_sections (waterway_id, name, location)
                    VALUES (%s, %s, ST_GeomFromText(%s, 4326))
                    ON CONFLICT DO NOTHING
                    RETURNING id
                    """,
                    (waterway_id, sec_name, geom_wkt),
                )
                row = cur.fetchone()
                if row:
                    section_id = row[0]
                    stats["sections"] += 1
                else:
                    # Already exists — look it up
                    cur.execute(
                        "SELECT id FROM water_sections WHERE waterway_id = %s AND name = %s ORDER BY id LIMIT 1",
                        (waterway_id, sec_name),
                    )
                    existing = cur.fetchone()
                    if not existing:
                        print(
                            f"  [WARN] Could not find or insert section '{sec_name}', skipping",
                            file=sys.stderr,
                        )
                        stats["skipped"] += 1
                        continue
                    section_id = existing[0]

                # --- whitewater feature (difficulty) ---
                if difficulty:
                    cur.execute(
                        """
                        INSERT INTO features (section_id, feature_type, metadata, location, created_by)
                        VALUES (
                            %s,
                            'whitewater',
                            %s,
                            ST_GeomFromText(%s, 4326),
                            %s
                        )
                        ON CONFLICT DO NOTHING
                        """,
                        (
                            section_id,
                            json.dumps(
                                {"difficulty": difficulty, "length_km": length_km}
                            ),
                            geom_wkt,
                            IMPORT_ACTOR,
                        ),
                    )
                    if cur.rowcount:
                        stats["features"] += 1

    if dry_run:
        conn.rollback()
        print("\n[DRY RUN] rolled back — no changes committed", file=sys.stderr)
    else:
        conn.commit()

    print(
        f"\nDone: {stats['waterways']} waterways, {stats['sections']} sections, "
        f"{stats['features']} features inserted "
        f"({stats['skipped']} skipped)",
        file=sys.stderr,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import sections.json into paddlemate DB"
    )
    parser.add_argument(
        "input",
        nargs="?",
        default=DEFAULT_INPUT,
        help=f"Path to sections.json (default: {DEFAULT_INPUT})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and run queries but roll back at the end",
    )
    parser.add_argument(
        "--db",
        default=DATABASE_URL,
        help="Database URL (default: $DATABASE_URL or localhost:6432)",
    )
    args = parser.parse_args()

    print(f"Reading {args.input}…", file=sys.stderr)
    with open(args.input, encoding="utf-8") as f:
        rivers = json.load(f)
    print(f"Loaded {len(rivers)} rivers", file=sys.stderr)

    print(f"Connecting to {args.db}…", file=sys.stderr)
    conn = psycopg2.connect(args.db)
    try:
        import_data(conn, rivers, dry_run=args.dry_run)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
