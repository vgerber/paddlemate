-- Drop the per-(section, creator) unique constraint so multiple put_in / take_out
-- features can exist for the same section from the same creator.

ALTER TABLE features
    DROP CONSTRAINT features_section_id_created_by_key;
