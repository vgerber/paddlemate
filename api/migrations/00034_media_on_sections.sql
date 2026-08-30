-- Notes on a section can carry photos too, so media joins sections the way
-- comments already did: by widening the allowed set, not by a new table.
ALTER TABLE media DROP CONSTRAINT media_entity_type_check;
ALTER TABLE media ADD CONSTRAINT media_entity_type_check
  CHECK (entity_type IN ('waterway', 'water_section'));
