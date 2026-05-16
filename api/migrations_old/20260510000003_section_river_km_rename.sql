ALTER TABLE water_sections RENAME COLUMN river_km TO river_km_start;
ALTER TABLE water_sections ADD COLUMN river_km_end FLOAT;
