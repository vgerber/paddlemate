-- Merge waterways that share the same name into a single row.
-- Sections from duplicates are re-parented to the surviving (lowest id) row.
-- country and region are concatenated with " / " for distinct values.

-- 0. Widen country to hold multi-country strings like "AT / CH / FR".
ALTER TABLE waterways ALTER COLUMN country TYPE VARCHAR(64);

-- 1. For each name group keep the lowest id as the survivor.
--    Build a mapping: duplicate_id -> survivor_id
CREATE TEMP TABLE waterway_merge_map AS
SELECT
    w.id                                                         AS dup_id,
    MIN(w.id) OVER (PARTITION BY w.name)                         AS keep_id
FROM waterways w;

-- 2. Re-parent sections from duplicates to their survivor.
UPDATE water_sections s
SET waterway_id = m.keep_id
FROM waterway_merge_map m
WHERE s.waterway_id = m.dup_id
  AND m.dup_id <> m.keep_id;

-- 3. Update the survivor row's country and region to include all values.
UPDATE waterways w
SET
    country = agg.countries,
    region  = agg.regions
FROM (
    SELECT
        MIN(id) AS keep_id,
        STRING_AGG(DISTINCT country, ' / ' ORDER BY country) AS countries,
        STRING_AGG(DISTINCT region,  ' / ' ORDER BY region)  AS regions
    FROM waterways
    GROUP BY name
) agg
WHERE w.id = agg.keep_id;

-- 4. Delete the duplicate rows (non-survivors).
DELETE FROM waterways
WHERE id IN (
    SELECT dup_id FROM waterway_merge_map WHERE dup_id <> keep_id
);

DROP TABLE waterway_merge_map;

-- 5. Replace the (name, country, region) constraint with a simpler (name) one.
ALTER TABLE waterways
    DROP CONSTRAINT IF EXISTS waterways_name_country_region_key;

ALTER TABLE waterways
    ADD CONSTRAINT waterways_name_key UNIQUE (name);
