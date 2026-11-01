-- A model can belong to several groups: `discipline` becomes `disciplines`,
-- the groups in order, the primary first. One to three, each valid for the
-- category (the rule of the old single column, per element). A row with no
-- group before is filed under `other`, which every category allows.

ALTER TABLE materials ADD COLUMN disciplines material_discipline[];
UPDATE materials SET disciplines = ARRAY[COALESCE(discipline, 'other')];
ALTER TABLE materials ALTER COLUMN disciplines SET NOT NULL;
ALTER TABLE materials DROP CONSTRAINT chk_materials_discipline;
ALTER TABLE materials DROP COLUMN discipline;

ALTER TABLE materials ADD CONSTRAINT chk_materials_disciplines CHECK (
    cardinality(disciplines) BETWEEN 1 AND 3
    AND array_position(disciplines, NULL) IS NULL
    AND CASE WHEN category = 'paddle'
        THEN disciplines <@ ARRAY['whitewater', 'freestyle', 'slalom', 'wildwater', 'touring',
                                  'canoe', 'polo', 'other']::material_discipline[]
        ELSE NOT disciplines && ARRAY['whitewater', 'wildwater', 'canoe', 'polo']::material_discipline[]
    END
);

CREATE INDEX idx_materials_disciplines ON materials USING gin (disciplines);

-- Stored proposals carry the entry body: the single group becomes a list.
UPDATE proposals SET
    proposed_data = (proposed_data - 'discipline') || jsonb_build_object('disciplines',
        CASE WHEN jsonb_typeof(proposed_data->'discipline') = 'string'
             THEN jsonb_build_array(proposed_data->'discipline') ELSE '[]'::jsonb END)
WHERE entity_type = 'material' AND proposed_data ? 'discipline';

UPDATE proposals SET
    original_data = (original_data - 'discipline') || jsonb_build_object('disciplines',
        CASE WHEN jsonb_typeof(original_data->'discipline') = 'string'
             THEN jsonb_build_array(original_data->'discipline') ELSE '[]'::jsonb END)
WHERE entity_type = 'material' AND original_data ? 'discipline';
