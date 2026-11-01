-- Move paddles from the kayak classes they borrowed to classes by use, then
-- keep the two apart: a paddle has a paddle class, a boat a boat class.
-- creek and river_runner -> whitewater, downriver -> wildwater; freestyle,
-- slalom and other keep their names. touring, canoe and polo have no old
-- equivalent and are only set by hand.
UPDATE materials SET discipline = CASE discipline::text
        WHEN 'creek' THEN 'whitewater'
        WHEN 'river_runner' THEN 'whitewater'
        WHEN 'downriver' THEN 'wildwater'
    END::material_discipline
WHERE category = 'paddle' AND discipline::text IN ('creek', 'river_runner', 'downriver');

-- A spare whitewater paddle is a whitewater paddle.
UPDATE materials SET discipline = 'whitewater'
WHERE category = 'paddle' AND brand = 'Lendal (Celtic Paddles)'
  AND model = 'White water emergency paddle' AND discipline = 'other';

-- Proposals carry the class inside their stored body.
UPDATE proposals SET
    proposed_data = jsonb_set(proposed_data, '{discipline}', to_jsonb(CASE proposed_data->>'discipline'
        WHEN 'creek' THEN 'whitewater' WHEN 'river_runner' THEN 'whitewater'
        WHEN 'downriver' THEN 'wildwater' END))
WHERE entity_type = 'material' AND proposed_data->>'category' = 'paddle'
  AND proposed_data->>'discipline' IN ('creek', 'river_runner', 'downriver');

UPDATE proposals SET
    original_data = jsonb_set(original_data, '{discipline}', to_jsonb(CASE original_data->>'discipline'
        WHEN 'creek' THEN 'whitewater' WHEN 'river_runner' THEN 'whitewater'
        WHEN 'downriver' THEN 'wildwater' END))
WHERE entity_type = 'material' AND original_data->>'category' = 'paddle'
  AND original_data->>'discipline' IN ('creek', 'river_runner', 'downriver');

-- Any other class on a paddle (a boat class from an old proposal or edit) has
-- no meaning now.
UPDATE materials SET discipline = 'other'
WHERE category = 'paddle'
  AND discipline::text NOT IN ('whitewater', 'freestyle', 'slalom', 'wildwater', 'touring', 'canoe', 'polo', 'other');

ALTER TABLE materials ADD CONSTRAINT chk_materials_discipline CHECK (
    discipline IS NULL
    OR CASE WHEN category = 'paddle'
        THEN discipline::text IN ('whitewater', 'freestyle', 'slalom', 'wildwater', 'touring', 'canoe', 'polo', 'other')
        ELSE discipline::text NOT IN ('whitewater', 'wildwater', 'canoe', 'polo')
    END
);
