-- Covering index so range summaries are index-only scans: readings of all
-- gauges interleave on disk, and heap fetches cost one seek per row.
-- The old DESC index duplicated the primary key (a backward scan serves
-- newest-first queries) and no query names it.
CREATE INDEX idx_gauge_readings_series_time_value
    ON gauge_readings (series_id, measured_at) INCLUDE (value);

DROP INDEX idx_gauge_readings_series_time;
