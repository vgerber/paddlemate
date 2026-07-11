-- Multilingual names and descriptions for sections, mirroring the feature
-- localization tables. The plain columns on water_sections stay as the
-- default/fallback text.

CREATE TABLE section_names (
    id         BIGSERIAL    PRIMARY KEY,
    section_id BIGINT       NOT NULL REFERENCES water_sections(id) ON DELETE CASCADE,
    lang_code  VARCHAR(10)  NOT NULL,
    name       VARCHAR(255) NOT NULL,
    UNIQUE (section_id, lang_code)
);

CREATE INDEX idx_section_names_section_id ON section_names(section_id);

CREATE TABLE section_descriptions (
    id          BIGSERIAL   PRIMARY KEY,
    section_id  BIGINT      NOT NULL REFERENCES water_sections(id) ON DELETE CASCADE,
    lang_code   VARCHAR(10) NOT NULL,
    description TEXT        NOT NULL,
    UNIQUE (section_id, lang_code)
);

CREATE INDEX idx_section_descriptions_section_id ON section_descriptions(section_id);
