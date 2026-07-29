-- Test data for public.search_key: a spelling and the key it must produce.
-- Add a line to extend. Rust (models::lang) and TypeScript (lib/text.ts) do
-- the same normalization and have to agree with this.
--
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f api/tests/sql/search_key_assertions.sql

CREATE TEMP VIEW cases (input, expected) AS VALUES
    ('Ötztaler Ache', 'otztaler ache'),  -- umlaut
    ('Soča',          'soca'),           -- caron
    ('Isère',         'isere'),          -- grave accent
    ('Weißenbach',    'weisenbach'),     -- eszett, one code point
    ('Wisła',         'wisla'),          -- stroked l
    ('Đakovo',        'dakovo'),         -- stroked d
    ('Ægir',          'agir'),           -- ligature
    ('Þjórsá',        'thjorsa'),        -- thorn becomes two letters
    ('Oetztaler',     'otztaler'),       -- oe spelling meets the umlaut
    ('Muenster',      'munster'),        -- ue likewise
    ('Weissenbach',   'weisenbach'),     -- ss likewise
    ('Ока',           'ока'),            -- Cyrillic lower-cased, not stripped
    ('Saint-Jean',    'saint-jean');     -- punctuation left alone

DO $$
DECLARE wrong text;
BEGIN
    SELECT string_agg(format('%s gave %L, wanted %L', input, public.search_key(input), expected), E'\n')
    INTO wrong
    FROM cases
    WHERE public.search_key(input) IS DISTINCT FROM expected;

    IF wrong IS NOT NULL THEN
        RAISE EXCEPTION E'search_key normalizes differently now:\n%', wrong;
    END IF;
END $$;

-- Losing one of these only shows up as production being slow, never as a wrong
-- answer, so nothing else would notice.
CREATE TEMP VIEW indexes (name) AS VALUES
    ('idx_waterways_name_trgm'),
    ('idx_water_sections_name_trgm'),
    ('idx_section_names_name_trgm'),
    ('idx_feature_names_name_trgm');

DO $$
DECLARE missing text;
BEGIN
    SELECT string_agg(name, ', ') INTO missing
    FROM indexes
    WHERE to_regclass('public.' || name) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'trigram indexes missing: %', missing;
    END IF;
END $$;
