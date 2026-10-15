-- Region search: typo-tolerant names and English country names.
-- Region border lines: a precomputed neighbour lookup so the map's country
-- borders answer in milliseconds.

-- Fuzzy name search over regions. Same expression as the waterway *_name_trgm
-- indexes; this migration does not change search_key, so no REINDEX is due.
CREATE INDEX idx_regions_name_trgm
    ON regions USING gin (public.search_key(name) gin_trgm_ops);

-- The existing gist index is on the geography cast, which the plain
-- geometry && viewport tests never use.
CREATE INDEX regions_geom_2d_idx ON regions USING gist (geom);

-- English names (and common aliases) of countries, keyed by ISO code. OSM
-- names a country in its own language, so "Austria" is not in any region name.
CREATE TABLE country_names (
    country char(2) NOT NULL,
    name    text    NOT NULL,
    PRIMARY KEY (country, name)
);
CREATE INDEX idx_country_names_trgm
    ON country_names USING gin (public.search_key(name) gin_trgm_ops);

INSERT INTO country_names (country, name) VALUES
    ('AD', 'Andorra'), ('AL', 'Albania'), ('AT', 'Austria'),
    ('BA', 'Bosnia and Herzegovina'), ('BA', 'Bosnia'), ('BE', 'Belgium'),
    ('BG', 'Bulgaria'), ('BY', 'Belarus'), ('CH', 'Switzerland'),
    ('CY', 'Cyprus'), ('CZ', 'Czechia'), ('CZ', 'Czech Republic'),
    ('DE', 'Germany'), ('DK', 'Denmark'), ('EE', 'Estonia'),
    ('ES', 'Spain'), ('FI', 'Finland'), ('FR', 'France'),
    ('GB', 'United Kingdom'), ('GB', 'Great Britain'), ('GB', 'England'),
    ('GB', 'Scotland'), ('GB', 'Wales'), ('GG', 'Guernsey'),
    ('GR', 'Greece'), ('HR', 'Croatia'), ('HU', 'Hungary'),
    ('IE', 'Ireland'), ('IM', 'Isle of Man'), ('IS', 'Iceland'),
    ('IT', 'Italy'), ('JE', 'Jersey'), ('LI', 'Liechtenstein'),
    ('LT', 'Lithuania'), ('LU', 'Luxembourg'), ('LV', 'Latvia'),
    ('MC', 'Monaco'), ('MD', 'Moldova'), ('ME', 'Montenegro'),
    ('MK', 'North Macedonia'), ('MK', 'Macedonia'), ('MT', 'Malta'),
    ('NL', 'Netherlands'), ('NL', 'Holland'), ('NO', 'Norway'),
    ('PL', 'Poland'), ('PT', 'Portugal'), ('RO', 'Romania'),
    ('RS', 'Serbia'), ('RU', 'Russia'), ('SE', 'Sweden'),
    ('SI', 'Slovenia'), ('SK', 'Slovakia'), ('SM', 'San Marino'),
    ('TR', 'Turkey'), ('UA', 'Ukraine'), ('VA', 'Vatican City'),
    ('VA', 'Vatican'), ('XK', 'Kosovo');

-- Where two countries meet: the piece of one country's boundary within about
-- a kilometre of the other. Lets the browse listing name the country on the
-- far side of a border without a distance test on whole country polygons,
-- which took a minute at Europe scale. Built from simplified outlines because
-- it only decides which neighbours a viewport touches, never what is drawn.
CREATE TABLE country_borders (
    country   char(2) NOT NULL,
    neighbour char(2) NOT NULL,
    line      geometry(Geometry, 4326) NOT NULL,
    PRIMARY KEY (country, neighbour)
);
CREATE INDEX country_borders_line_idx ON country_borders USING gist (line);

CREATE FUNCTION refresh_country_borders(code text) RETURNS void
    LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM country_borders WHERE country = code OR neighbour = code;
    IF code IS NULL THEN
        RETURN;
    END IF;
    INSERT INTO country_borders (country, neighbour, line)
    WITH area AS (
        SELECT ST_Expand(ST_Extent(geom), 0.02) AS box
        FROM regions WHERE kind = 'country' AND country = code
    ),
    near AS (
        SELECT r.country,
               ST_SimplifyPreserveTopology(r.geom, 0.01) AS g,
               ST_SimplifyPreserveTopology(ST_Boundary(r.geom), 0.01) AS b
        FROM regions r, area
        WHERE r.kind = 'country' AND r.country IS NOT NULL
          AND (r.country = code OR r.geom && area.box)
    )
    SELECT a.country, o.country, ST_Union(ST_Intersection(a.b, ST_Buffer(o.g, 0.01)))
    FROM near a
    JOIN near o ON o.country <> a.country AND (a.country = code OR o.country = code)
    WHERE ST_DWithin(o.g, a.b, 0.01)
    GROUP BY a.country, o.country
    HAVING NOT ST_IsEmpty(ST_Union(ST_Intersection(a.b, ST_Buffer(o.g, 0.01))));
END
$$;

CREATE FUNCTION regions_country_borders_trg() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    -- The old code covers a changed outline; a changed code needs both.
    IF TG_OP <> 'INSERT' THEN
        PERFORM refresh_country_borders(OLD.country);
    END IF;
    IF TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND NEW.country IS DISTINCT FROM OLD.country) THEN
        PERFORM refresh_country_borders(NEW.country);
    END IF;
    RETURN NULL;
END
$$;

CREATE TRIGGER regions_country_borders_ins
    AFTER INSERT ON regions FOR EACH ROW WHEN (NEW.kind = 'country')
    EXECUTE FUNCTION regions_country_borders_trg();
CREATE TRIGGER regions_country_borders_upd
    AFTER UPDATE OF geom, country ON regions FOR EACH ROW WHEN (NEW.kind = 'country')
    EXECUTE FUNCTION regions_country_borders_trg();
CREATE TRIGGER regions_country_borders_del
    AFTER DELETE ON regions FOR EACH ROW WHEN (OLD.kind = 'country')
    EXECUTE FUNCTION regions_country_borders_trg();

SELECT refresh_country_borders(country)
FROM (SELECT DISTINCT country FROM regions WHERE kind = 'country' AND country IS NOT NULL) c;
