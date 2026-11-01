-- Paddles are grouped by use. The new values are used from the next migration
-- (a new enum value cannot be used in the transaction that adds it).
ALTER TYPE material_discipline ADD VALUE IF NOT EXISTS 'whitewater';
ALTER TYPE material_discipline ADD VALUE IF NOT EXISTS 'wildwater';
ALTER TYPE material_discipline ADD VALUE IF NOT EXISTS 'canoe';
ALTER TYPE material_discipline ADD VALUE IF NOT EXISTS 'polo';
