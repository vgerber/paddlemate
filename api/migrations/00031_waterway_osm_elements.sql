-- Cached OSM geometry per waterway, one row per OSM element. Centerline way
-- fragments serve the section wizard's river snapping without a live
-- Overpass round-trip; the generic geometry column leaves room for bank
-- polygons (natural=water areas) later. Filled by the fetch_osm_geometry
-- bin; a DELETE on the rows invalidates the cache.
CREATE TABLE waterway_osm_elements (
    waterway_id BIGINT NOT NULL REFERENCES waterways(id) ON DELETE CASCADE,
    osm_type    TEXT NOT NULL CHECK (osm_type IN ('way', 'relation')),
    osm_id      BIGINT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('centerline', 'bank')),
    geom        geometry(Geometry, 4326) NOT NULL,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (waterway_id, osm_type, osm_id)
);

CREATE INDEX waterway_osm_elements_geom_idx
    ON waterway_osm_elements USING GIST (geom);
