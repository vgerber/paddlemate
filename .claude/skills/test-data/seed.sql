-- Paddlemate test fixture. All ids in the 9xxx range so cleanup.sql can
-- remove everything without touching real data.
--
-- The five paddlers below carry the same subjects as the local Keycloak realm
-- (keycloak/build-realm.sh), so signing in as any of them lands on exactly
-- this data. Change an id in one place and change it in the other.

\set vincent '5a5e307b-bd29-4f61-a9e3-b29df4cb1744'
\set mara    '9a1c0d4e-2b73-4f8a-9c15-6d2e8b7a4013'
\set tobi    'c4f27a86-5d19-4e62-b8a3-1f7c9e05d284'
\set aoife   'e83b5c17-9f42-4a0d-8e6b-3c15d7208af9'
\set jonas   '7d64e920-8a31-4c5f-b27e-05f3a9c61d48'

BEGIN;

-- Vincent is the admin you normally sign in as; the rest are the mates he
-- shares a club, a trip and his logs with. Ownership is spread across them so
-- "mine" and "someone else's" are different things in every list.
INSERT INTO users (id, username) VALUES
  (:'vincent', 'vincent'),
  (:'mara',    'mara'),
  (:'tobi',    'tobi'),
  (:'aoife',   'aoife'),
  (:'jonas',   'jonas')
ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username;

-- The club the shared logs and the trip are visible to.
INSERT INTO groups (id, name, description, created_by)
VALUES (9001, 'Innsbruck Paddlers', 'The regular Tuesday crew.', :'vincent');

INSERT INTO group_members (group_id, user_id, role, added_by) VALUES
  (9001, :'vincent', 'owner',  :'vincent'),
  (9001, :'mara',    'admin',  :'vincent'),
  (9001, :'tobi',    'member', :'vincent'),
  (9001, :'aoife',   'member', :'mara'),
  (9001, :'jonas',   'member', :'mara');

-- A follow graph with one request still pending, so the social tab and the
-- follow-request path both have something to show.
INSERT INTO user_follows (follower_id, following_id, status) VALUES
  (:'vincent', :'mara',    'accepted'),
  (:'mara',    :'vincent', 'accepted'),
  (:'tobi',    :'vincent', 'accepted'),
  (:'aoife',   :'vincent', 'pending');

-- Waterway with three sections. Each section has put_in and take_out
-- features at the ends of its line, like a normal entry.
INSERT INTO waterways (id, waterway_type, name) VALUES (9001, 'river', 'Test River');

INSERT INTO water_sections (id, waterway_id, name, location) VALUES
  (9101, 9001, 'Upper Test', ST_GeomFromText('LINESTRING(11.0 47.0, 11.01 47.01)', 4326)),
  (9102, 9001, 'Lower Test', ST_GeomFromText('LINESTRING(11.01 47.01, 11.02 47.02)', 4326)),
  (9103, 9001, 'Empty Test', ST_GeomFromText('LINESTRING(11.02 47.02, 11.03 47.03)', 4326)),
  (9104, 9001, 'Low Water Test', ST_GeomFromText('LINESTRING(11.03 47.03, 11.04 47.04)', 4326)),
  (9105, 9001, 'High Water Test', ST_GeomFromText('LINESTRING(11.04 47.04, 11.05 47.05)', 4326)),
  (9106, 9001, 'Dry Test', ST_GeomFromText('LINESTRING(11.05 47.05, 11.06 47.06)', 4326)),
  (9107, 9001, 'Silent Gauge Test', ST_GeomFromText('LINESTRING(11.06 47.06, 11.07 47.07)', 4326));

INSERT INTO features (id, section_id, feature_type, location, created_by)
SELECT v.id, v.section_id, v.feature_type::feature_type, ST_GeomFromText(v.wkt, 4326), u.id
FROM (VALUES
  (9511, 9101, 'put_in',   'POINT(11.0 47.0)'),
  (9512, 9101, 'take_out', 'POINT(11.01 47.01)'),
  (9521, 9102, 'put_in',   'POINT(11.01 47.01)'),
  (9522, 9102, 'take_out', 'POINT(11.02 47.02)'),
  (9531, 9103, 'put_in',   'POINT(11.02 47.02)'),
  (9532, 9103, 'take_out', 'POINT(11.03 47.03)'),
  (9541, 9104, 'put_in',   'POINT(11.03 47.03)'),
  (9542, 9104, 'take_out', 'POINT(11.04 47.04)'),
  (9551, 9105, 'put_in',   'POINT(11.04 47.04)'),
  (9552, 9105, 'take_out', 'POINT(11.05 47.05)'),
  (9561, 9106, 'put_in',   'POINT(11.05 47.05)'),
  (9562, 9106, 'take_out', 'POINT(11.06 47.06)'),
  (9571, 9107, 'put_in',   'POINT(11.06 47.06)'),
  (9572, 9107, 'take_out', 'POINT(11.07 47.07)')
) AS v(id, section_id, feature_type, wkt)
CROSS JOIN (SELECT :'vincent'::varchar AS id) u;

-- Whitewater features with a difficulty label (shown as a chip in the
-- section list), matching the shape the rivermap import produces. The zone
-- spans the whole section: whitewater starts at the put-in and ends at the
-- take-out.
INSERT INTO features (id, section_id, feature_type, metadata, location, created_by)
SELECT v.id, v.section_id, 'whitewater', v.meta::jsonb, ST_GeomFromText(v.wkt, 4326), u.id
FROM (VALUES
  (9523, 9102, '{"difficulty": "III", "length_km": 1.5}',   'LINESTRING(11.01 47.01, 11.02 47.02)'),
  (9543, 9104, '{"difficulty": "II", "length_km": 1.5}',    'LINESTRING(11.03 47.03, 11.04 47.04)'),
  (9553, 9105, '{"difficulty": "IV-V", "length_km": 1.5}',  'LINESTRING(11.04 47.04, 11.05 47.05)')
) AS v(id, section_id, meta, wkt)
CROSS JOIN (SELECT :'vincent'::varchar AS id) u;

