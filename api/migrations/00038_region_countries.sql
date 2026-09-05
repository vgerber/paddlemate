-- Store country boundaries alongside the other regions so every region can
-- say which country it is in.
--
-- Only states carry an ISO code in their own OSM tags; districts, mountain
-- ranges and valleys carry nothing, so their country has to come from
-- geometry. Countries are kept as regions rather than in a table of their
-- own because the fetch, assembly and tile cache are the same in every
-- respect - they are simply never offered as a region to search in.
ALTER TABLE regions DROP CONSTRAINT regions_kind_check;
ALTER TABLE regions ADD CONSTRAINT regions_kind_check
    CHECK (kind IN ('valley', 'district', 'state', 'range', 'country'));

ALTER TABLE region_tiles DROP CONSTRAINT region_tiles_tier_check;
ALTER TABLE region_tiles ADD CONSTRAINT region_tiles_tier_check
    CHECK (tier IN ('states', 'districts', 'valleys', 'countries'));
