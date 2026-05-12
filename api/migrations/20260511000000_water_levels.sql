CREATE TYPE measurement_type AS ENUM ('water_level', 'discharge', 'temperature');

CREATE TABLE gauges (
    id                  BIGSERIAL PRIMARY KEY,
    name                VARCHAR NOT NULL,
    provider            VARCHAR NOT NULL,
    source_id           VARCHAR NOT NULL,
    lat                 DOUBLE PRECISION,
    lon                 DOUBLE PRECISION,
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    fetch_interval_secs INT NOT NULL DEFAULT 900,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, source_id)
);

CREATE TABLE gauge_series (
    id               BIGSERIAL PRIMARY KEY,
    gauge_id         BIGINT NOT NULL REFERENCES gauges(id) ON DELETE CASCADE,
    measurement_type measurement_type NOT NULL,
    unit             VARCHAR NOT NULL,
    label            VARCHAR,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE gauge_readings (
    series_id   BIGINT NOT NULL REFERENCES gauge_series(id) ON DELETE CASCADE,
    measured_at TIMESTAMPTZ NOT NULL,
    value       DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (series_id, measured_at)
);

CREATE INDEX idx_gauge_readings_series_time ON gauge_readings (series_id, measured_at DESC);

CREATE TABLE feature_water_ranges (
    id           BIGSERIAL PRIMARY KEY,
    feature_id   BIGINT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    series_id    BIGINT NOT NULL REFERENCES gauge_series(id) ON DELETE CASCADE,
    range_low    DOUBLE PRECISION NOT NULL,
    range_medium DOUBLE PRECISION NOT NULL,
    range_high   DOUBLE PRECISION NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (feature_id, series_id),
    CHECK (range_low < range_medium AND range_medium < range_high)
);
