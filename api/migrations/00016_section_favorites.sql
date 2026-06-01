CREATE TABLE user_section_favorites (
    user_id    VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    section_id BIGINT       NOT NULL REFERENCES water_sections(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, section_id)
);
