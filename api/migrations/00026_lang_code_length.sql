-- Room for a full BCP 47 tag. VARCHAR(10) fits "zh-hant-hk" exactly and
-- nothing longer, so a legitimate tag such as "sr-latn-rs-x-paddle" was
-- rejected purely by the column width. 35 is the widest tag BCP 47 registers
-- in practice, and matches models::lang::MAX_LEN.
--
-- Widening a varchar is a catalogue-only change - no table rewrite, no
-- revalidation - and the CHECK and UNIQUE constraints stay valid because the
-- accepted set only grows.
--
-- searchable_names selects lang_code from two of these tables, and Postgres
-- refuses to alter a column a view depends on, so the view is dropped and
-- recreated unchanged apart from the widened cast on its NULL columns.

DROP VIEW public.searchable_names;

ALTER TABLE section_names ALTER COLUMN lang_code TYPE VARCHAR(35);
ALTER TABLE section_descriptions ALTER COLUMN lang_code TYPE VARCHAR(35);
ALTER TABLE feature_names ALTER COLUMN lang_code TYPE VARCHAR(35);
ALTER TABLE feature_descriptions ALTER COLUMN lang_code TYPE VARCHAR(35);

CREATE VIEW public.searchable_names AS
    SELECT w.id AS waterway_id,
           NULL::bigint AS section_id,
           NULL::bigint AS feature_id,
           'waterway'::text AS source,
           NULL::varchar(35) AS lang_code,
           w.name,
           public.search_key(w.name) AS name_key
    FROM waterways w
UNION ALL
    SELECT ws.waterway_id, ws.id, NULL::bigint, 'section'::text, NULL::varchar(35),
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
