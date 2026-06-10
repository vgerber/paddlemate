-- Add min/max/avg aggregate columns to water snapshots and backfill
-- existing rows with corrected readings from the descent time range
-- (existing values were incorrectly captured at log time, not descent time).

ALTER TABLE descent_section_water_snapshots
    ADD COLUMN value_min DOUBLE PRECISION,
    ADD COLUMN value_max DOUBLE PRECISION,
    ADD COLUMN value_avg DOUBLE PRECISION;

-- Backfill: recompute value, measured_at, level, and new aggregates
-- from gauge_readings over [descent.start_time, descent.end_time].
UPDATE descent_section_water_snapshots s
SET
    -- Representative reading: closest to end_time
    value       = corrected.val,
    measured_at = corrected.mat,
    -- Recompute level from corrected value against stored thresholds
    level = CASE
        WHEN corrected.val IS NULL THEN 'empty'::water_level
        WHEN s.range_high IS NOT NULL AND corrected.val >= s.range_high THEN 'high'::water_level
        WHEN s.range_medium IS NOT NULL AND corrected.val >= s.range_medium THEN 'medium'::water_level
        WHEN s.range_low IS NOT NULL AND corrected.val >= s.range_low THEN 'low'::water_level
        ELSE 'empty'::water_level
    END,
    -- Aggregates over the descent time range
    value_min = corrected.vmin,
    value_max = corrected.vmax,
    value_avg = corrected.vavg
FROM (
    SELECT
        s2.id AS snapshot_id,
        rep.value   AS val,
        rep.measured_at AS mat,
        agg.vmin,
        agg.vmax,
        agg.vavg
    FROM descent_section_water_snapshots s2
    JOIN descents d ON d.id = s2.descent_id
    -- Representative reading: latest at or before end_time
    LEFT JOIN LATERAL (
        SELECT gr.value, gr.measured_at
        FROM gauge_readings gr
        WHERE gr.series_id = s2.series_id
          AND gr.measured_at <= d.end_time
        ORDER BY gr.measured_at DESC
        LIMIT 1
    ) rep ON TRUE
    -- Aggregates over [start_time, end_time]
    LEFT JOIN LATERAL (
        SELECT
            MIN(gr.value) AS vmin,
            MAX(gr.value) AS vmax,
            AVG(gr.value) AS vavg
        FROM gauge_readings gr
        WHERE gr.series_id = s2.series_id
          AND gr.measured_at >= d.start_time
          AND gr.measured_at <= d.end_time
    ) agg ON TRUE
) corrected
WHERE s.id = corrected.snapshot_id;
