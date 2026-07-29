-- Which language codes are actually stored, and how many rows each.
--
-- Run this before applying the CHECK constraint from
-- api/migrations/00025_lang_code_check.sql to a database that already holds
-- user data. The constraint accepts lowercase BCP 47 tags only; any row not
-- matching the grammar below makes the migration fail on that table, and the
-- fix is a reviewed data migration, never an unattended delete.
--
-- Usage: psql "$DATABASE_URL" -f scripts/lang_code_census.sql

\echo '== every stored lang_code, with row counts =='

SELECT 'section_names' AS source, lang_code, count(*) AS rows
FROM section_names GROUP BY 1, 2
UNION ALL
SELECT 'section_descriptions', lang_code, count(*)
FROM section_descriptions GROUP BY 1, 2
UNION ALL
SELECT 'feature_names', lang_code, count(*)
FROM feature_names GROUP BY 1, 2
UNION ALL
SELECT 'feature_descriptions', lang_code, count(*)
FROM feature_descriptions GROUP BY 1, 2
ORDER BY 1, 2;

\echo '== rows the CHECK constraint would reject =='
\echo '   (empty means 00025 applies cleanly and no data migration is needed)'

WITH all_codes AS (
    SELECT 'section_names' AS source, id, lang_code FROM section_names
    UNION ALL SELECT 'section_descriptions', id, lang_code FROM section_descriptions
    UNION ALL SELECT 'feature_names', id, lang_code FROM feature_names
    UNION ALL SELECT 'feature_descriptions', id, lang_code FROM feature_descriptions
)
SELECT source,
       lang_code,
       count(*) AS rows,
       -- What normalization alone would turn it into. When this value already
       -- exists for the same entity, normalizing collides with the UNIQUE
       -- index and one of the two rows has to be dropped by hand.
       lower(replace(btrim(lang_code), '_', '-')) AS normalized,
       lower(replace(btrim(lang_code), '_', '-')) ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$'
           AS normalizing_is_enough,
       length(lower(replace(btrim(lang_code), '_', '-'))) AS normalized_length
FROM all_codes
WHERE lang_code !~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$'
GROUP BY 1, 2
ORDER BY 1, 2;
