-- comments and media are keyed by (entity_type, entity_id), which no foreign
-- key can express, so deleting a river or a section used to leave its notes
-- and photos behind forever - through every path, including proposal
-- approval and the admin delete. Triggers put the guarantee in the database
-- rather than in each caller.
CREATE OR REPLACE FUNCTION delete_attached_content() RETURNS TRIGGER AS $$
BEGIN
  -- media rows attached to a note of this entity cascade with the note.
  DELETE FROM media WHERE entity_type = TG_ARGV[0] AND entity_id = OLD.id;
  DELETE FROM comments WHERE entity_type = TG_ARGV[0] AND entity_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER waterways_delete_attached
  BEFORE DELETE ON waterways
  FOR EACH ROW EXECUTE FUNCTION delete_attached_content('waterway');

CREATE TRIGGER water_sections_delete_attached
  BEFORE DELETE ON water_sections
  FOR EACH ROW EXECUTE FUNCTION delete_attached_content('water_section');

CREATE TRIGGER features_delete_attached
  BEFORE DELETE ON features
  FOR EACH ROW EXECUTE FUNCTION delete_attached_content('feature');

-- Clean up what the missing guarantee already left behind.
DELETE FROM media m
  WHERE m.entity_type = 'waterway'
    AND NOT EXISTS (SELECT 1 FROM waterways w WHERE w.id = m.entity_id);
DELETE FROM comments c
  WHERE (c.entity_type = 'waterway'
         AND NOT EXISTS (SELECT 1 FROM waterways w WHERE w.id = c.entity_id))
     OR (c.entity_type = 'water_section'
         AND NOT EXISTS (SELECT 1 FROM water_sections s WHERE s.id = c.entity_id))
     OR (c.entity_type = 'feature'
         AND NOT EXISTS (SELECT 1 FROM features f WHERE f.id = c.entity_id));
