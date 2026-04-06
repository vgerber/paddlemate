CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE waterway_type AS ENUM ('river');

-- Waterways (rivers, canals, etc.)
CREATE TABLE waterways (
    id BIGSERIAL PRIMARY KEY,
    waterway_type waterway_type NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sections of a waterway
CREATE TABLE water_sections (
    id BIGSERIAL PRIMARY KEY,
    waterway_id BIGINT NOT NULL REFERENCES waterways(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    location geometry(LineString, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE feature_type AS ENUM ('whitewater', 'freestyle_spot', 'hole', 'siphon');

-- Features on a section.
-- whitewater metadata: { "difficulty": "0"|"1"|"2"|"3"|"4"|"5"|"6"|"X" }
CREATE TABLE features (
    id BIGSERIAL PRIMARY KEY,
    section_id BIGINT NOT NULL REFERENCES water_sections(id) ON DELETE CASCADE,
    feature_type feature_type NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    -- Point, LineString, or Polygon in WGS84
    location geometry(Geometry, 4326) NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
