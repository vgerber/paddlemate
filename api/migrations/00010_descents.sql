-- Descent logs: user-recorded paddling runs with visibility controls.

CREATE TYPE visibility_scope AS ENUM ('private', 'shared', 'public');

CREATE TABLE descents (
    id                    BIGSERIAL        PRIMARY KEY,
    user_id               VARCHAR(255)     NOT NULL REFERENCES users(id),
    start_time            TIMESTAMPTZ      NOT NULL,
    end_time              TIMESTAMPTZ      NOT NULL,
    note                  TEXT,
    put_in_feature_id     BIGINT           REFERENCES features(id),
    take_out_feature_id   BIGINT           REFERENCES features(id),
    put_in_lat            DOUBLE PRECISION,
    put_in_lon            DOUBLE PRECISION,
    put_in_label          TEXT,
    take_out_lat          DOUBLE PRECISION,
    take_out_lon          DOUBLE PRECISION,
    take_out_label        TEXT,
    visibility_scope      visibility_scope NOT NULL DEFAULT 'private',
    visible_from          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_descent_times    CHECK (end_time >= start_time),
    CONSTRAINT chk_descent_put_in   CHECK (
        (put_in_feature_id IS NOT NULL AND put_in_lat IS NULL     AND put_in_lon IS NULL)
        OR
        (put_in_feature_id IS NULL     AND put_in_lat IS NOT NULL AND put_in_lon IS NOT NULL)
    ),
    CONSTRAINT chk_descent_take_out CHECK (
        (take_out_feature_id IS NOT NULL AND take_out_lat IS NULL     AND take_out_lon IS NULL)
        OR
        (take_out_feature_id IS NULL     AND take_out_lat IS NOT NULL AND take_out_lon IS NOT NULL)
    )
);

CREATE INDEX idx_descents_user_id    ON descents (user_id, created_at DESC);
CREATE INDEX idx_descents_visibility ON descents (visibility_scope, visible_from);

CREATE TABLE descent_sections (
    descent_id BIGINT NOT NULL REFERENCES descents(id)       ON DELETE CASCADE,
    section_id BIGINT NOT NULL REFERENCES water_sections(id) ON DELETE RESTRICT,
    sort_order INT    NOT NULL CHECK (sort_order >= 1),
    note       TEXT,
    UNIQUE (descent_id, sort_order),
    UNIQUE (descent_id, section_id)
);

CREATE INDEX idx_descent_sections_descent ON descent_sections (descent_id);
CREATE INDEX idx_descent_sections_section ON descent_sections (section_id);

CREATE TABLE descent_visible_users (
    descent_id BIGINT       NOT NULL REFERENCES descents(id) ON DELETE CASCADE,
    user_id    VARCHAR(255) NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    PRIMARY KEY (descent_id, user_id)
);

CREATE TABLE descent_visible_groups (
    descent_id BIGINT NOT NULL REFERENCES descents(id) ON DELETE CASCADE,
    group_id   BIGINT NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
    PRIMARY KEY (descent_id, group_id)
);
