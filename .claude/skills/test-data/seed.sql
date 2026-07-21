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
  (9103, 9001, 'Empty Test', ST_GeomFromText('LINESTRING(11.02 47.02, 11.03 47.03)', 4326));

INSERT INTO features (id, section_id, feature_type, location, created_by)
SELECT v.id, v.section_id, v.feature_type::feature_type, ST_GeomFromText(v.wkt, 4326), u.id
FROM (VALUES
  (9511, 9101, 'put_in',   'POINT(11.0 47.0)'),
  (9512, 9101, 'take_out', 'POINT(11.01 47.01)'),
  (9521, 9102, 'put_in',   'POINT(11.01 47.01)'),
  (9522, 9102, 'take_out', 'POINT(11.02 47.02)'),
  (9531, 9103, 'put_in',   'POINT(11.02 47.02)'),
  (9532, 9103, 'take_out', 'POINT(11.03 47.03)')
) AS v(id, section_id, feature_type, wkt)
CROSS JOIN (SELECT id FROM users LIMIT 1) u;

-- Gauge with a week of sinusoidal water-level readings, calibrated on the
-- put_in of Lower Test (9102) so that section shows a chart and water status.
INSERT INTO gauges (id, name, provider, source_id) VALUES (9301, 'Test Gauge', 'test', 'test-1');
INSERT INTO gauge_series (id, gauge_id, measurement_type, unit) VALUES (9401, 9301, 'water_level', 'cm');
INSERT INTO feature_water_ranges (id, feature_id, series_id, range_low, range_medium, range_high)
VALUES (9601, 9521, 9401, 60, 80, 120);
INSERT INTO gauge_readings (series_id, measured_at, value)
SELECT 9401, NOW() - (n || ' hours')::interval, 85 + 30 * sin(n / 12.0)
FROM generate_series(0, 168, 2) AS n;

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
