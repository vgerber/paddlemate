-- Pick the fuzzy search threshold from data instead of from taste.
--
-- The API ships SEARCH_WORD_SIMILARITY_THRESHOLD=0.5, which was chosen against
-- seven fixture rivers - far too few to say anything. Restore a production dump
-- and run this to see what the number costs and buys at that scale.
--
-- Usage: psql "$DATABASE_URL" -f scripts/tune_search_threshold.sql
--        psql "$DATABASE_URL" -v sample=500 -f scripts/tune_search_threshold.sql
--
-- Read-only. It compares word_similarity() against each candidate threshold
-- directly rather than using %>, which needs the GUC set per statement and an
-- index this script deliberately does not rely on. The two are equivalent:
-- `probe %> name` holds exactly when word_similarity(probe, name) >= threshold.
--
-- What to look for, in this order:
--   1. Part A must stay green. Those are the spellings the feature was built
--      for; a threshold that loses any of them is wrong whatever else it scores.
--   2. Recall in Part B - the share of typo probes that still find their own
--      name. Below ~0.8 the tolerance stops being useful.
--   3. Noise - distinct waterways returned per probe. This is what the user
--      scrolls past, and it grows faster than recall as the threshold drops.
--   4. Margin - target similarity minus the best wrong answer. A positive
--      median means the right river ranks first even when noise is high. It is
--      a property of the probes, not of the threshold, so the value repeats
--      down each kind's rows.

\if :{?sample}
\else
\set sample 200
\endif

\echo '== Part A - the spellings that must keep working =='

WITH probes(probe, must_match) AS (
    VALUES ('salzah',    'Salzach'),      -- dropped character
           ('vltaba',    'Vltava'),       -- wrong character
           ('oetztaler', 'Ötztaler'),     -- digraph for the umlaut
           ('soca',      'Soča'),         -- diacritic dropped
           ('isere',     'Isère'),        -- accent dropped
           ('weisenbach','Weißenbach'),   -- eszett spelled out, then folded
           ('wisla',     'Wisła')         -- stroked l
), thresholds(t) AS (
    SELECT generate_series(0.35, 0.70, 0.05)::real
), hits AS (
    SELECT p.probe,
           t.t,
           count(n.name) AS present,
           max(word_similarity(public.search_key(p.probe), n.name_key)) AS best
    FROM probes p
    CROSS JOIN thresholds t
    LEFT JOIN public.searchable_names n
           ON n.name ILIKE '%' || p.must_match || '%'
    GROUP BY 1, 2
)
SELECT t AS threshold,
       count(*) FILTER (WHERE present > 0 AND best >= t) AS matched,
       count(*) FILTER (WHERE present > 0) AS testable,
       string_agg(probe, ', ') FILTER (WHERE present > 0 AND best < t) AS lost,
       -- Rivers this database does not contain say nothing about the threshold.
       string_agg(probe, ', ') FILTER (WHERE present = 0) AS not_in_this_db
FROM hits
GROUP BY t
ORDER BY t;

\echo '== Part A2 - the false friend that must NOT match =='
\echo '   (best similarity of "salzach" against Otztaler Ache; stay below the threshold)'

SELECT max(word_similarity(public.search_key('salzach'), n.name_key)) AS best_wrong
FROM public.searchable_names n
WHERE n.name ILIKE '%tztaler%';

\echo '== Part B - recall, noise and margin over a random sample =='

WITH sampled AS (
    SELECT waterway_id, name, name_key
    FROM public.searchable_names
    WHERE length(name_key) >= 6
    ORDER BY random()
    LIMIT :sample
), probes AS (
    -- Three ways a real query goes wrong: a dropped character, two characters
    -- swapped, and a user who stopped typing early.
    SELECT waterway_id, name_key AS target, 'deletion' AS kind,
           overlay(name_key placing '' from length(name_key) / 2 for 1) AS probe
    FROM sampled
    UNION ALL
    SELECT waterway_id, name_key, 'transposition',
           overlay(name_key
                   placing substr(name_key, length(name_key) / 2 + 1, 1)
                        || substr(name_key, length(name_key) / 2, 1)
                   from length(name_key) / 2 for 2)
    FROM sampled
    UNION ALL
    SELECT waterway_id, name_key, 'prefix', left(name_key, 6)
    FROM sampled
), thresholds(t) AS (
    SELECT generate_series(0.35, 0.70, 0.05)::real
), scored AS (
    SELECT p.kind,
           p.probe,
           p.waterway_id,
           max(word_similarity(p.probe, n.name_key))
               FILTER (WHERE n.waterway_id = p.waterway_id) AS target_score,
           max(word_similarity(p.probe, n.name_key))
               FILTER (WHERE n.waterway_id <> p.waterway_id) AS distractor_score,
           array_agg(DISTINCT n.waterway_id) AS candidates,
           array_agg(DISTINCT word_similarity(p.probe, n.name_key)) AS scores
    FROM probes p
    CROSS JOIN public.searchable_names n
    GROUP BY 1, 2, 3
)
SELECT t AS threshold,
       kind,
       round(avg((target_score >= t)::int)::numeric, 3) AS recall,
       round(avg((
           SELECT count(DISTINCT c)
           FROM unnest(s.candidates, s.scores) AS u(c, score)
           WHERE score >= t
       ))::numeric, 1) AS rivers_returned,
       round(percentile_cont(0.5) WITHIN GROUP (
           ORDER BY target_score - coalesce(distractor_score, 0)
       )::numeric, 3) AS median_margin
FROM scored s
CROSS JOIN thresholds t
GROUP BY t, kind
ORDER BY t, kind;
