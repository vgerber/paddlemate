-- Viewport tiles already fetched from OSM for the region browse layer, so
-- panning the map does not re-query Overpass for ground already covered.
--
-- One row per (tier, tile): a tier asks OSM for its own kinds - states at
-- country zoom, districts and ranges in between, valleys at river zoom - so
-- a tile fetched for one tier says nothing about the others.
CREATE TABLE region_tiles (
    tier       TEXT NOT NULL CHECK (tier IN ('states', 'districts', 'valleys')),
    x          INTEGER NOT NULL,
    y          INTEGER NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tier, x, y)
);