-- A feature-rich section: Lower Test (9102) gets a run of rapids, hazards
-- and infrastructure between put-in and take-out, for testing the feature
-- timeline, map markers and per-feature water ranges (see 9607/9608 below).
INSERT INTO features (id, section_id, feature_type, metadata, location, created_by)
SELECT v.id, v.section_id, v.feature_type::feature_type, v.meta::jsonb, ST_GeomFromText(v.wkt, 4326), u.id
FROM (VALUES
  (9524, 9102, 'rapid',    '{"difficulty": "III+"}', 'LINESTRING(11.012 47.012, 11.014 47.014)'),
  (9525, 9102, 'hole',     '{}',                     'POINT(11.013 47.013)'),
  (9526, 9102, 'weir',     '{}',                     'POINT(11.015 47.015)'),
  (9527, 9102, 'strainer', '{}',                     'POINT(11.016 47.016)'),
  (9528, 9102, 'portage',  '{}',                     'LINESTRING(11.0155 47.0155, 11.017 47.017)'),
  (9529, 9102, 'bridge',   '{}',                     'POINT(11.018 47.018)')
) AS v(id, section_id, feature_type, meta, wkt)
CROSS JOIN (SELECT :'vincent'::varchar AS id) u;

-- Gauge with a week of sinusoidal water-level readings, calibrated on the
-- put_in of Lower Test (9102) so that section shows a chart and water status.
-- 9401 has a week of readings (latest ~85 cm); 9402 ("Silent Gauge") is
-- calibrated but never polled, so its section shows the level fallback
-- without a reading. A gauge allows one series per measurement type.
-- fetch_interval_secs matches the seeded 2-hourly readings; staleness is
-- defined per gauge as "no reading within twice its own interval".
-- Two data sources so the attribution UI has both shapes to render: one
-- naming a common license, one stating none (the majority case upstream).
INSERT INTO sources (id, name, short_name, licensing_terms, website, country_code,
                     license_name, license_url) VALUES
  ('9901', 'Test Hydrographic Service', 'THS',
   'Data is not validated and is released by the authority under (CC BY 4.0)[https://creativecommons.org/licenses/by/4.0/]',
   'https://example.org/ths', 'AT', 'CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'),
  ('9902', 'Test Terms Authority', 'TTA',
   'Data is not validated. We are not aware of a formal license. Please publicly credit the station data and observations to the source organisation',
   'https://example.org/tta', 'DE', NULL, NULL);

-- 9301 carries a license, 9302 only a distributor, 9303 nothing at all.
INSERT INTO gauges (id, name, provider, source_id, data_source_id, fetch_interval_secs) VALUES
  (9301, 'Test Gauge', 'test', 'test-1', '9901', 7200),
  (9302, 'Silent Gauge', 'test', 'test-2', '9902', 7200);
INSERT INTO gauge_series (id, gauge_id, measurement_type, unit) VALUES
  (9401, 9301, 'water_level', 'cm'),
  (9402, 9302, 'water_level', 'cm');
INSERT INTO gauge_readings (series_id, measured_at, value)
SELECT 9401, NOW() - (n || ' hours')::interval, 85 + 30 * sin(n / 12.0)
FROM generate_series(0, 168, 2) AS n;

-- Water ranges chosen around the ~85 cm latest reading so the section list
-- shows every chip variant:
--   9102 medium (60/80/120), 9104 low (80/100/130), 9105 high (40/50/70),
--   9106 empty (100/120/150), 9107 calibrated but no readings,
--   9101 uncalibrated (plain reading), 9103 no gauge (no chip).
INSERT INTO feature_water_ranges (id, feature_id, series_id, range_low, range_medium, range_high) VALUES
  -- Section defaults sit on the whitewater features - the app treats the
  -- section-spanning whitewater range as each chart's default thresholds.
  (9601, 9523, 9401, 60, 80, 120),
  (9602, 9511, 9401, NULL, NULL, NULL),
  (9603, 9543, 9401, 80, 100, 130),
  (9604, 9553, 9401, 40, 50, 70),
  (9605, 9561, 9401, 100, 120, 150),
  (9606, 9571, 9402, 60, 80, 120),
  -- Per-feature ranges on Lower Test, same series as the section default
  -- (9601): selecting the rapid/hole in the timeline swaps the chart
  -- thresholds instead of stacking extra charts.
  (9607, 9524, 9401, 70, 90, 110),
  (9608, 9525, 9401, 50, 70, 90);

-- Descents spread across the crew, exercising every visibility branch,
-- multi-section membership, and band widths in the chart (short runs + a 36h
-- trip). Vincent owns two of them, so "mine" and "someone else's" both have
-- content in every list.
INSERT INTO descents (id, user_id, start_time, end_time, visibility_scope, name,
                      put_in_lat, put_in_lon, take_out_lat, take_out_lon)
SELECT v.id, v.user_id, NOW() - v.start_ago::interval,
       NOW() - v.start_ago::interval + v.duration::interval,
       v.scope::visibility_scope, v.name, v.pi_lat, v.pi_lon, v.to_lat, v.to_lon
FROM (VALUES
  (9201, :'vincent', '2 days', '2 hours',  'public',  'Public multi-section run', 47.0,  11.0,  47.02, 11.02),
  (9202, :'vincent', '1 day',  '1 hour',   'private', 'Private upper run',        47.0,  11.0,  47.01, 11.01),
  (9203, :'mara',    '3 days', '1 hour',   'public',  'Public lower-only run',    47.01, 11.01, 47.02, 11.02),
  (9204, :'tobi',    '6 days', '36 hours', 'public',  'Long weekend trip',        47.01, 11.01, 47.02, 11.02),
  -- Shared with the club: visible to every group member, nobody else
  (9205, :'aoife',   '4 days', '90 minutes', 'shared', 'Club evening lap',        47.03, 11.03, 47.04, 11.04),
  -- Shared with one named paddler: the user-audience branch
  (9206, :'jonas',   '5 days', '2 hours',  'shared',  'Scout, shared with Vincent', 47.04, 11.04, 47.05, 11.05),
  -- Somebody else's private log: invisible in the feed, but visible inside
  -- the trip it belongs to, which is the rule worth being able to check
  (9207, :'mara',    '2 days', '3 hours',  'private', 'Maras private scout',      47.01, 11.01, 47.02, 11.02)
) AS v(id, user_id, start_ago, duration, scope, name, pi_lat, pi_lon, to_lat, to_lon);

INSERT INTO descent_visible_groups (descent_id, group_id) VALUES (9205, 9001);
INSERT INTO descent_visible_users (descent_id, user_id) VALUES (9206, :'vincent');

