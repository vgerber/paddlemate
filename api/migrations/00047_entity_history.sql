-- History of rivers, sections and features: one row per step, oldest first.
--
-- This is the audit trail behind the provenance views. It is kept for as long
-- as the data it explains: no retention job, no cascade from the entity (a
-- deleted feature keeps a readable history). Parents are stored as plain ids
-- rather than foreign keys for that reason.
CREATE TABLE entity_history (
    id          BIGSERIAL    PRIMARY KEY,
    entity_kind VARCHAR(20)  NOT NULL CHECK (entity_kind IN ('waterway', 'section', 'feature')),
    entity_id   BIGINT       NOT NULL,
    -- Parent ids a lookup is scoped by: section_id is set for sections and
    -- features, waterway_id for all three.
    waterway_id BIGINT       NOT NULL,
    section_id  BIGINT,
    kind        VARCHAR(20)  NOT NULL
        CHECK (kind IN ('imported', 'created', 'proposal_accepted', 'edited', 'deleted')),
    actor_id    VARCHAR(255),
    source_id   TEXT         REFERENCES sources(id) ON DELETE SET NULL,
    proposal_id BIGINT,
    reviewer_id VARCHAR(255),
    -- [{"field", "before", "after"}], capped so one step stays small.
    changes     JSONB        NOT NULL DEFAULT '[]'
        CHECK (jsonb_typeof(changes) = 'array' AND jsonb_array_length(changes) <= 32),
    at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CHECK ((entity_kind = 'waterway') = (section_id IS NULL))
);

-- The reads: one entity's steps in order, and everything under a river.
CREATE INDEX idx_entity_history_entity ON entity_history (entity_kind, entity_id, at, id);
CREATE INDEX idx_entity_history_waterway ON entity_history (waterway_id);

ALTER TABLE waterways ADD COLUMN created_by VARCHAR(255);

-- The authority behind rows the Rivermap importer created. Its geometry has
-- no per-row source, so this is the one source those steps can name.
INSERT INTO sources (id, name, short_name, website)
VALUES ('import:rivermap', 'Rivermap', 'Rivermap', 'https://rivermap.org/')
ON CONFLICT (id) DO NOTHING;
