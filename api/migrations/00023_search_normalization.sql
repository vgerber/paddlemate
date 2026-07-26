-- Normalized form used by every name search, and the view listing the names
-- that search matches against.
--
-- IMPORTANT: search_key() is the expression the trigram indexes in 00024 are
-- built on. Changing its definition does NOT rebuild those indexes: existing
-- entries keep the old normalization while new rows get the new one, and
-- searches silently return wrong results. Any migration that changes
-- search_key must REINDEX the four *_name_trgm indexes in the same migration.
-- A Postgres major upgrade or an unaccent update has the same effect, since
-- both can change the unaccent rules.
--
-- The Rust counterparts are models::lang for language codes and
-- query::waterways::search for the query side.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() is only STABLE because the one argument form looks up its
-- dictionary through search_path at call time. Pinning the dictionary makes
-- the result depend on the input alone, which is what an expression index
-- requires, and records a dependency so the extension cannot be dropped while
-- the indexes exist.
CREATE FUNCTION public.immutable_unaccent(txt text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    RETURN public.unaccent('public.unaccent'::regdictionary, txt);

-- Diacritics removed, lower case, and the German digraphs folded so that
-- "oetztaler" and "otztaler" agree. Applied to the stored name and to the
-- query alike, so it can only ever merge terms, never hide a match.
-- Punctuation is deliberately left alone: stripping non-ASCII characters
-- would erase names written in Cyrillic entirely.
CREATE FUNCTION public.search_key(txt text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    RETURN replace(
               replace(
                   replace(
                       replace(lower(public.immutable_unaccent(txt)), 'ss', 's'),
                       'oe', 'o'),
                   'ue', 'u'),
               'ae', 'a');

-- Every name a waterway can be found by, resolved to that waterway. New
-- searchable sources are added here rather than in the query layer. Rapid
-- names live only in feature_names; features have no plain name column.
CREATE VIEW public.searchable_names AS
    SELECT w.id AS waterway_id,
           NULL::bigint AS section_id,
           NULL::bigint AS feature_id,
           'waterway'::text AS source,
           NULL::varchar(10) AS lang_code,
           w.name,
           public.search_key(w.name) AS name_key
    FROM waterways w
UNION ALL
    SELECT ws.waterway_id, ws.id, NULL::bigint, 'section'::text, NULL::varchar(10),
           ws.name, public.search_key(ws.name)
    FROM water_sections ws
UNION ALL
    SELECT ws.waterway_id, ws.id, NULL::bigint, 'section_name'::text, sn.lang_code,
           sn.name, public.search_key(sn.name)
    FROM section_names sn
    JOIN water_sections ws ON ws.id = sn.section_id
UNION ALL
    SELECT ws.waterway_id, ws.id, f.id, 'feature_name'::text, fn.lang_code,
           fn.name, public.search_key(fn.name)
    FROM feature_names fn
    JOIN features f ON f.id = fn.feature_id
    JOIN water_sections ws ON ws.id = f.section_id;