INSERT INTO descent_sections (descent_id, section_id, sort_order) VALUES
  (9201, 9101, 1), (9201, 9102, 2),
  (9202, 9101, 1),
  (9203, 9102, 1),
  (9204, 9102, 1),
  (9205, 9104, 1),
  (9206, 9105, 1),
  (9207, 9102, 1);

-- Water levels captured when the descent was logged, shown on the log detail
-- page. One per descent section that has a calibrated gauge (9102).
INSERT INTO descent_section_water_snapshots
  (id, descent_id, section_id, series_id, gauge_id, gauge_name, unit, value,
   level, measured_at, range_low, range_medium, range_high)
VALUES
  (9210, 9201, 9102, 9401, 9301, 'Test Gauge', 'cm', 95,  'medium',
   NOW() - interval '2 days', 60, 80, 120),
  (9211, 9203, 9102, 9401, 9301, 'Test Gauge', 'cm', 72,  'low',
   NOW() - interval '3 days', 60, 80, 120),
  (9212, 9204, 9102, 9401, 9301, 'Test Gauge', 'cm', 126, 'high',
   NOW() - interval '6 days', 60, 80, 120);

-- Search fixture: real river names carrying the diacritics this app has to
-- cope with, plus translations and rapid names so every match source and
-- every special-character case can be exercised. Far too small to tune the
-- fuzzy similarity threshold on - that needs production-sized data.
INSERT INTO waterways (id, waterway_type, name) VALUES
  (9002, 'river', 'Ötztaler Ache'),   -- umlaut, and "oe" digraph typing
  (9003, 'river', 'Soča'),            -- caron
  (9004, 'river', 'Große Ohe'),       -- eszett
  (9005, 'river', 'Vltava'),          -- plain ASCII, typo target
  (9006, 'river', 'Wisła'),           -- stroked l, which NFD cannot decompose
  (9007, 'river', 'Salzach');         -- typo target

INSERT INTO water_sections (id, waterway_id, name, location) VALUES
  (9111, 9002, 'Wellerbrücke',     ST_GeomFromText('LINESTRING(10.90674 47.18817, 10.90534 47.18846, 10.90400 47.18938, 10.90395 47.18973, 10.90406 47.19046, 10.90368 47.19112, 10.90261 47.19200, 10.90234 47.19229, 10.90238 47.19276, 10.90291 47.19341, 10.90339 47.19370, 10.90355 47.19388, 10.90353 47.19442, 10.90310 47.19530, 10.90292 47.19602, 10.90254 47.19693, 10.90105 47.19831, 10.89899 47.20004, 10.89707 47.20135, 10.89590 47.20187, 10.89395 47.20216, 10.89192 47.20230, 10.88944 47.20189, 10.88829 47.20160, 10.88718 47.20167, 10.88608 47.20196, 10.88447 47.20184, 10.88371 47.20181, 10.88223 47.20221, 10.88012 47.20284)', 4326)),
  (9112, 9002, 'Ötz Stadtstrecke', ST_GeomFromText('LINESTRING(10.87998 47.20304, 10.87964 47.20391, 10.87960 47.20482, 10.87966 47.20542, 10.87935 47.20583, 10.87841 47.20662, 10.87758 47.20689, 10.87676 47.20709, 10.87558 47.20737, 10.87424 47.20773, 10.87307 47.20806, 10.87190 47.20867, 10.87129 47.20938, 10.87109 47.20992, 10.87100 47.21082, 10.87085 47.21124, 10.86982 47.21226, 10.86928 47.21266, 10.86816 47.21281, 10.86625 47.21260, 10.86449 47.21267, 10.86342 47.21317, 10.86318 47.21413, 10.86299 47.21544, 10.86254 47.21598, 10.86221 47.21613, 10.86063 47.21633, 10.85978 47.21642, 10.85923 47.21668, 10.85784 47.21768)', 4326)),
  (9121, 9003, 'Kršovec',          ST_GeomFromText('LINESTRING(13.6 46.3, 13.61 46.31)', 4326)),
  (9131, 9004, 'Weißenbach',       ST_GeomFromText('LINESTRING(13.4 48.9, 13.41 48.91)', 4326)),
  (9145, 9005, 'Čertovy proudy',   ST_GeomFromText('LINESTRING(14.3 48.8, 14.31 48.81)', 4326));

-- A German translation of a Czech section proves cross-language matching;
-- Kršovec/Krsovec proves the two spellings normalize to the same key.
INSERT INTO section_names (id, section_id, lang_code, name) VALUES
  (9701, 9111, 'de', 'Wellerbrücke'),
  (9702, 9111, 'en', 'Weller Bridge'),
  (9703, 9145, 'cs', 'Čertovy proudy'),
  (9704, 9145, 'de', 'Teufelsstromschnellen'),
  (9705, 9121, 'sl', 'Kršovec'),
  (9706, 9121, 'it', 'Krsovec');

-- Every section gets put_in and take_out at its line endpoints, like a real
-- entry; the named features sit between them.
INSERT INTO features (id, section_id, feature_type, location, created_by)
SELECT v.id, v.section_id, v.feature_type::feature_type, ST_GeomFromText(v.wkt, 4326), u.id
FROM (VALUES
  (9581, 9111, 'whitewater', 'LINESTRING(10.9 47.2, 10.91 47.21)'),
  (9582, 9145, 'whitewater', 'LINESTRING(14.3 48.8, 14.31 48.81)'),
  (9583, 9131, 'weir',       'POINT(13.405 48.905)'),
  (9584, 9112, 'hole',       'POINT(10.915 47.215)'),
  (9585, 9111, 'put_in',     'POINT(10.9 47.2)'),
  (9586, 9111, 'take_out',   'POINT(10.91 47.21)'),
  (9587, 9112, 'put_in',     'POINT(10.91 47.21)'),
  (9588, 9112, 'take_out',   'POINT(10.92 47.22)'),
  (9589, 9121, 'put_in',     'POINT(13.6 46.3)'),
  (9590, 9121, 'take_out',   'POINT(13.61 46.31)'),
  (9591, 9131, 'put_in',     'POINT(13.4 48.9)'),
  (9592, 9131, 'take_out',   'POINT(13.41 48.91)'),
  (9593, 9145, 'put_in',     'POINT(14.3 48.8)'),
  (9594, 9145, 'take_out',   'POINT(14.31 48.81)')
) AS v(id, section_id, feature_type, wkt)
CROSS JOIN (SELECT :'vincent'::varchar AS id) u;

