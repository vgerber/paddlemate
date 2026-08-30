-- A note can carry the point it is about - a tree across the channel is
-- only half a report without where. Optional: chatter needs no pin.
ALTER TABLE comments ADD COLUMN location geometry(Point, 4326);
