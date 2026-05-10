-- Move region/country from waterways to water_sections.
-- Rivers cross borders, so locality belongs on the section, not the waterway.

ALTER TABLE water_sections
    ADD COLUMN region  VARCHAR(255),
    ADD COLUMN country VARCHAR(2);

-- Drop from waterways (the merge migration widened these to hold "AT / CH" etc.)
ALTER TABLE waterways
    DROP COLUMN IF EXISTS country,
    DROP COLUMN IF EXISTS region;

DROP INDEX IF EXISTS idx_waterways_country;

-- Unique constraint enables proper ON CONFLICT in the import script.
ALTER TABLE water_sections
    ADD CONSTRAINT water_sections_waterway_id_name_key UNIQUE (waterway_id, name);
