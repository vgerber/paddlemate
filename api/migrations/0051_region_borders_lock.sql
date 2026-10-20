CREATE OR REPLACE FUNCTION refresh_country_borders(code text) RETURNS void
    LANGUAGE plpgsql AS $$
BEGIN
    -- Fills store countries from separate tasks; two refreshes at once would
    -- both insert the same pair. The lock lasts until the writer commits.
    PERFORM pg_advisory_xact_lock(hashtext('country_borders'));
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

-- Re-storing a country with the same outline must not redo the refresh.
DROP TRIGGER regions_country_borders_upd ON regions;
CREATE TRIGGER regions_country_borders_upd
    AFTER UPDATE OF geom, country ON regions FOR EACH ROW
    WHEN (NEW.kind = 'country'
          AND (NEW.country IS DISTINCT FROM OLD.country
               OR NOT ST_OrderingEquals(NEW.geom, OLD.geom)))
    EXECUTE FUNCTION regions_country_borders_trg();
