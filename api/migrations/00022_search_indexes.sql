-- Search performance indexes.
-- IF NOT EXISTS so the migration stays idempotent when an index was
-- created ahead of time on an existing deployment.

-- Area search: ST_DWithin(location::geography, ...) seq-scanned all sections,
-- computing geography distance against full river geometries (~540ms at 2.2k
-- sections). The expression index matches the ::geography cast in the query.
CREATE INDEX IF NOT EXISTS idx_water_sections_location_geog
    ON water_sections USING gist ((location::geography));

-- FK lookup used by waterway detail, water status, and the difficulty filter.
CREATE INDEX IF NOT EXISTS idx_features_section_id
    ON features (section_id);