-- Rapid names, the search source that has no untagged fallback column.
INSERT INTO feature_names (id, feature_id, lang_code, name) VALUES
  (9801, 9581, 'de', 'Riesenschlucht'),
  (9802, 9581, 'en', 'Giant Gorge'),
  (9803, 9582, 'cs', 'Šumavský slalom'),
  (9804, 9583, 'de', 'Hüttenwehr'),
  (9805, 9584, 'de', 'Grieß'),
  (9810, 9524, 'en', 'Slot Machine'),
  (9811, 9525, 'en', 'Big Hole'),
  (9812, 9526, 'de', 'Altes Wehr');

-- A second river paddled on a day that already has one, so the trip timeline
-- has something to group: that day lists both rivers, each with its sections.
INSERT INTO descents (id, user_id, start_time, end_time, visibility_scope, name,
                      put_in_lat, put_in_lon, take_out_lat, take_out_lon)
VALUES (9208, :'vincent', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '2 hours',
        'public', 'Wellerbruecke lap', 47.2, 10.9, 47.21, 10.91);

INSERT INTO descent_sections (descent_id, section_id, sort_order) VALUES (9208, 9111, 1);


-- API token "pm_testtoken123" for the first user (sha256 of the plain token).
INSERT INTO api_tokens (user_id, name, token_hash)
VALUES (:'vincent', 'test-data', 'ffd2e7ff161f619163861f2870c0fdf91508ae8851743d855d2661aa13738ec8');


-- Proposals, for reviewing on /proposals. Each one is placed so the review
-- map has something to judge it against: a feature lands on Lower Test
-- (9102) between that section's six existing features, a section lands on
-- Test River (9001) among its seven. Coordinates are spread along the
-- river rather than stacked on one point, so "does this fit / is this a
-- duplicate" is actually visible.
INSERT INTO proposals (id, entity_type, entity_id, operation, proposed_data, original_data, status, submitted_by, review_note, created_at)
SELECT v.id, v.entity_type, v.entity_id, v.operation, v.proposed_data,
       v.original_data, v.status, u.id, v.review_note, v.created_at
FROM (VALUES
  -- Feature in a clear gap between Slot Machine (9524) and Big Hole (9525)
  (9701, 'feature', NULL::bigint, 'create', jsonb_build_object(
     'waterway_id', 9001, 'section_id', 9102,
     'feature_type', 'rapid', 'metadata', jsonb_build_object('difficulty', 'III'),
     'name', 'Mittelschwall', 'description', 'Clean read-and-run wave train.',
     'lang_code', 'en', 'water_ranges', '[]'::jsonb,
     'location', jsonb_build_object('type', 'LineString',
       'coordinates', jsonb_build_array(jsonb_build_array(11.0145, 47.0145), jsonb_build_array(11.0148, 47.0148)))
   ), NULL::jsonb, 'pending', NULL, NOW() - INTERVAL '2 hours'),

  -- Same spot as the existing hole 9525, under another name: the duplicate
  -- the review map is meant to expose
  (9702, 'feature', NULL, 'create', jsonb_build_object(
     'waterway_id', 9001, 'section_id', 9102,
     'feature_type', 'hole', 'metadata', '{}'::jsonb,
     'name', 'Grosses Loch', 'description', 'Sticky hole river left.',
     'lang_code', 'en', 'water_ranges', '[]'::jsonb,
     'location', jsonb_build_object('type', 'Point',
       'coordinates', jsonb_build_array(11.01305, 47.01305))
   ), NULL, 'pending', NULL, NOW() - INTERVAL '5 hours'),

  -- Section continuing past Silent Gauge Test (9107), the clean case
  (9703, 'water_section', NULL, 'create', jsonb_build_object(
     'waterway_id', 9001, 'name', 'Gorge Test',
     'description', 'Continues below the last section.',
     'regions', jsonb_build_array('Test Valley', 'Test State'),
     'country', 'AT', 'translations', '[]'::jsonb, 'features', '[]'::jsonb,
     'location', jsonb_build_object('type', 'LineString',
       'coordinates', jsonb_build_array(jsonb_build_array(11.07, 47.07), jsonb_build_array(11.085, 47.085)))
   ), NULL, 'pending', NULL, NOW() - INTERVAL '1 day'),

  -- Section overlapping Low Water Test (9104): the duplicate stretch case
  (9704, 'water_section', NULL, 'create', jsonb_build_object(
     'waterway_id', 9001, 'name', 'Middle Run',
     'description', 'Overlaps an existing stretch.',
     'regions', jsonb_build_array('Test Valley'), 'country', 'AT',
     'translations', '[]'::jsonb, 'features', '[]'::jsonb,
     'location', jsonb_build_object('type', 'LineString',
       'coordinates', jsonb_build_array(jsonb_build_array(11.032, 47.032), jsonb_build_array(11.045, 47.045)))
   ), NULL, 'pending', NULL, NOW() - INTERVAL '2 days'),

  -- Update: the stored version must not be drawn under the proposed one
  (9705, 'water_section', 9101, 'update', jsonb_build_object(
     'waterway_id', 9001, 'name', 'Upper Test Gorge',
     'regions', jsonb_build_array('Test Valley', 'Test State'), 'country', 'AT',
     'location', jsonb_build_object('type', 'LineString',
       'coordinates', jsonb_build_array(jsonb_build_array(11.0 , 47.0), jsonb_build_array(11.008, 47.012)))
   ), jsonb_build_object('name', 'Upper Test', 'country', NULL,
     'regions', '[]'::jsonb), 'pending', NULL, NOW() - INTERVAL '3 days'),

  -- Feature update, same rule for the feature being changed
  (9706, 'feature', 9526, 'update', jsonb_build_object(
     'waterway_id', 9001, 'section_id', 9102, 'feature_type', 'weir',
     'metadata', jsonb_build_object('difficulty', 'IV'),
     'name', 'Altes Wehr (portage right)'
   ), jsonb_build_object('feature_type', 'weir', 'name', 'Altes Wehr',
     'metadata', '{}'::jsonb), 'pending', NULL, NOW() - INTERVAL '4 days'),

  -- A river has no geometry to compare - the no-context case
  (9707, 'waterway', NULL, 'create', jsonb_build_object(
     'name', 'Proposed Test Creek', 'description', 'A river nobody added yet.'
   ), NULL, 'pending', NULL, NOW() - INTERVAL '6 days'),

  -- Non-pending rows so the status tabs are not empty
  (9708, 'feature', NULL, 'create', jsonb_build_object(
     'waterway_id', 9001, 'section_id', 9102, 'feature_type', 'siphon',
     'metadata', '{}'::jsonb, 'name', 'Approved Siphon', 'lang_code', 'en',
     'location', jsonb_build_object('type', 'Point',
       'coordinates', jsonb_build_array(11.0165, 47.0165))
   ), NULL, 'approved', 'Matches the scout report.', NOW() - INTERVAL '8 days'),
  (9709, 'water_section', NULL, 'create', jsonb_build_object(
     'waterway_id', 9001, 'name', 'Rejected Duplicate',
     'regions', '[]'::jsonb, 'translations', '[]'::jsonb, 'features', '[]'::jsonb,
     'location', jsonb_build_object('type', 'LineString',
       'coordinates', jsonb_build_array(jsonb_build_array(11.011, 47.011), jsonb_build_array(11.019, 47.019)))
   ), NULL, 'rejected', 'Already covered by Lower Test.', NOW() - INTERVAL '9 days')
) AS v(id, entity_type, entity_id, operation, proposed_data, original_data, status, review_note, created_at)
CROSS JOIN (SELECT :'vincent'::varchar AS id) u;

