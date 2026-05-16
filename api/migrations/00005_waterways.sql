-- Waterways (rivers, canals, etc.) and their sections.

CREATE TABLE waterways (
    id            BIGSERIAL    PRIMARY KEY,
    waterway_type waterway_type NOT NULL,
    name          VARCHAR(255) NOT NULL UNIQUE,
    description   TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE water_sections (
    id             BIGSERIAL    PRIMARY KEY,
    waterway_id    BIGINT       NOT NULL REFERENCES waterways(id) ON DELETE CASCADE,
    name           VARCHAR(255) NOT NULL,
    description    TEXT,
    region         VARCHAR(255),
    country        VARCHAR(2),
    river_km_start FLOAT,
    river_km_end   FLOAT,
    location       geometry(LineString, 4326) NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (waterway_id, name)
);
