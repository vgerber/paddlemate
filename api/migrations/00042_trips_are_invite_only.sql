-- A trip is a private plan among the people in it. Nobody browses trips, so
-- there is nothing for public or shared to mean: membership is the whole
-- rule, and an admin adds the people who belong.
--
-- The visibility_scope type itself stays - descents still use it.
DROP TABLE IF EXISTS trip_visible_users;
DROP TABLE IF EXISTS trip_visible_groups;

ALTER TABLE trips
    DROP COLUMN visibility_scope,
    DROP COLUMN visible_from;
