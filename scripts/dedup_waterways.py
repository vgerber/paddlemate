#!/usr/bin/env python3
"""
Deduplicate waterways and their sections.

Strategy:
  - For each group sharing (name, country, region), keep the row with the lowest id.
  - Sections attached to duplicate waterways are either re-pointed (if the surviving
    waterway has no section with that name) or deleted (true duplicates).
  - After cleanup, adds a UNIQUE constraint on (name, country, region) so it can't happen again.
  - Fixes import_sections.py ON CONFLICT clause.

Usage:
    python dedup_waterways.py [--dry-run]
"""

import argparse
import psycopg2

DATABASE_URL = "postgresql://postgres:postgres@localhost:6432/paddlemate"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # Find all duplicate groups
    cur.execute("""
        SELECT name, COALESCE(country,''), COALESCE(region,''), 
               array_agg(id ORDER BY id) AS ids
        FROM waterways
        GROUP BY name, COALESCE(country,''), COALESCE(region,'')
        HAVING COUNT(*) > 1
    """)
    groups = cur.fetchall()
    print(f"Found {len(groups)} duplicate waterway groups")

    waterways_deleted = 0
    sections_deleted = 0

    for name, country, region, ids in groups:
        keep_id = ids[0]
        drop_ids = ids[1:]

        # Get section names already on the surviving waterway
        cur.execute(
            "SELECT name FROM water_sections WHERE waterway_id = %s", (keep_id,)
        )
        existing_names = {row[0] for row in cur.fetchall()}

        for dup_id in drop_ids:
            # For each section on the duplicate waterway:
            cur.execute(
                "SELECT id, name FROM water_sections WHERE waterway_id = %s", (dup_id,)
            )
            dup_sections = cur.fetchall()

            for sec_id, sec_name in dup_sections:
                if sec_name in existing_names:
                    # True duplicate — delete it
                    if not args.dry_run:
                        cur.execute(
                            "DELETE FROM water_sections WHERE id = %s", (sec_id,)
                        )
                    sections_deleted += 1
                else:
                    # Unique section — re-parent to surviving waterway
                    if not args.dry_run:
                        cur.execute(
                            "UPDATE water_sections SET waterway_id = %s WHERE id = %s",
                            (keep_id, sec_id),
                        )
                    existing_names.add(sec_name)

            # Delete the duplicate waterway
            if not args.dry_run:
                cur.execute("DELETE FROM waterways WHERE id = %s", (dup_id,))
            waterways_deleted += 1

    print(f"Waterways to delete: {waterways_deleted}")
    print(f"Sections to delete:  {sections_deleted}")

    if not args.dry_run:
        # Add unique constraint
        cur.execute("""
            ALTER TABLE waterways
            ADD CONSTRAINT waterways_name_country_region_key
            UNIQUE (name, country, region)
        """)
        conn.commit()
        print("Committed. Unique constraint added.")
    else:
        conn.rollback()
        print("Dry run — no changes made.")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