-- Votes, so the list shows tallies rather than a column of zeroes.
INSERT INTO proposal_votes (proposal_id, user_id, vote)
SELECT p.id, u.id, p.vote
FROM (VALUES (9701, 1::smallint), (9703, 1::smallint), (9704, -1::smallint)) AS p(id, vote),
LATERAL (SELECT id FROM users ORDER BY created_at LIMIT 1) u;


-- Notes on the river, one per category worth seeing in a thread: a hazard
-- to lead with, a cleared one, conditions, logistics, and a merged note
-- that a client should fold away.
INSERT INTO comments (id, entity_type, entity_id, body, category, status, author_id, created_at, location)
SELECT v.id, v.entity_type, v.entity_id, v.body, v.category, v.status, u.id, v.created_at,
       CASE WHEN v.id = 9901 THEN ST_SetSRID(ST_MakePoint(11.0135, 47.0135), 4326) END
FROM (VALUES
  (9901, 'waterway', 9001, 'Tree across the channel just below the road bridge, river left is clear.', 'danger_temporary', 'ok', NOW() - INTERVAL '6 hours'),
  (9902, 'waterway', 9001, 'The strainer at the S-bend was cut out last weekend.', 'danger_cleared', 'ok', NOW() - INTERVAL '2 days'),
  (9903, 'waterway', 9001, 'Ran it at 85 cm, felt like a solid III+ rather than III.', 'difficulty', 'ok', NOW() - INTERVAL '3 days'),
  (9904, 'waterway', 9001, 'Parking at the take-out is now paid, 4 EUR a day.', 'logistics', 'ok', NOW() - INTERVAL '5 days'),
  (9905, 'waterway', 9001, 'New siphon on river right, marked it on the map.', 'danger_permanent', 'merged', NOW() - INTERVAL '9 days'),
  (9906, 'water_section', 9102, 'Portage the weir on the left, the ramp on the right is undercut.', 'danger_permanent', 'ok', NOW() - INTERVAL '1 day')
) AS v(id, entity_type, entity_id, body, category, status, created_at)
CROSS JOIN (SELECT :'vincent'::varchar AS id) u;

-- Two trips. The Oetztal week straddles today, so the day timeline has days
-- behind it (solid) and days ahead (planned), and its dates are relative so
-- that stays true whenever the fixture is seeded.
--
-- Rivers around the trip, so the demo has real water to plan against: the
-- bases sit among these, and a base's ring reaches the runs on its own list.
--
-- The courses are the real ones, taken from OpenStreetMap (waterway=river,
-- matched by name) and thinned to 30 points apiece. That is what makes the
-- lengths and the distances on the bases map true - Imster Schlucht really is
-- about nine kilometres, and a ring drawn to reach it really is that wide.
-- A hand-drawn line between two invented points looks like a river until you
-- measure anything with it.
--
-- To refresh or extend them, query Overpass for the river by name over the
-- valley's bbox and cut the named run out of the stitched way; the app's own
-- `fetch_osm_geometry` binary uses the same source for its centerline cache.
INSERT INTO waterways (id, waterway_type, name) VALUES
  (9008, 'river', 'Inn'),
  (9009, 'river', 'Sanna'),
  (9010, 'river', 'Pitze');

