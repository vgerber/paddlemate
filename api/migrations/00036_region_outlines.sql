-- Outlines of the regions sections are tagged with, imported from OSM by the
-- import_region_outlines bin so the river filter can offer a region as a
-- selectable area and the map can draw its boundary.
--
-- Keyed by (name, kind) rather than by OSM id: sections store region names,
-- and one named region can be several OSM elements - a valley is a chain of
-- natural=valley ways, never a single area. osm_ids keeps the provenance.
--
-- Geometry is simplified on import; the table serves map display and coarse
-- membership, not survey-grade boundaries. Valleys stay lines because OSM has
-- no valley areas, so they match sections within match_radius_m instead of by
-- containment.
CREATE TABLE regions (
    id             BIGSERIAL PRIMARY KEY,
    name           TEXT NOT NULL,
    kind           TEXT NOT NULL CHECK (kind IN ('valley', 'district', 'state', 'range')),
    country        VARCHAR(2),
    osm_ids        TEXT[] NOT NULL DEFAULT '{}',
    geom           geometry(Geometry, 4326) NOT NULL,
    -- Distance a section may be from the outline and still count as inside.
    -- Zero for areas, a valley's width for line geometry.
    match_radius_m INTEGER NOT NULL DEFAULT 0,
    fetched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (name, kind)
);

CREATE INDEX regions_geom_idx ON regions USING GIST ((geom::geography));
