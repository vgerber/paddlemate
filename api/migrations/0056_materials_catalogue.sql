-- The imported catalogue: paddles, colours, sources, and the mirrored product
-- images. The seed itself is the next migration, because a new enum value
-- cannot be used in the transaction that adds it.

ALTER TYPE material_category ADD VALUE IF NOT EXISTS 'paddle';
ALTER TYPE material_discipline ADD VALUE IF NOT EXISTS 'crossover';
ALTER TYPE material_discipline ADD VALUE IF NOT EXISTS 'freestyle';
ALTER TYPE material_discipline ADD VALUE IF NOT EXISTS 'other';

CREATE TYPE paddle_shaft AS ENUM ('straight', 'bent', 'cranked');
CREATE TYPE paddle_shaft_material AS ENUM (
    'carbon', 'fiberglass', 'aluminium', 'wood', 'plastic', 'hybrid'
);

ALTER TABLE materials
    ADD COLUMN colors           TEXT[] NOT NULL DEFAULT '{}',
    -- The year rests on a weak source (archive capture, listing year).
    ADD COLUMN year_approximate BOOLEAN NOT NULL DEFAULT false,
    -- Field name -> the page the value came from.
    ADD COLUMN sources          JSONB,
    ADD COLUMN notes            TEXT,
    ADD COLUMN blade_area_cm2   DOUBLE PRECISION,
    ADD COLUMN blade_length_cm  DOUBLE PRECISION,
    ADD COLUMN blade_width_cm   DOUBLE PRECISION,
    ADD COLUMN length_min_cm    DOUBLE PRECISION,
    ADD COLUMN length_max_cm    DOUBLE PRECISION,
    ADD COLUMN lengths_cm       DOUBLE PRECISION[],
    ADD COLUMN pieces           INT,
    ADD COLUMN shaft            paddle_shaft,
    ADD COLUMN shaft_material   paddle_shaft_material,
    ADD COLUMN blade_material   TEXT,
    ADD COLUMN feather_deg      INT[],
    ADD COLUMN shaft_diameter   TEXT,
    ADD CONSTRAINT chk_materials_extra_text CHECK (
        COALESCE(length(notes), 0) <= 4000 AND
        COALESCE(length(blade_material), 0) <= 80 AND
        COALESCE(length(shaft_diameter), 0) <= 40 AND
        COALESCE(cardinality(colors), 0) <= 40 AND
        length(array_to_string(colors, '|')) <= 2000 AND
        COALESCE(length(sources::text), 0) <= 20000
    ),
    ADD CONSTRAINT chk_materials_paddle CHECK (
        COALESCE(blade_area_cm2, 1) > 0 AND COALESCE(blade_area_cm2, 1) <= 2000 AND
        COALESCE(blade_length_cm, 1) > 0 AND COALESCE(blade_length_cm, 1) <= 200 AND
        COALESCE(blade_width_cm, 1) > 0 AND COALESCE(blade_width_cm, 1) <= 200 AND
        COALESCE(length_min_cm, 1) > 0 AND COALESCE(length_min_cm, 1) <= 400 AND
        COALESCE(length_max_cm, 1) > 0 AND COALESCE(length_max_cm, 1) <= 400 AND
        (length_min_cm IS NULL OR length_max_cm IS NULL OR length_max_cm >= length_min_cm) AND
        COALESCE(pieces, 1) BETWEEN 1 AND 8 AND
        COALESCE(cardinality(lengths_cm), 0) <= 20 AND
        COALESCE(cardinality(feather_deg), 0) <= 12
    );

-- One entry per category/brand/model/variant. The category joins the key so a
-- paddle and a boat of the same name can coexist; case and spacing are folded
-- as before.
DROP INDEX materials_identity_key;
CREATE UNIQUE INDEX materials_identity_key ON materials (
    category, lower(btrim(brand)), lower(btrim(model)), lower(btrim(COALESCE(variant, '')))
);

-- Owner of the imported rows. Never signs in.
INSERT INTO users (id, username) VALUES ('system-catalogue', 'catalogue')
ON CONFLICT (id) DO NOTHING;

CREATE TYPE material_image_status AS ENUM ('pending', 'fetched', 'failed', 'removed');

-- Product photos mirrored from the maker's site. Only links are seeded; the
-- mirror job downloads them into MEDIA_DIR. `removed` is a takedown: the file
-- is gone and the job never fetches the row again.
CREATE TABLE material_images (
    id          BIGSERIAL PRIMARY KEY,
    material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    source_url  TEXT NOT NULL,
    -- Lowercase host of source_url; the mirror allowlist is the set of these.
    host        TEXT NOT NULL,
    page_url    TEXT NOT NULL,
    credit      TEXT NOT NULL,
    file        TEXT,
    status      material_image_status NOT NULL DEFAULT 'pending',
    attempts    INT NOT NULL DEFAULT 0,
    fetched_at  TIMESTAMPTZ,
    error       TEXT,
    CONSTRAINT uq_material_images_source UNIQUE (material_id, source_url),
    CONSTRAINT chk_material_images_text CHECK (
        length(source_url) <= 1000 AND length(page_url) <= 1000 AND
        length(credit) <= 80 AND COALESCE(length(error), 0) <= 500 AND
        source_url LIKE 'https://%'
    ),
    CONSTRAINT chk_material_images_file CHECK ((status = 'fetched') = (file IS NOT NULL))
);

CREATE INDEX idx_material_images_material ON material_images (material_id, id);
CREATE INDEX idx_material_images_pending ON material_images (host, id) WHERE status = 'pending';

-- Hosts that answered 403 or 429; the job leaves them alone until the time
-- passes.
CREATE TABLE material_image_hosts (
    host          TEXT PRIMARY KEY,
    blocked_until TIMESTAMPTZ NOT NULL,
    reason        TEXT
);
