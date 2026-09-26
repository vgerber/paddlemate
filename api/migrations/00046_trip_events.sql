-- What changed on a trip, and who did it. One row per change, so the group
-- can see what happened while they were away (the bell), open apps refresh
-- live (SSE), and the phone buzzes for the changes that matter (web push).
CREATE TYPE trip_event_kind AS ENUM (
    'trip_changed',
    'member_joined',
    'member_left',
    'member_removed',
    'attendance_changed',
    'stay_added',
    'stay_changed',
    'stay_removed',
    'watch_list_changed',
    'candidate_proposed',
    'candidate_changed',
    'candidate_voted',
    'candidate_accepted',
    'candidate_withdrawn',
    'log_linked'
);

CREATE TABLE trip_events (
    id         BIGSERIAL       PRIMARY KEY,
    trip_id    BIGINT          NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    -- Kept when the actor's account goes, so the history still reads.
    actor_id   VARCHAR(255)    REFERENCES users(id) ON DELETE SET NULL,
    kind       trip_event_kind NOT NULL,
    -- What the change was about, named as it was then: a removed base keeps
    -- its name here after its row is gone.
    summary    JSONB           NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX trip_events_trip_idx ON trip_events (trip_id, created_at DESC);
-- For pruning: events are kept for a while, not forever.
CREATE INDEX trip_events_created_idx ON trip_events (created_at);

-- Every event is announced on commit, so every API instance hears it and
-- nothing is announced for a change that rolled back.
CREATE FUNCTION notify_trip_event() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('trip_events', NEW.id::text);
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trip_events_notify
    AFTER INSERT ON trip_events
    FOR EACH ROW EXECUTE FUNCTION notify_trip_event();

-- How far each person has read. One mark rather than a row per event: opening
-- the bell reads everything up to now.
CREATE TABLE notification_reads (
    user_id    VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    read_until TIMESTAMPTZ  NOT NULL
);

-- Where to push. A person has one per browser or phone they allowed; the push
-- service forgets an endpoint when the browser does, and we drop it then.
CREATE TABLE push_subscriptions (
    id         BIGSERIAL    PRIMARY KEY,
    user_id    VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT         NOT NULL UNIQUE,
    p256dh     TEXT         NOT NULL,
    auth       TEXT         NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);
