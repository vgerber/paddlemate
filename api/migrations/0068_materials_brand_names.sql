-- Brand names without the product suffix ("Spade Kayaks" is Spade). The brand
-- is a name, not an opinion, so every row changes, edited or not. The identity
-- key holds the brand: a clash with an existing row would fail this migration.

CREATE TEMP TABLE brand_rename (old_name text PRIMARY KEY, new_name text NOT NULL) ON COMMIT DROP;
INSERT INTO brand_rename VALUES
    ('Spade Kayaks', 'Spade'), ('Waka Kayaks', 'Waka'), ('Fluid Kayaks', 'Fluid'),
    ('EXO Kayaks', 'EXO'), ('Zet Kayaks', 'Zet'), ('Jackson Kayak', 'Jackson'),
    ('AT Paddles', 'AT'), ('VE Paddles', 'VE'), ('Lendal (Celtic Paddles)', 'Lendal');

UPDATE materials m SET brand = r.new_name
FROM brand_rename r WHERE m.brand = r.old_name;

UPDATE material_images i SET credit = r.new_name
FROM brand_rename r WHERE i.credit = r.old_name;

UPDATE proposals p SET proposed_data = jsonb_set(p.proposed_data, '{brand}', to_jsonb(r.new_name))
FROM brand_rename r
WHERE p.entity_type = 'material' AND p.proposed_data->>'brand' = r.old_name;

UPDATE proposals p SET original_data = jsonb_set(p.original_data, '{brand}', to_jsonb(r.new_name))
FROM brand_rename r
WHERE p.entity_type = 'material' AND p.original_data->>'brand' = r.old_name;
