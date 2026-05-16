-- Data sources / authorities.
-- Schema matches the Rivermap Source Object (https://api.rivermap.org/#source-object-properties).

CREATE TABLE sources (
    id              TEXT PRIMARY KEY,           -- UUID from Rivermap
    name            TEXT NOT NULL,              -- Full source name
    short_name      TEXT,                       -- Abbreviated name
    licensing_terms TEXT,                       -- License / ToS (Markdown)
    website         TEXT,                       -- Link to authority website
    country_code    VARCHAR(2)                  -- ISO 3166-1 alpha-2
);

CREATE INDEX idx_sources_country_code ON sources(country_code);