INSERT INTO water_sections (id, waterway_id, name, location) VALUES
  -- More of the Oetztaler Ache, up and down the valley from the bases.
  (9113, 9002, 'Oberlauf Laengenfeld',
   ST_GeomFromText('LINESTRING(10.95861 47.05510, 10.95760 47.05653, 10.95758 47.05709, 10.95840 47.05798, 10.95958 47.05909, 10.96020 47.05989, 10.96039 47.06031, 10.96024 47.06092, 10.95934 47.06229, 10.95922 47.06303, 10.95941 47.06363, 10.95964 47.06397, 10.96032 47.06470, 10.96077 47.06531, 10.96131 47.06643, 10.96227 47.06795, 10.96288 47.06892, 10.96306 47.06967, 10.96304 47.07009, 10.96291 47.07056, 10.96246 47.07121, 10.95935 47.07431, 10.95774 47.07614, 10.95712 47.07772, 10.95562 47.08147, 10.95434 47.08423, 10.95369 47.08538, 10.95227 47.08678, 10.95041 47.08845, 10.94930 47.08978)', 4326)),
  (9114, 9002, 'Tumpen',
   ST_GeomFromText('LINESTRING(10.91167 47.15018, 10.91166 47.15142, 10.91152 47.15351, 10.91107 47.15512, 10.90959 47.15794, 10.91005 47.16059, 10.91048 47.16250, 10.91093 47.16385, 10.91068 47.16704, 10.91096 47.16974, 10.91071 47.17191, 10.91045 47.17381, 10.91044 47.17551, 10.91123 47.17661, 10.91232 47.17762, 10.91243 47.17836, 10.91237 47.17912, 10.91220 47.17973, 10.91248 47.18038, 10.91239 47.18078, 10.91190 47.18092, 10.91150 47.18103, 10.91113 47.18142, 10.91091 47.18192, 10.91053 47.18212, 10.91048 47.18272, 10.90973 47.18370, 10.90982 47.18458, 10.90987 47.18526, 10.90963 47.18587)', 4326)),
  -- The Inn, the valley the Oetztal drains into.
  (9151, 9008, 'Imster Schlucht',
   ST_GeomFromText('LINESTRING(10.68117 47.20290, 10.68460 47.20332, 10.68668 47.20415, 10.68975 47.20656, 10.69345 47.20809, 10.69546 47.20878, 10.69891 47.20972, 10.70150 47.21180, 10.70378 47.21364, 10.70680 47.21519, 10.71024 47.21552, 10.71412 47.21604, 10.71728 47.21608, 10.72484 47.21624, 10.72848 47.21628, 10.74007 47.21630, 10.74887 47.21653, 10.75124 47.21675, 10.75437 47.21788, 10.75825 47.21933, 10.76290 47.22005, 10.76493 47.21941, 10.76795 47.21824, 10.77091 47.21689, 10.77467 47.21611, 10.77750 47.21474, 10.78097 47.21343, 10.78402 47.21275, 10.78624 47.21166, 10.78969 47.21126)', 4326)),
  (9152, 9008, 'Kronburg',
   ST_GeomFromText('LINESTRING(10.57037 47.14643, 10.57603 47.14819, 10.58032 47.15030, 10.58090 47.15169, 10.57989 47.15315, 10.57820 47.15372, 10.57409 47.15403, 10.57189 47.15454, 10.57179 47.15533, 10.57376 47.15636, 10.57803 47.15902, 10.58126 47.16024, 10.58971 47.16345, 10.59259 47.16664, 10.59461 47.16865, 10.59845 47.16955, 10.60088 47.17024, 10.60684 47.17338, 10.61140 47.17541, 10.61446 47.17672, 10.61797 47.18065, 10.62200 47.18263, 10.62883 47.18433, 10.63341 47.18533, 10.63906 47.18564, 10.64359 47.18802, 10.64569 47.19051, 10.64726 47.19298, 10.64750 47.19529, 10.64968 47.19702)', 4326)),
  (9161, 9009, 'Landecker Schlucht',
   ST_GeomFromText('LINESTRING(10.49577 47.12058, 10.49613 47.12144, 10.49607 47.12256, 10.49807 47.12528, 10.49869 47.12770, 10.49909 47.12811, 10.50163 47.12855, 10.50458 47.12973, 10.50626 47.13019, 10.50792 47.13112, 10.51033 47.13279, 10.51140 47.13422, 10.51228 47.13439, 10.51505 47.13322, 10.51806 47.13381, 10.52031 47.13531, 10.52270 47.13543, 10.52579 47.13615, 10.52814 47.13635, 10.53020 47.13681, 10.53167 47.13777, 10.53476 47.13853, 10.53776 47.13958, 10.54105 47.14071, 10.54252 47.14089, 10.54444 47.14067, 10.54589 47.14035, 10.55377 47.14061, 10.55811 47.14213, 10.56142 47.14328)', 4326)),
  -- The Pitztal, which is where the third base ends up.
  (9171, 9010, 'Wenns - Arzl',
   ST_GeomFromText('LINESTRING(10.73819 47.15515, 10.73723 47.15913, 10.73723 47.16104, 10.73802 47.16320, 10.73876 47.16451, 10.73893 47.16617, 10.74019 47.16803, 10.74053 47.16999, 10.74079 47.17144, 10.73901 47.17239, 10.74144 47.17368, 10.74279 47.17473, 10.74321 47.17592, 10.74378 47.17706, 10.74633 47.17871, 10.74790 47.17972, 10.74900 47.18183, 10.75094 47.18302, 10.75252 47.18415, 10.75360 47.18565, 10.75493 47.18707, 10.75502 47.18877, 10.75774 47.18998, 10.75708 47.19142, 10.75828 47.19246, 10.75893 47.19394, 10.76019 47.19565, 10.76120 47.19682, 10.76186 47.19763, 10.76353 47.19994)', 4326)),
  (9172, 9010, 'Pitztal Ausleitung',
   ST_GeomFromText('LINESTRING(10.81939 47.10003, 10.81695 47.10244, 10.81243 47.10604, 10.81004 47.10860, 10.80683 47.11104, 10.80447 47.11234, 10.79976 47.11214, 10.79732 47.11462, 10.79435 47.11607, 10.79250 47.11644, 10.79043 47.11789, 10.78773 47.11945, 10.78538 47.12058, 10.78283 47.12148, 10.77985 47.12149, 10.77855 47.12471, 10.77566 47.12576, 10.77268 47.12762, 10.76997 47.12837, 10.76640 47.13024, 10.76335 47.13151, 10.76055 47.13193, 10.75829 47.13290, 10.75546 47.13402, 10.75196 47.13562, 10.75059 47.13646, 10.74908 47.13783, 10.74596 47.14110, 10.74346 47.14463, 10.74035 47.14776)', 4326));

-- Country and regions as OpenStreetMap gives them, so the place line under a
-- section survives a reseed. Normally `derive_section_regions` backfills these
-- from Overpass, which takes a request per section - too slow to want in a
-- fixture, and it would need the network to seed at all.
UPDATE water_sections ws SET country = v.country, regions = v.regions
FROM (VALUES
  (9111, 'AT', ARRAY['Ötztal', 'Bezirk Imst', 'Tirol', 'Ötztaler Alpen', 'Geigenkamm', 'Stubaier Alpen']),
  (9112, 'AT', ARRAY['Ötztal', 'Bezirk Imst', 'Tirol', 'Ötztaler Alpen', 'Geigenkamm', 'Stubaier Alpen']),
  (9113, 'AT', ARRAY['Ötztal', 'Bezirk Imst', 'Tirol', 'Ötztaler Alpen', 'Geigenkamm', 'Stubaier Alpen']),
  (9114, 'AT', ARRAY['Ötztal', 'Bezirk Imst', 'Tirol', 'Ötztaler Alpen', 'Geigenkamm', 'Stubaier Alpen']),
  (9151, 'AT', ARRAY['Oberinntal', 'Inntal', 'Bezirk Imst', 'Tirol', 'Lechtaler Alpen', 'Ötztaler Alpen', 'Geigenkamm']),
  (9152, 'AT', ARRAY['Oberinntal', 'Inntal', 'Bezirk Landeck', 'Tirol', 'Ötztaler Alpen', 'Kaunergrat-Venetberg-Kette', 'Lechtaler Alpen']),
  (9161, 'AT', ARRAY['Stanzer Tal', 'Bezirk Landeck', 'Tirol', 'Lechtaler Alpen']),
  (9171, 'AT', ARRAY['Pitztal', 'Bezirk Imst', 'Tirol', 'Ötztaler Alpen', 'Geigenkamm']),
  (9172, 'AT', ARRAY['Pitztal', 'Bezirk Imst', 'Tirol', 'Ötztaler Alpen', 'Geigenkamm'])
) AS v(id, country, regions)
WHERE ws.id = v.id;

