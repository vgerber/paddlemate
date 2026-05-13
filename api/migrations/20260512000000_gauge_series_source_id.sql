-- Add `source_id` to `gauge_series` so readers can match results back to series
-- without provider-specific logic in the dispatcher.
-- Format follows the reader convention, e.g. "201038:W" for Tirol water level.

ALTER TABLE gauge_series ADD COLUMN IF NOT EXISTS source_id text;
