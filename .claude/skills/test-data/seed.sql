-- Paddlemate test fixture. All ids in the 9xxx range so cleanup.sql can
-- remove everything without touching real data.
-- Requires at least one row in users (log in once via Keycloak first).

BEGIN;

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
CROSS JOIN (SELECT id FROM users LIMIT 1) u;

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
CROSS JOIN (SELECT id FROM users LIMIT 1) u;

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
CROSS JOIN (SELECT id FROM users LIMIT 1) u;

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

-- Descents owned by the first user, exercising visibility, multi-section
-- membership, and band widths in the chart (short runs + a 36h trip).
INSERT INTO descents (id, user_id, start_time, end_time, visibility_scope, name,
                      put_in_lat, put_in_lon, take_out_lat, take_out_lon)
SELECT v.id, u.id, NOW() - v.start_ago::interval, NOW() - v.start_ago::interval + v.duration::interval,
       v.scope::visibility_scope, v.name, v.pi_lat, v.pi_lon, v.to_lat, v.to_lon
FROM (VALUES
  (9201, '2 days', '2 hours',  'public',  'Public multi-section run', 47.0,  11.0,  47.02, 11.02),
  (9202, '1 day',  '1 hour',   'private', 'Private upper run',        47.0,  11.0,  47.01, 11.01),
  (9203, '3 days', '1 hour',   'public',  'Public lower-only run',    47.01, 11.01, 47.02, 11.02),
  (9204, '6 days', '36 hours', 'public',  'Long weekend trip',        47.01, 11.01, 47.02, 11.02)
) AS v(id, start_ago, duration, scope, name, pi_lat, pi_lon, to_lat, to_lon)
CROSS JOIN (SELECT id FROM users LIMIT 1) u;

INSERT INTO descent_sections (descent_id, section_id, sort_order) VALUES
  (9201, 9101, 1), (9201, 9102, 2),
  (9202, 9101, 1),
  (9203, 9102, 1),
  (9204, 9102, 1);

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
  (9111, 9002, 'Wellerbrücke',     ST_GeomFromText('LINESTRING(10.9 47.2, 10.91 47.21)', 4326)),
  (9112, 9002, 'Ötz Stadtstrecke', ST_GeomFromText('LINESTRING(10.91 47.21, 10.92 47.22)', 4326)),
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
CROSS JOIN (SELECT id FROM users LIMIT 1) u;

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

-- API token "pm_testtoken123" for the first user (sha256 of the plain token).
INSERT INTO api_tokens (user_id, name, token_hash)
SELECT id, 'test-data', 'ffd2e7ff161f619163861f2870c0fdf91508ae8851743d855d2661aa13738ec8' FROM users LIMIT 1;

-- The explicit 9xxx ids above bypass the id sequences. Bump them past the
-- fixture range so rows created through the app get higher ids - otherwise
-- they sort before the fixture rows (breaking "first range wins" defaults)
-- and eventually collide with seeded ids.
SELECT setval(pg_get_serial_sequence(t, 'id'), 10000, true)
FROM unnest(ARRAY[
  'waterways', 'water_sections', 'features', 'feature_names',
  'section_names', 'gauges', 'gauge_series', 'feature_water_ranges',
  'descents'
]) AS t;

COMMIT;
