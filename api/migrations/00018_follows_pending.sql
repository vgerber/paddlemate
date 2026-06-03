-- Add pending/accepted status to follow requests.
-- Existing follows are treated as accepted; new requests default to pending.

ALTER TABLE user_follows
    ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'accepted';

ALTER TABLE user_follows
    ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE user_follows
    ADD CONSTRAINT chk_follows_status CHECK (status IN ('pending', 'accepted'));

CREATE INDEX idx_user_follows_status ON user_follows (follower_id, status);
