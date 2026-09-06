-- Removes everything created by seed.sql (all fixture ids are in the 9xxx range).
-- section_names and feature_names need no explicit delete: both cascade from
-- their parent section and feature.
\set vincent '5a5e307b-bd29-4f61-a9e3-b29df4cb1744'
\set mara    '9a1c0d4e-2b73-4f8a-9c15-6d2e8b7a4013'
\set tobi    'c4f27a86-5d19-4e62-b8a3-1f7c9e05d284'
\set aoife   'e83b5c17-9f42-4a0d-8e6b-3c15d7208af9'
\set jonas   '7d64e920-8a31-4c5f-b27e-05f3a9c61d48'

BEGIN;
-- Members, attendance, stays, sections and audiences all cascade from the
-- trip; descents only lose their trip_id, and are deleted below anyway.
DELETE FROM trips WHERE id BETWEEN 9001 AND 9099;
-- group_members cascades from the group
DELETE FROM groups WHERE id BETWEEN 9001 AND 9099;
-- media rows referencing a fixture comment cascade with it
DELETE FROM comments WHERE id BETWEEN 9900 AND 9999;
DELETE FROM proposal_votes WHERE proposal_id BETWEEN 9700 AND 9799;
DELETE FROM proposals WHERE id BETWEEN 9700 AND 9799;
DELETE FROM descents WHERE id BETWEEN 9200 AND 9299;
DELETE FROM feature_water_ranges WHERE id BETWEEN 9600 AND 9699;
DELETE FROM gauge_readings WHERE series_id BETWEEN 9400 AND 9499;
DELETE FROM gauge_series WHERE id BETWEEN 9400 AND 9499;
DELETE FROM gauges WHERE id BETWEEN 9300 AND 9399;
DELETE FROM sources WHERE id IN ('9901', '9902');
DELETE FROM features WHERE id BETWEEN 9500 AND 9599;
DELETE FROM water_sections WHERE id BETWEEN 9100 AND 9199;
DELETE FROM waterways WHERE id BETWEEN 9001 AND 9099;
DELETE FROM api_tokens WHERE token_hash = 'ffd2e7ff161f619163861f2870c0fdf91508ae8851743d855d2661aa13738ec8';
DELETE FROM user_follows
 WHERE follower_id  IN (:'vincent', :'mara', :'tobi', :'aoife', :'jonas')
    OR following_id IN (:'vincent', :'mara', :'tobi', :'aoife', :'jonas');
-- Vincent stays: he is the account you sign in as, and his row is recreated
-- by Keycloak on the next request whether the fixture is loaded or not. The
-- other four exist only for the fixture, so they go with it.
DELETE FROM users WHERE id IN (:'mara', :'tobi', :'aoife', :'jonas');
COMMIT;
