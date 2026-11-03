-- Withdrawing a material proposal deletes it; this log keeps it counting
-- toward the daily cap. Append-only; a user's rows older than a day are
-- pruned when they withdraw again.
CREATE TABLE material_proposal_withdrawals (
    id           BIGSERIAL PRIMARY KEY,
    user_id      VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    submitted_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_material_proposal_withdrawals_user
    ON material_proposal_withdrawals (user_id, submitted_at);
