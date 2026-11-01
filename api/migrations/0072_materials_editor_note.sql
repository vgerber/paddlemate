-- Research and import notes are for editors, not readers. They move to their
-- own column, which the API returns to admins only. `notes` stays: it holds
-- what a paddler wrote, and the running API still reads it.

ALTER TABLE materials
    ADD COLUMN editor_note TEXT,
    ADD CONSTRAINT chk_materials_editor_note CHECK (length(editor_note) <= 4000);

UPDATE materials
SET editor_note = notes, notes = NULL
WHERE created_by = 'system-catalogue'
  AND updated_by IS NULL
  AND notes IS NOT NULL;
