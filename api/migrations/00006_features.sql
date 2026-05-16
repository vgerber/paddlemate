-- Features on a section with multilingual names and descriptions.

CREATE TABLE features (
    id           BIGSERIAL    PRIMARY KEY,
    section_id   BIGINT       NOT NULL REFERENCES water_sections(id) ON DELETE CASCADE,
    feature_type feature_type NOT NULL,
    metadata     JSONB        NOT NULL DEFAULT '{}',
    location     geometry(Geometry, 4326) NOT NULL,
    created_by   VARCHAR(255) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (section_id, created_by)
);

CREATE TABLE feature_names (
    id         BIGSERIAL    PRIMARY KEY,
    feature_id BIGINT       NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    lang_code  VARCHAR(10)  NOT NULL,
    name       VARCHAR(255) NOT NULL,
    UNIQUE (feature_id, lang_code)
);

CREATE INDEX idx_feature_names_feature_id ON feature_names(feature_id);

CREATE TABLE feature_descriptions (
    id          BIGSERIAL   PRIMARY KEY,
    feature_id  BIGINT      NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    lang_code   VARCHAR(10) NOT NULL,
    description TEXT        NOT NULL,
    UNIQUE (feature_id, lang_code)
);

CREATE INDEX idx_feature_descriptions_feature_id ON feature_descriptions(feature_id);
