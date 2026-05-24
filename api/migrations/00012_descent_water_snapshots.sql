-- Snapshot of water level readings at the time a descent is created.
-- Stored per (descent, gauge_series) so history is preserved even if
-- ranges or readings change later.

CREATE TYPE water_level AS ENUM ('empty', 'low', 'medium', 'high');

CREATE TABLE descent_section_water_snapshots (
    id           BIGSERIAL    PRIMARY KEY,
    descent_id   BIGINT       NOT NULL REFERENCES descents(id) ON DELETE CASCADE,
    section_id   BIGINT       NOT NULL REFERENCES water_sections(id),
    series_id    BIGINT       NOT NULL REFERENCES gauge_series(id),
    gauge_id     BIGINT       NOT NULL REFERENCES gauges(id),
    -- Denormalised so display works even if gauge is renamed later.
    gauge_name   TEXT         NOT NULL,
    unit         TEXT         NOT NULL,
    value        DOUBLE PRECISION,
    level        WATER_LEVEL  NOT NULL,
    measured_at  TIMESTAMPTZ,
    range_low    DOUBLE PRECISION,
    range_medium DOUBLE PRECISION,
    range_high   DOUBLE PRECISION,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX ON descent_section_water_snapshots (descent_id);
