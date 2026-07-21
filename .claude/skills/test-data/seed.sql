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
-- section list), matching the shape the rivermap import produces.
INSERT INTO features (id, section_id, feature_type, metadata, location, created_by)
SELECT v.id, v.section_id, 'whitewater', v.meta::jsonb, ST_GeomFromText(v.wkt, 4326), u.id
FROM (VALUES
  (9523, 9102, '{"difficulty": "III", "length_km": 1.5}',   'LINESTRING(11.012 47.012, 11.018 47.018)'),
  (9543, 9104, '{"difficulty": "II", "length_km": 1.5}',    'LINESTRING(11.032 47.032, 11.038 47.038)'),
  (9553, 9105, '{"difficulty": "IV-V", "length_km": 1.5}',  'LINESTRING(11.042 47.042, 11.048 47.048)')
) AS v(id, section_id, meta, wkt)
CROSS JOIN (SELECT id FROM users LIMIT 1) u;

-- Gauge with a week of sinusoidal water-level readings, calibrated on the
-- put_in of Lower Test (9102) so that section shows a chart and water status.
-- 9401 has a week of readings (latest ~85 cm); 9402 ("Silent Gauge") is
-- calibrated but never polled, so its section shows the level fallback
-- without a reading. A gauge allows one series per measurement type.
INSERT INTO gauges (id, name, provider, source_id) VALUES
  (9301, 'Test Gauge', 'test', 'test-1'),
  (9302, 'Silent Gauge', 'test', 'test-2');
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
  (9601, 9521, 9401, 60, 80, 120),
  (9602, 9511, 9401, NULL, NULL, NULL),
  (9603, 9541, 9401, 80, 100, 130),
  (9604, 9551, 9401, 40, 50, 70),
  (9605, 9561, 9401, 100, 120, 150),
  (9606, 9571, 9402, 60, 80, 120);

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

-- API token "pm_testtoken123" for the first user (sha256 of the plain token).
INSERT INTO api_tokens (user_id, name, token_hash)
SELECT id, 'test-data', 'ffd2e7ff161f619163861f2870c0fdf91508ae8851743d855d2661aa13738ec8' FROM users LIMIT 1;

COMMIT;
