-- Proposals (staging area for user-submitted mutations) and comments.

CREATE TABLE proposals (
    id            BIGSERIAL    PRIMARY KEY,
    entity_type   VARCHAR(50)  NOT NULL CHECK (entity_type IN ('waterway', 'water_section', 'feature')),
    entity_id     BIGINT,
    operation     VARCHAR(20)  NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
    proposed_data JSONB        NOT NULL,
    submitted_by  VARCHAR(255) NOT NULL REFERENCES users(id),
    status        VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by   VARCHAR(255) REFERENCES users(id),
    review_note   TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposals_submitted_by ON proposals(submitted_by);
CREATE INDEX idx_proposals_status       ON proposals(status);
CREATE INDEX idx_proposals_entity       ON proposals(entity_type, entity_id);

CREATE TABLE comments (
    id          BIGSERIAL    PRIMARY KEY,
    entity_type VARCHAR(50)  NOT NULL CHECK (entity_type IN ('water_section', 'feature')),
    entity_id   BIGINT       NOT NULL,
    body        TEXT         NOT NULL,
    author_id   VARCHAR(255) NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_entity    ON comments(entity_type, entity_id);
CREATE INDEX idx_comments_author_id ON comments(author_id);
