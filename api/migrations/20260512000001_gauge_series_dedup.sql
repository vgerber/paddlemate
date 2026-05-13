-- Remove duplicate gauge_series rows that were created without a source_id
-- (from imports before source_id was tracked). The newer rows (higher id)
-- have the correct source_id and are already referenced by water_ranges and
-- readings, so we delete the older NULL-source_id rows and their orphaned
-- water_ranges first.

DELETE FROM feature_water_ranges
WHERE series_id IN (
    SELECT id FROM gauge_series WHERE source_id IS NULL
);

DELETE FROM gauge_series WHERE source_id IS NULL;

-- Prevent future duplicates
ALTER TABLE gauge_series
    ADD CONSTRAINT gauge_series_gauge_id_mtype_key
    UNIQUE (gauge_id, measurement_type);
