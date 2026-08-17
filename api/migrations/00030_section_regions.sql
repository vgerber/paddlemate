-- Sections can belong to several regions (valley, district, state, mountain
-- range), ordered most-specific-first, e.g. {Ötztal, Bezirk Imst, Tirol}.
-- Replaces the single free-text region column; existing values move into the
-- array as its only element.
ALTER TABLE water_sections
    ADD COLUMN regions TEXT[] NOT NULL DEFAULT '{}';

UPDATE water_sections
SET regions = ARRAY[btrim(region)]
WHERE region IS NOT NULL AND btrim(region) <> '';

ALTER TABLE water_sections
    DROP COLUMN region;
