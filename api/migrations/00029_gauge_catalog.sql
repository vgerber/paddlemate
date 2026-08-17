-- Discovery catalog of gauge stations across all direct-poll providers.
--
-- Metadata only: no series, no readings, not fetched. It is the search and
-- map-pick surface for "all available gauges". A real `gauges` row is created
-- only when a station is linked to a feature (resolve_or_create_series_for_ref),
-- which is what activates fetching. Rivermap is not synced here - its stations
-- already live in `gauges`; the catalog search suppresses any catalog row that
-- already exists as a real gauge.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE gauge_catalog (
    provider     TEXT NOT NULL,               -- GaugeReader::provider_key
    station_id   TEXT NOT NULL,               -- StationInfo.station_id prefix (no ':W')
    name         TEXT,
    river        TEXT,                         -- station's own river name (recommendation signal)
    country      VARCHAR(2),
    lat          DOUBLE PRECISION,
    lon          DOUBLE PRECISION,
    geom         geometry(Point, 4326),        -- populated from lat/lon at upsert
    params       TEXT[] NOT NULL DEFAULT '{}', -- StationInfo.params, e.g. {W,Q}
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, station_id)
);

-- Spatial map-pick (radius search) and fuzzy name search.
CREATE INDEX gauge_catalog_geom_gix  ON gauge_catalog USING GIST (geom);
CREATE INDEX gauge_catalog_name_trgm ON gauge_catalog USING GIN (name gin_trgm_ops);