-- Difficulty drives the chip on every watch list row, so each demo run has one.
INSERT INTO features (id, section_id, feature_type, metadata, location, created_by)
SELECT v.id, v.section_id, 'whitewater'::feature_type, v.meta::jsonb,
       ST_GeomFromText(v.wkt, 4326), u.id
FROM (VALUES
  (9601, 9113, '{"difficulty": "II-III", "length_km": 4.3}',
   'LINESTRING(10.95861 47.05510, 10.95840 47.05798, 10.96039 47.06031, 10.95922 47.06303, 10.96032 47.06470, 10.96227 47.06795, 10.96304 47.07009, 10.95935 47.07431, 10.95562 47.08147, 10.95227 47.08678)'),
  (9602, 9114, '{"difficulty": "IV", "length_km": 4.1}',
   'LINESTRING(10.91167 47.15018, 10.91107 47.15512, 10.91048 47.16250, 10.91096 47.16974, 10.91044 47.17551, 10.91243 47.17836, 10.91248 47.18038, 10.91150 47.18103, 10.91053 47.18212, 10.90982 47.18458)'),
  (9603, 9151, '{"difficulty": "III-IV", "length_km": 9.0}',
   'LINESTRING(10.68117 47.20290, 10.68975 47.20656, 10.69891 47.20972, 10.70680 47.21519, 10.71728 47.21608, 10.74007 47.21630, 10.75437 47.21788, 10.76493 47.21941, 10.77467 47.21611, 10.78402 47.21275)'),
  (9604, 9152, '{"difficulty": "II", "length_km": 9.8}',
   'LINESTRING(10.57037 47.14643, 10.58090 47.15169, 10.57409 47.15403, 10.57376 47.15636, 10.58971 47.16345, 10.59845 47.16955, 10.61140 47.17541, 10.62200 47.18263, 10.63906 47.18564, 10.64726 47.19298)'),
  (9605, 9161, '{"difficulty": "IV-V", "length_km": 6.2}',
   'LINESTRING(10.49577 47.12058, 10.49807 47.12528, 10.50163 47.12855, 10.50792 47.13112, 10.51228 47.13439, 10.52031 47.13531, 10.52814 47.13635, 10.53476 47.13853, 10.54252 47.14089, 10.55377 47.14061)'),
  (9606, 9171, '{"difficulty": "III", "length_km": 5.8}',
   'LINESTRING(10.73819 47.15515, 10.73802 47.16320, 10.74019 47.16803, 10.73901 47.17239, 10.74321 47.17592, 10.74790 47.17972, 10.75252 47.18415, 10.75502 47.18877, 10.75828 47.19246, 10.76120 47.19682)'),
  (9608, 9112, '{"difficulty": "II", "length_km": 2.7}',
   'LINESTRING(10.87998 47.20304, 10.87966 47.20542, 10.87758 47.20689, 10.87424 47.20773, 10.87129 47.20938, 10.87085 47.21124, 10.86816 47.21281, 10.86342 47.21317, 10.86254 47.21598, 10.85978 47.21642)'),
  (9607, 9172, '{"difficulty": "V", "length_km": 8.4}',
   'LINESTRING(10.81939 47.10003, 10.81004 47.10860, 10.79976 47.11214, 10.79250 47.11644, 10.78538 47.12058, 10.77855 47.12471, 10.76997 47.12837, 10.76055 47.13193, 10.75196 47.13562, 10.74596 47.14110)')
) AS v(id, section_id, meta, wkt), users u WHERE u.id = :'vincent';

-- Two real runs share the fixture's calibrated series, so a watch list of
-- real water still shows a live level - the whole point of the list. Must
-- come after the features above: the range hangs off the feature.
INSERT INTO feature_water_ranges (id, feature_id, series_id, range_low, range_medium, range_high) VALUES
  (9611, 9581, 9401, 60, 85, 120),
  (9612, 9602, 9401, 70, 95, 130),
  -- The rest of the demo runs, deliberately spread across the scale against
  -- the gauge's 85 cm: the watch dots are only worth looking at if they are
  -- not all one colour, and every level needs to appear somewhere.
  (9613, 9601, 9401, 100, 120, 150),  -- too low to bother
  (9614, 9603, 9401,  30,  50,  70),  -- high
  (9615, 9604, 9401,  60,  80, 120),  -- medium
  (9616, 9605, 9401,  70,  95, 130),  -- low
  (9617, 9606, 9401,  30,  50,  70),  -- high
  (9618, 9607, 9401, 100, 130, 160),  -- too low
  (9619, 9608, 9401,  60,  80, 120);  -- medium


-- Jonas is in the club but on neither trip, so signing in as him is how you
-- check that a trip is invisible to everyone who was not added to it.
INSERT INTO trips (id, name, description, start_date, end_date, created_by)
VALUES
  (9001, 'Oetztal week', 'Levels permitting - Wellerbruecke if it drops.',
   (NOW() - INTERVAL '3 days')::date, (NOW() + INTERVAL '3 days')::date,
   :'vincent'),
  -- Mara's other trip: Vincent is not on it, so the two users see different
  -- lists.
  (9002, 'Soca spring', 'Scouting week, small crew.',
   (NOW() + INTERVAL '40 days')::date, (NOW() + INTERVAL '47 days')::date,
   :'mara');

INSERT INTO trip_members (trip_id, user_id, role) VALUES
  (9001, :'vincent', 'admin'),
  (9001, :'mara',    'admin'),
  (9001, :'tobi',    'member'),
  (9001, :'aoife',   'member'),
  (9002, :'mara',    'admin'),
  (9002, :'tobi',    'member');

