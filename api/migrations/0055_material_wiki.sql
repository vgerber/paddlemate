-- The material wiki: the gear catalog paddlers search and compare.
--
-- One row per product variant, typed by category. Every category here is a
-- boat, so they share one set of hull spec columns; a category whose specs
-- have nothing in common with these (a paddle, a drysuit) gets its own
-- extension table keyed on material_id rather than more nullable columns.
--
-- Measurements are DOUBLE PRECISION in one unit per column, named in the
-- column, so comparing two entries never needs a unit conversion.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE material_category AS ENUM ('kayak', 'canoe', 'packraft', 'sup');

-- What the boat is built for. Drives the comparison's peer group: two
-- creekers are comparable, a creeker and a sea kayak are not.
CREATE TYPE material_discipline AS ENUM (
    'creek', 'river_runner', 'half_slice', 'playboat', 'slalom',
    'downriver', 'touring', 'sea', 'expedition', 'recreational'
);

CREATE TYPE material_construction AS ENUM (
    'plastic', 'composite', 'inflatable', 'folding', 'wood'
);

CREATE TABLE materials (
    id                    BIGSERIAL PRIMARY KEY,
    category              material_category NOT NULL,
    brand                 TEXT NOT NULL,
    model                 TEXT NOT NULL,
    -- Size or trim of the same model ("M", "Large", "Club"). A model sold in
    -- one size leaves this NULL.
    variant               TEXT,
    discipline            material_discipline,
    construction          material_construction,
    description           TEXT,
    year_from             INT,
    year_to               INT,
    length_cm             DOUBLE PRECISION,
    width_cm              DOUBLE PRECISION,
    height_cm             DOUBLE PRECISION,
    volume_l              DOUBLE PRECISION,
    weight_kg             DOUBLE PRECISION,
    cockpit_length_cm     DOUBLE PRECISION,
    cockpit_width_cm      DOUBLE PRECISION,
    paddler_weight_min_kg DOUBLE PRECISION,
    paddler_weight_max_kg DOUBLE PRECISION,
    product_url           TEXT,
    created_by            TEXT NOT NULL REFERENCES users(id),
    updated_by            TEXT REFERENCES users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_materials_brand      CHECK (length(btrim(brand)) BETWEEN 1 AND 80),
    CONSTRAINT chk_materials_model      CHECK (length(btrim(model)) BETWEEN 1 AND 80),
    CONSTRAINT chk_materials_text       CHECK (
        COALESCE(length(variant), 0) <= 80 AND
        COALESCE(length(description), 0) <= 4000 AND
        COALESCE(length(product_url), 0) <= 500
    ),
    CONSTRAINT chk_materials_year_range CHECK (
        COALESCE(year_from, 1950) BETWEEN 1900 AND 2100 AND
        COALESCE(year_to, 1950) BETWEEN 1900 AND 2100
    ),
    CONSTRAINT chk_materials_years      CHECK (year_to IS NULL OR year_from IS NULL OR year_to >= year_from),
    CONSTRAINT chk_materials_paddler    CHECK (paddler_weight_max_kg IS NULL OR paddler_weight_min_kg IS NULL OR paddler_weight_max_kg >= paddler_weight_min_kg),
    CONSTRAINT chk_materials_positive   CHECK (
        COALESCE(length_cm, 1) > 0 AND COALESCE(width_cm, 1) > 0 AND
        COALESCE(height_cm, 1) > 0 AND COALESCE(volume_l, 1) > 0 AND
        COALESCE(weight_kg, 1) > 0 AND COALESCE(cockpit_length_cm, 1) > 0 AND
        COALESCE(cockpit_width_cm, 1) > 0 AND
        COALESCE(paddler_weight_min_kg, 1) > 0 AND COALESCE(paddler_weight_max_kg, 1) > 0
    ),
    -- Ceilings no real boat reaches; they stop a typo or a hostile value from
    -- distorting every comparison it appears in.
    CONSTRAINT chk_materials_ceiling    CHECK (
        COALESCE(length_cm, 1) <= 2000 AND COALESCE(width_cm, 1) <= 500 AND
        COALESCE(height_cm, 1) <= 500 AND COALESCE(volume_l, 1) <= 2000 AND
        COALESCE(weight_kg, 1) <= 500 AND COALESCE(cockpit_length_cm, 1) <= 500 AND
        COALESCE(cockpit_width_cm, 1) <= 500 AND
        COALESCE(paddler_weight_min_kg, 1) <= 500 AND COALESCE(paddler_weight_max_kg, 1) <= 500
    )
);

-- One entry per brand/model/variant. Compared case- and space-insensitively
-- so "Pyranha Firecracker" cannot be entered twice under different casing.
CREATE UNIQUE INDEX materials_identity_key ON materials (
    lower(btrim(brand)), lower(btrim(model)), lower(btrim(COALESCE(variant, '')))
);

-- The wiki's own name search. Built on public.search_key like the river name
-- indexes, so a misspelled brand still finds the boat - see 00023.
CREATE INDEX idx_materials_name_trgm
    ON materials USING gin (public.search_key(brand || ' ' || model) gin_trgm_ops);

-- Filters that narrow the list before anything is ranked.
CREATE INDEX idx_materials_category ON materials (category);
CREATE INDEX idx_materials_brand ON materials (lower(btrim(brand)));

-- The per-user daily cap on new entries counts a user's recent rows.
CREATE INDEX idx_materials_created_by ON materials (created_by, created_at);
