-- Photos paddlers upload to the wiki. They live beside the mirrored ones:
-- the same table, told apart by source_kind. An uploaded row keeps the
-- NOT NULL link columns filled with placeholders (a source_url under the
-- reserved .invalid domain, host 'upload.invalid', an empty page_url) so
-- code that reads the mirrored rows keeps working; the mirror job never
-- sees it because it only takes status 'pending'.
ALTER TABLE material_images
    ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'maker'
        CONSTRAINT chk_material_images_kind CHECK (source_kind IN ('maker', 'retailer', 'user')),
    ADD COLUMN uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN rights_confirmed_at TIMESTAMPTZ;

-- A file is held while the photo is fetched or waiting for review.
ALTER TABLE material_images DROP CONSTRAINT chk_material_images_file;
ALTER TABLE material_images ADD CONSTRAINT chk_material_images_file
    CHECK ((status IN ('fetched', 'review')) = (file IS NOT NULL));

-- An uploaded photo always has an uploader on record when it is created and
-- the rights statement.
ALTER TABLE material_images ADD CONSTRAINT chk_material_images_user_rights
    CHECK (source_kind <> 'user' OR rights_confirmed_at IS NOT NULL);

CREATE INDEX idx_material_images_uploader ON material_images (uploaded_by, created_at)
    WHERE source_kind = 'user';

-- Proposals about a photo upload.
ALTER TABLE proposals DROP CONSTRAINT proposals_entity_type_check;
ALTER TABLE proposals ADD CONSTRAINT proposals_entity_type_check
  CHECK (entity_type IN ('waterway', 'water_section', 'feature', 'material', 'material_photo'));