-- Attendance settles before the itinerary does: Vincent drives out a day
-- early (the timeline's Day -1), Tobias joins late, Aoife has not said yet.
-- Mara knows the day but not yet the hour she gets away, which is the normal
-- half-settled state and the one the UI has to read well.
INSERT INTO trip_member_attendance
  (trip_id, user_id, arrival, arrival_time, departure, departure_time) VALUES
  (9001, :'vincent', (NOW() - INTERVAL '4 days')::date, '19:30',
                     (NOW() + INTERVAL '3 days')::date, '11:00'),
  (9001, :'mara',    (NOW() - INTERVAL '3 days')::date, '08:15',
                     (NOW() + INTERVAL '3 days')::date, NULL),
  (9001, :'tobi',    (NOW() - INTERVAL '1 day')::date,  '22:45',
                     (NOW() + INTERVAL '2 days')::date, '16:00');

-- The base moves mid-trip, and the third one is still a placeholder with no
-- dates - the state a stay sits in while somebody is still ringing around.
INSERT INTO trip_stays (id, trip_id, kind, name, description, location, arrival, departure, created_by) VALUES
  (9011, 9001, 'camp', 'Camping Oetztal Arena', 'Cheap, loud, right by the get-out.',
   ST_SetSRID(ST_MakePoint(10.9555, 47.0700), 4326),
   (NOW() - INTERVAL '3 days')::date, (NOW())::date, :'vincent'),
  (9012, 9001, 'hotel', 'Gasthof Post',
   E'Landeck, so the **Sanna and the Inn** are both on the doorstep.\n\n'
   '- Drying room, which decides it\n'
   '- [Booking page](https://www.example.com/gasthof-post)\n'
   '- Ask for the group rate',
   ST_SetSRID(ST_MakePoint(10.5688, 47.1412), 4326),
   (NOW())::date, (NOW() + INTERVAL '3 days')::date, :'mara'),
  -- A rented house, which is the holiday_home kind, and the third colour on
  -- the bases map.
  (9014, 9001, 'holiday_home', 'Haus Pitztal', 'Whole house, own drying room.',
   ST_SetSRID(ST_MakePoint(10.7421, 47.1712), 4326),
   (NOW() + INTERVAL '3 days')::date, (NOW() + INTERVAL '5 days')::date, :'tobi'),
  -- Deliberately unplaced and undated: the state a base sits in while
  -- somebody is still ringing around, which the UI has to read well.
  (9013, 9001, 'other', 'Somewhere in the Stubai', NULL, NULL, NULL, NULL, :'tobi'),
  (9021, 9002, 'camp', 'Kamp Korita', NULL, NULL, NULL, NULL, :'mara');

-- The same section is watched from both bases: two places a few kilometres
-- apart reach the same water, and each keeps its own list.
-- Real runs only: a watch list is what the group can actually drive to, and
-- the ring drawn from it is only meaningful if the water is where the map
-- says it is. Test River stays out of these - it is the synthetic river the
-- gauge and search fixtures need, and parking it on a watch list stretched
-- every ring 24 km across the wrong valley.
-- A base watches its own valley first. The three sit in three different
-- ones - Oetztal, Inntal, Pitztal - so their rings cover different ground
-- and the map shows three reaches rather than one smear.
INSERT INTO trip_sections (id, stay_id, section_id, sort_order, status) VALUES
  -- 1. The camp at Laengenfeld: the Oetztaler Ache, top to bottom.
  (9031, 9011, 9113, 1, 'done'),
  (9032, 9011, 9114, 2, 'done'),
  (9036, 9011, 9111, 3, 'optional'),
  -- 2. The hotel at Landeck: the Sanna out of the door, the Inn both ways.
  (9034, 9012, 9161, 1, 'planned'),
  (9037, 9012, 9152, 2, 'planned'),
  (9035, 9012, 9151, 3, 'optional'),
  -- 3. The Pitztal house: its own valley, plus the Inn it drains into -
  -- which is the run the hotel also watches, from the other side.
  (9038, 9014, 9171, 1, 'planned'),
  (9039, 9014, 9172, 2, 'optional'),
  (9040, 9014, 9151, 3, 'planned');

-- Where to stay is what a group argues about, so the fixture ships an
-- argument in progress: two bases put up for the Oetztal week, one the group
-- likes and one it is split on. Both sit on the bases map as hollow markers
-- until somebody accepts them.
INSERT INTO trip_stay_candidates
  (id, trip_id, kind, name, description, location, arrival, departure, proposed_by)
VALUES
  (9051, 9001, 'holiday_home', 'Haus Wildspitze',
   'Whole house in Huben, ten minutes from the Wellerbruecke.',
   ST_SetSRID(ST_MakePoint(10.9280, 47.1490), 4326),
   (NOW() + INTERVAL '3 days')::date, (NOW() + INTERVAL '6 days')::date, :'mara'),
  (9052, 9001, 'camp', 'Camping Aufenfeld',
   'Cheaper, but it is an hour each way to anything we listed.',
   ST_SetSRID(ST_MakePoint(11.8600, 47.2400), 4326),
   NULL, NULL, :'tobi');

INSERT INTO trip_stay_candidate_votes (candidate_id, user_id, vote) VALUES
  -- Three for the house, nobody against.
  (9051, :'mara', 1),
  (9051, :'vincent', 1),
  (9051, :'tobi', 1),
  -- Split on the campsite, which is the state worth looking at.
  (9052, :'tobi', 1),
  (9052, :'vincent', -1);


-- Logs credited to the trip, including one private one of Mara's: inside the
-- trip every member sees it, in the public listing nobody but Mara does.
UPDATE descents SET trip_id = 9001 WHERE id IN (9201, 9203, 9205, 9207, 9208);


-- The explicit 9xxx ids above bypass the id sequences. Bump them past the
-- fixture range so rows created through the app get higher ids - otherwise
-- they sort before the fixture rows (breaking "first range wins" defaults)
-- and eventually collide with seeded ids.
SELECT setval(pg_get_serial_sequence(t, 'id'), 10000, true)
FROM unnest(ARRAY[
  'waterways', 'water_sections', 'features', 'feature_names',
  'section_names', 'gauges', 'gauge_series', 'feature_water_ranges',
  'descents', 'proposals', 'comments', 'media',
  'groups', 'trips', 'trip_stays', 'trip_sections'
]) AS t;

COMMIT;
