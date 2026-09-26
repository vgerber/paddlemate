-- A link that lets somebody join a trip, for the friend who is not on
-- Paddlemate yet: an admin shares it in the group chat, whoever opens it signs
-- up or in, and joins. One link serves the whole group, so it is used many
-- times until it expires or an admin withdraws it.
--
-- Only a hash of the token is kept, as for API tokens: the link is shown once,
-- when it is made, and a new one is a click away.
CREATE TABLE trip_invites (
    id          BIGSERIAL    PRIMARY KEY,
    trip_id     BIGINT       NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    token_hash  TEXT         NOT NULL UNIQUE,
    created_by  VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ  NOT NULL,
    -- How many people joined through it, so an admin can tell a live link
    -- from one nobody used.
    uses        INT          NOT NULL DEFAULT 0 CHECK (uses >= 0),
    CONSTRAINT chk_trip_invite_expiry CHECK (expires_at > created_at)
);

CREATE INDEX trip_invites_trip_idx ON trip_invites (trip_id);
