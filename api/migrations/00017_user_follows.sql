-- User following relationships.

CREATE TABLE user_follows (
    follower_id  VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id),
    CHECK (follower_id != following_id)
);

CREATE INDEX idx_user_follows_following_id ON user_follows(following_id);
