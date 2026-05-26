CREATE TABLE proposal_votes (
    proposal_id BIGINT       NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    user_id     VARCHAR(255) NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
    vote        SMALLINT     NOT NULL CHECK (vote IN (1, -1)),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (proposal_id, user_id)
);

CREATE INDEX proposal_votes_proposal_id_idx ON proposal_votes (proposal_id);
