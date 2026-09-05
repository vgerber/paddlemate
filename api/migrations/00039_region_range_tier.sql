-- Mountain ranges browse at their own zoom now, so they cache their own
-- tiles. They used to share the district tier, but a range covers whole
-- districts - drawing both at once stacked two sets of outlines that said
-- nothing about each other and left neither readable.
ALTER TABLE region_tiles DROP CONSTRAINT region_tiles_tier_check;
ALTER TABLE region_tiles ADD CONSTRAINT region_tiles_tier_check
    CHECK (tier IN ('states', 'ranges', 'districts', 'valleys', 'countries'));
