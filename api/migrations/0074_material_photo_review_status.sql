-- A photo a paddler uploaded waits for an admin in this state. Its own
-- migration: a new enum value cannot be used in the transaction that adds it.
ALTER TYPE material_image_status ADD VALUE IF NOT EXISTS 'review';
