-- Material wiki entries can be proposed like rivers, sections and features.
ALTER TABLE proposals DROP CONSTRAINT proposals_entity_type_check;
ALTER TABLE proposals ADD CONSTRAINT proposals_entity_type_check
  CHECK (entity_type IN ('waterway', 'water_section', 'feature', 'material'));
