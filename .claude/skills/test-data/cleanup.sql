-- Removes everything created by seed.sql (all fixture ids are in the 9xxx range).
-- section_names and feature_names need no explicit delete: both cascade from
-- their parent section and feature.
BEGIN;
DELETE FROM descents WHERE id BETWEEN 9200 AND 9299;
DELETE FROM feature_water_ranges WHERE id BETWEEN 9600 AND 9699;
DELETE FROM gauge_readings WHERE series_id BETWEEN 9400 AND 9499;
DELETE FROM gauge_series WHERE id BETWEEN 9400 AND 9499;
DELETE FROM gauges WHERE id BETWEEN 9300 AND 9399;
DELETE FROM sources WHERE id IN ('9901', '9902');
DELETE FROM features WHERE id BETWEEN 9500 AND 9599;
DELETE FROM water_sections WHERE id BETWEEN 9100 AND 9199;
DELETE FROM waterways WHERE id BETWEEN 9001 AND 9099;
DELETE FROM api_tokens WHERE token_hash = 'ffd2e7ff161f619163861f2870c0fdf91508ae8851743d855d2661aa13738ec8';
COMMIT;
