-- Record who added a section: proposal submitter, admin creator, or
-- 'rivermap-import' for bulk-imported rows. Nullable for legacy rows whose
-- origin is unknown.
ALTER TABLE water_sections
    ADD COLUMN created_by VARCHAR(255);

-- Backfill imported sections: the rivermap import has always tagged the
-- whitewater feature it creates with created_by = 'rivermap-import', so the
-- owning section came from the same import.
UPDATE water_sections s
SET created_by = 'rivermap-import'
WHERE s.created_by IS NULL
  AND EXISTS (
    SELECT 1 FROM features f
    WHERE f.section_id = s.id AND f.created_by = 'rivermap-import'
  );
