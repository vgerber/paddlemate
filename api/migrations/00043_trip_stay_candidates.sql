-- Where to stay is the one part of a trip the group argues about: the camp is
-- full, somebody finds a better hut, two people have different ideas. So a
-- base can start as a candidate that anyone on the trip may put up and
-- everyone may vote on, and becomes a real base only once it is accepted.
--
-- Deliberately its own pair of tables rather than the site-wide `proposals`:
-- those propose edits to shared river data and are reviewed by admins, while
-- these belong to one trip and are settled by the people on it.
CREATE TABLE trip_stay_candidates (
    id          BIGSERIAL      PRIMARY KEY,
    trip_id     BIGINT         NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    kind        trip_stay_kind NOT NULL,
    name        VARCHAR(255)   NOT NULL,
    description TEXT,
    -- Optional for the same reason a stay's is: "somewhere in the Pitztal" is
    -- a real suggestion while somebody is still ringing around. Same type as
    -- trip_stays.location, because accepting one copies it straight across.
    location    GEOMETRY(Point, 4326),
    arrival     DATE,
    departure   DATE,
    proposed_by VARCHAR(255)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_trip_candidate_dates
        CHECK (departure IS NULL OR arrival IS NULL OR departure >= arrival)
);

CREATE INDEX trip_stay_candidates_trip_id_idx ON trip_stay_candidates (trip_id);

-- Same shape as proposal_votes, so a vote means the same thing everywhere.
CREATE TABLE trip_stay_candidate_votes (
    candidate_id BIGINT       NOT NULL REFERENCES trip_stay_candidates(id) ON DELETE CASCADE,
    user_id      VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote         SMALLINT     NOT NULL CHECK (vote IN (1, -1)),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (candidate_id, user_id)
);

CREATE INDEX trip_stay_candidate_votes_candidate_id_idx
    ON trip_stay_candidate_votes (candidate_id);
