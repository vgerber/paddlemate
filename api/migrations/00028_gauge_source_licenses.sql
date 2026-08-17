-- Gauge data licenses.
--
-- `sources.licensing_terms` holds prose that names a license inconsistently
-- (see river-gauge/src/license.rs). Store the resolved license alongside it so
-- clients can render a stable label and link instead of a wall of text.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS license_name TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS license_url  TEXT;

COMMENT ON COLUMN sources.license_name IS
  'Short license label, e.g. "CC BY 4.0". NULL when the source names no license we recognise.';
COMMENT ON COLUMN sources.license_url IS
  'Where the license can be read. NULL when the source states no formal license; clients then link `website`.';

-- Gauges polled directly (not via the Rivermap snapshot) have no per-station
-- source, but every gauge of a given provider comes from the same authority.
-- A provider-level mapping means new gauges need no per-row bookkeeping and
-- the linkage cannot rot when a reader or importer forgets to set it.
CREATE TABLE IF NOT EXISTS provider_sources (
    provider  TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE
);

COMMENT ON TABLE provider_sources IS
  'Maps gauges.provider (a GaugeReader::provider_key) to the authority publishing that data. Resolved as a fallback when gauges.data_source_id is NULL.';

-- Three authorities have no Rivermap source row, so they are authored here.
-- Only PEGELONLINE states a machine-readable license we could verify, so the
-- other two carry a terms link and no license claim.
-- Reviewed 2026-08-08 against the linked pages; nothing refreshes these
-- automatically, so re-check when a provider changes its terms.
INSERT INTO sources (id, name, short_name, website, country_code, licensing_terms, license_name, license_url)
VALUES
    ('provider:po',
     'Wasserstrassen- und Schifffahrtsverwaltung des Bundes (PEGELONLINE)',
     'PEGELONLINE', 'https://www.pegelonline.wsv.de/', 'DE',
     'Published by the authority under Datenlizenz Deutschland - Zero - Version 2.0.',
     'DL-DE->Zero-2.0', 'https://www.govdata.de/dl-de/zero-2-0'),
    ('provider:ehyd',
     'eHYD - Hydrographischer Dienst in Oesterreich',
     'eHYD', 'https://ehyd.gv.at/', 'AT',
     'Refer to the terms of use published by the authority.',
     NULL, NULL),
    ('provider:rz',
     'Riverzone',
     'Riverzone', 'https://riverzone.eu/', NULL,
     'Refer to the terms of use published by the aggregator.',
     NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO provider_sources (provider, source_id) VALUES
    ('po',   'provider:po'),
    ('ehyd', 'provider:ehyd'),
    ('rz',   'provider:rz')
ON CONFLICT (provider) DO NOTHING;

-- The remaining ten authorities already exist as Rivermap sources, so map to
-- those rather than authoring rival license text for the same organisation.
-- Matching on short_name keeps this independent of the snapshot's UUIDs; the
-- SELECT yields nothing on a database that has never had a Rivermap import,
-- which is fine - the mapping is added by a later import instead.
INSERT INTO provider_sources (provider, source_id)
SELECT p.provider, s.id
FROM (VALUES
    ('nve',    'NVE'),
    ('bafu',   'BAFU'),
    ('cz',     'CHMI'),
    ('hubeau', 'SCHAPI'),
    ('tirol',  'Tirol'),
    ('vbg',    'Vorarlberg'),
    ('bw',     'HVZ (BW)'),
    ('sx',     'Sachsen'),
    ('pl',     'Poland'),
    ('by',     'HND (BY)')
) AS p(provider, short_name)
JOIN sources s ON s.short_name = p.short_name
ON CONFLICT (provider) DO NOTHING;
