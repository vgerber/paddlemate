-- Trips: a group's multi-stage stay, with its members, its moving base and
-- the sections watched from each base. Visibility reuses the descent model.

CREATE TYPE trip_member_role AS ENUM ('admin', 'member');
CREATE TYPE trip_stay_kind   AS ENUM ('camp', 'hotel', 'bivouac', 'other');
CREATE TYPE trip_section_status AS ENUM ('planned', 'optional', 'done', 'skipped');

-- No user_id: ownership is a trip_members row with role 'admin', so admin can
-- be transferred or shared without touching the trip.
CREATE TABLE trips (
    id               BIGSERIAL        PRIMARY KEY,
    name             VARCHAR(255)     NOT NULL,
    description      TEXT,
    start_date       DATE             NOT NULL,
    end_date         DATE,
    visibility_scope visibility_scope NOT NULL DEFAULT 'private',
    visible_from     TIMESTAMPTZ,
    created_by       VARCHAR(255)     NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_trip_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX idx_trips_visibility ON trips (visibility_scope, visible_from);

CREATE TABLE trip_members (
    trip_id    BIGINT           NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id    VARCHAR(255)     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       trip_member_role NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    PRIMARY KEY (trip_id, user_id)
);

CREATE INDEX idx_trip_members_user ON trip_members (user_id);

-- When a member can personally get there and when they must leave. Distinct
-- from a stay's dates, which describe the accommodation, and settled far
-- earlier: attendance is agreed up front while the base is still moving.
CREATE TABLE trip_member_attendance (
    trip_id        BIGINT       NOT NULL,
    user_id        VARCHAR(255) NOT NULL,
    arrival        DATE,
    -- Local to the trip, not to whoever is reading: "18:30 at the campsite"
    -- must not shift with the viewer's timezone, so no zone is carried.
    arrival_time   TIME,
    departure      DATE,
    departure_time TIME,
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (trip_id, user_id),
    FOREIGN KEY (trip_id, user_id) REFERENCES trip_members(trip_id, user_id) ON DELETE CASCADE,
    CONSTRAINT chk_trip_attendance_dates CHECK (departure IS NULL OR arrival IS NULL OR departure >= arrival),
    -- You learn the day before the hour, so a time is optional - but an hour
    -- with no day to hang it on means nothing.
    CONSTRAINT chk_trip_attendance_arrival_time CHECK (arrival_time IS NULL OR arrival IS NOT NULL),
    CONSTRAINT chk_trip_attendance_departure_time CHECK (departure_time IS NULL OR departure IS NOT NULL),
    -- Arriving and leaving on one day: the clock has to run forwards too.
    CONSTRAINT chk_trip_attendance_same_day CHECK (
        arrival IS NULL OR departure IS NULL OR departure > arrival
        OR arrival_time IS NULL OR departure_time IS NULL
        OR departure_time >= arrival_time
    )
);

CREATE TABLE trip_visible_users (
    trip_id BIGINT       NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (trip_id, user_id)
);

CREATE INDEX idx_trip_visible_users_user ON trip_visible_users (user_id);

CREATE TABLE trip_visible_groups (
    trip_id  BIGINT NOT NULL REFERENCES trips(id)  ON DELETE CASCADE,
    group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    PRIMARY KEY (trip_id, group_id)
);

CREATE INDEX idx_trip_visible_groups_group ON trip_visible_groups (group_id);

-- Only kind and name are required: a stay is a placeholder to plan against
-- while booking is open, refined in place once it is settled. Read as a
-- timeline ordered by arrival, falling back to created_at while it is unset.
CREATE TABLE trip_stays (
    id          BIGSERIAL      PRIMARY KEY,
    trip_id     BIGINT         NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    kind        trip_stay_kind NOT NULL,
    name        VARCHAR(255)   NOT NULL,
    description TEXT,
    location    geometry(Point, 4326),
    arrival     DATE,
    departure   DATE,
    created_by  VARCHAR(255)   NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_trip_stay_dates CHECK (departure IS NULL OR arrival IS NULL OR departure >= arrival)
);

CREATE INDEX idx_trip_stays_trip ON trip_stays (trip_id, arrival, created_at);

-- Scoped to the stay, not the trip: two camps a kilometre apart reach the same
-- rivers, and each keeps its own list when the base moves.
CREATE TABLE trip_sections (
    id         BIGSERIAL           PRIMARY KEY,
    stay_id    BIGINT              NOT NULL REFERENCES trip_stays(id)    ON DELETE CASCADE,
    section_id BIGINT              NOT NULL REFERENCES water_sections(id) ON DELETE RESTRICT,
    sort_order INT                 NOT NULL CHECK (sort_order >= 1),
    status     trip_section_status NOT NULL DEFAULT 'planned',
    note       TEXT,
    created_at TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    UNIQUE (stay_id, section_id),
    UNIQUE (stay_id, sort_order)
);

CREATE INDEX idx_trip_sections_stay    ON trip_sections (stay_id);
CREATE INDEX idx_trip_sections_section ON trip_sections (section_id);

-- A descent belongs to at most one trip, so the cardinality is the column.
-- Deleting a trip ungroups its logs rather than destroying them.
ALTER TABLE descents ADD COLUMN trip_id BIGINT REFERENCES trips(id) ON DELETE SET NULL;

CREATE INDEX idx_descents_trip ON descents (trip_id);
