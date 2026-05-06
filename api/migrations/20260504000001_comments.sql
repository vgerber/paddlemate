-- Comments on sections and features, immediately visible without approval.
CREATE TABLE comments (
    id          BIGSERIAL    PRIMARY KEY,
    entity_type VARCHAR(50)  NOT NULL CHECK (entity_type IN ('water_section', 'feature')),
    entity_id   BIGINT       NOT NULL,
    body        TEXT         NOT NULL,
    author_id   VARCHAR(255) NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_entity ON comments(entity_type, entity_id);
CREATE INDEX idx_comments_author_id ON comments(author_id);
