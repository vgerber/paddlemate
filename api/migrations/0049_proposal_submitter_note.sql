-- The submitter's own note on a proposal, shown to the reviewer and kept in
-- the history of an accepted change. Bounded in the database as well as in
-- the routes.
ALTER TABLE proposals
    ADD COLUMN submitter_note TEXT CHECK (char_length(submitter_note) <= 500);
