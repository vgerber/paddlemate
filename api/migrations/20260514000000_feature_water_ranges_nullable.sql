-- Allow feature_water_ranges thresholds to be NULL.
--
-- A gauge-to-section link is useful even without configured thresholds:
-- it tells the frontend which gauge to display for a section. Thresholds
-- (lw/mw/hw) are optional metadata on top of that association.

ALTER TABLE feature_water_ranges
    ALTER COLUMN range_low    DROP NOT NULL,
    ALTER COLUMN range_medium DROP NOT NULL,
    ALTER COLUMN range_high   DROP NOT NULL;

-- Keep the ordering check, but only enforce it when all three are present.
ALTER TABLE feature_water_ranges
    DROP CONSTRAINT feature_water_ranges_check;

ALTER TABLE feature_water_ranges
    ADD CONSTRAINT feature_water_ranges_check
        CHECK (
            range_low IS NULL
            OR range_medium IS NULL
            OR range_high IS NULL
            OR (range_low < range_medium AND range_medium < range_high)
        );
