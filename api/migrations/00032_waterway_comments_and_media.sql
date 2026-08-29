-- Comments on rivers, alongside the sections and features that already have
-- them; the table was already keyed by (entity_type, entity_id), so only the
-- allowed set changes.
ALTER TABLE comments DROP CONSTRAINT comments_entity_type_check;
ALTER TABLE comments ADD CONSTRAINT comments_entity_type_check
  CHECK (entity_type IN ('water_section', 'feature', 'waterway'));

-- A note about a river is rarely just chatter: a tree across the channel and
-- a trip report are different things and should not read alike. The
-- categories follow Riverzone's, whose note API is the reference for this
-- kind of field report.
ALTER TABLE comments ADD COLUMN category VARCHAR(30) NOT NULL DEFAULT 'info'
  CHECK (category IN ('urgent', 'danger_temporary', 'danger_cleared',
                      'danger_permanent', 'calibration', 'difficulty',
                      'current_conditions', 'regulations', 'logistics',
                      'info'));

-- Lifecycle, again after Riverzone: 'merged' is the useful one - an editor
-- folded the note into curated data (a feature, a description), so it stops
-- cluttering the thread without being deleted.
ALTER TABLE comments ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ok'
  CHECK (status IN ('ok', 'merged', 'outdated', 'spam'));

CREATE INDEX idx_comments_status ON comments (status);

-- Photos, videos and linked write-ups for a river. Only metadata lives here:
-- uploaded bytes are files under MEDIA_DIR addressed by storage_key, while
-- videos and blogs are just an external_url - the split whitewater.guide
-- makes with one media list covering all three.
CREATE TABLE media (
  id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('waterway')),
  entity_id BIGINT NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('photo', 'video', 'blog')),
  -- Path under MEDIA_DIR for an upload; the thumbnail is the same key with
  -- a .thumb suffix. Null for a video or blog.
  storage_key TEXT UNIQUE,
  -- Where a video or blog lives. Null for an upload.
  external_url TEXT,
  mime_type TEXT,
  width INT,
  height INT,
  byte_size BIGINT,
  caption TEXT,
  -- Attribution, the same duty we already take for gauge sources.
  copyright TEXT,
  license_name TEXT,
  license_url TEXT,
  -- Manual ordering, so a hero shot can lead the gallery.
  weight INT NOT NULL DEFAULT 0,
  -- Set when the item was posted as part of a comment rather than straight
  -- into the gallery; it disappears with that comment.
  comment_id BIGINT REFERENCES comments(id) ON DELETE CASCADE,
  uploaded_by VARCHAR(255) NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- An upload has a file, a link has a URL, never both and never neither.
  CONSTRAINT media_target_check CHECK (
    (kind = 'photo' AND storage_key IS NOT NULL AND external_url IS NULL)
    OR (kind IN ('video', 'blog') AND external_url IS NOT NULL AND storage_key IS NULL)
  )
);

CREATE INDEX idx_media_entity ON media (entity_type, entity_id, weight);
CREATE INDEX idx_media_comment ON media (comment_id);
CREATE INDEX idx_media_uploaded_by ON media (uploaded_by);
