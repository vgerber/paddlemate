CREATE DATABASE IF NOT EXISTS {database};

CREATE TABLE IF NOT EXISTS {database}.api_events
(
    ts DateTime64(3, 'UTC'),
    route LowCardinality(String),
    method LowCardinality(String),
    status UInt16,
    latency_ms UInt32,
    client LowCardinality(String),
    browser LowCardinality(String),
    os LowCardinality(String),
    query Map(LowCardinality(String), LowCardinality(String)),
    bytes UInt32
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (route, ts)
TTL toDateTime(ts) + INTERVAL 90 DAY;

CREATE TABLE IF NOT EXISTS {database}.api_events_hourly
(
    hour DateTime('UTC'),
    route LowCardinality(String),
    status_class LowCardinality(String),
    client LowCardinality(String),
    requests SimpleAggregateFunction(sum, UInt64),
    latency AggregateFunction(quantiles(0.5, 0.95), UInt32)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(hour)
ORDER BY (hour, route, status_class, client)
TTL hour + INTERVAL 3 YEAR;

CREATE MATERIALIZED VIEW IF NOT EXISTS {database}.api_events_hourly_mv
TO {database}.api_events_hourly AS
SELECT
    toStartOfHour(ts) AS hour,
    route,
    concat(toString(intDiv(status, 100)), 'xx') AS status_class,
    client,
    count() AS requests,
    quantilesState(0.5, 0.95)(latency_ms) AS latency
FROM {database}.api_events
GROUP BY hour, route, status_class, client;
