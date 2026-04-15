-- Extend feature_type enum with new types
-- PostgreSQL requires separate ALTER TYPE statements per value
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'weir';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'dam';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'obstacle';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'bridge';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'portage';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'put_in';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'take_out';
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'waterfall';

-- Multilingual names for features
CREATE TABLE feature_names (
    id BIGSERIAL PRIMARY KEY,
    feature_id BIGINT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    lang_code VARCHAR(10) NOT NULL,
    name VARCHAR(255) NOT NULL,
    UNIQUE (feature_id, lang_code)
);

CREATE INDEX idx_feature_names_feature_id ON feature_names(feature_id);

-- Multilingual descriptions for features
CREATE TABLE feature_descriptions (
    id BIGSERIAL PRIMARY KEY,
    feature_id BIGINT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    lang_code VARCHAR(10) NOT NULL,
    description TEXT NOT NULL,
    UNIQUE (feature_id, lang_code)
);

CREATE INDEX idx_feature_descriptions_feature_id ON feature_descriptions(feature_id);
