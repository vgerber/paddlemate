-- Keep language codes in one canonical form, so that "de", "DE" and "de_DE"
-- cannot become separate rows and defeat the unique constraint on
-- (entity, lang_code).
--
-- The API normalizes and rejects malformed codes at the request boundary, in
-- models::lang::normalize_lang_code. This constraint is the backstop for any
-- other writer, and the grammar below must be kept in step with that function.
-- Postgres reports a violation as SQLSTATE 23514, which the proposal review
-- route already turns into a readable error.

ALTER TABLE section_names
    ADD CONSTRAINT section_names_lang_code_check
    CHECK (lang_code ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$');

ALTER TABLE section_descriptions
    ADD CONSTRAINT section_descriptions_lang_code_check
    CHECK (lang_code ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$');

ALTER TABLE feature_names
    ADD CONSTRAINT feature_names_lang_code_check
    CHECK (lang_code ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$');

ALTER TABLE feature_descriptions
    ADD CONSTRAINT feature_descriptions_lang_code_check
    CHECK (lang_code ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$');
