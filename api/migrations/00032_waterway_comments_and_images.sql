-- Comments on rivers, alongside the sections and features that already have
-- them; the table was already keyed by (entity_type, entity_id), so only the
-- allowed set changes.
ALTER TABLE comments DROP CONSTRAINT comments_entity_type_check;
ALTER TABLE comments ADD CONSTRAINT comments_entity_type_check
  CHECK (entity_type IN ('water_section', 'feature', 'waterway'));

-- Photos of a river. Only metadata lives here: the bytes are files under
-- MEDIA_DIR, addressed by storage_key, so a dump stays small and the store
-- can move behind the key without touching rows.
CREATE TABLE images (
  id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('waterway')),
  entity_id BIGINT NOT NULL,
  -- Path under MEDIA_DIR; the thumbnail is the same key with a .thumb suffix
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  byte_size BIGINT NOT NULL,
  caption TEXT,
  uploaded_by VARCHAR(255) NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_images_entity ON images (entity_type, entity_id);
CREATE INDEX idx_images_uploaded_by ON images (uploaded_by);
