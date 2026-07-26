-- Trigram indexes backing the name search.
--
-- A leading wildcard LIKE cannot use a btree, and the fuzzy operator %> has no
-- other index to fall back on, so without these every keystroke scans all four
-- name sources. GIN rather than GiST: the only thing GiST adds is the <->
-- distance operator for KNN ordering, which the tiered ranking does not use.
--
-- These are built on public.search_key from 00023 - see the warning there
-- before changing that function.
--
-- Note a query shorter than three characters extracts no trigrams, so GIN
-- degrades to a full index scan. That is acceptable at this data size.

CREATE INDEX IF NOT EXISTS idx_waterways_name_trgm
    ON waterways USING gin (public.search_key(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_water_sections_name_trgm
    ON water_sections USING gin (public.search_key(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_section_names_name_trgm
    ON section_names USING gin (public.search_key(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_feature_names_name_trgm
    ON feature_names USING gin (public.search_key(name) gin_trgm_ops);
