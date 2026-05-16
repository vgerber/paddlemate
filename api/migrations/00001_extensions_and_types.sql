-- Extensions and custom enum types used across the schema.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TYPE waterway_type       AS ENUM ('river');
CREATE TYPE feature_type        AS ENUM (
    'whitewater', 'freestyle_spot', 'hole', 'siphon',
    'weir', 'dam', 'obstacle', 'bridge', 'portage',
    'put_in', 'take_out', 'waterfall'
);
CREATE TYPE measurement_type    AS ENUM ('water_level', 'discharge', 'temperature');
CREATE TYPE group_member_role   AS ENUM ('owner', 'admin', 'member');
