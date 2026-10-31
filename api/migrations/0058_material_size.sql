-- The size of an entry within its model (S, M, L, 65, 8.5), apart from the
-- edition kept in `variant`. A model is (category, brand, model, variant); its
-- entries are its sizes.
ALTER TABLE materials ADD COLUMN size TEXT;
ALTER TABLE materials ADD CONSTRAINT chk_materials_size
    CHECK (COALESCE(length(btrim(size)), 1) BETWEEN 1 AND 40);

-- The key gains the size, so the entries of one model no longer need distinct
-- variants. Dropped first: the move below makes several rows share a variant.
DROP INDEX materials_identity_key;


UPDATE materials m SET size = v.size, variant = v.variant
FROM (VALUES
    ('kayak'::material_category, '1', '1', NULL),
    ('kayak'::material_category, '10', '10', NULL),
    ('kayak'::material_category, '10.0', '10.0', NULL),
    ('kayak'::material_category, '10.4', '10.4', NULL),
    ('kayak'::material_category, '175', '175', NULL),
    ('kayak'::material_category, '180', '180', NULL),
    ('kayak'::material_category, '185', '185', NULL),
    ('kayak'::material_category, '195', '195', NULL),
    ('kayak'::material_category, '2.0', '2.0', NULL),
    ('kayak'::material_category, '222', '222', NULL),
    ('kayak'::material_category, '232', '232', NULL),
    ('kayak'::material_category, '236', '236', NULL),
    ('kayak'::material_category, '242', '242', NULL),
    ('kayak'::material_category, '252', '252', NULL),
    ('kayak'::material_category, '260', '260', NULL),
    ('kayak'::material_category, '300', '300', NULL),
    ('kayak'::material_category, '35', '35', NULL),
    ('kayak'::material_category, '41', '41', NULL),
    ('kayak'::material_category, '44', '44', NULL),
    ('kayak'::material_category, '45', '45', NULL),
    ('kayak'::material_category, '47', '47', NULL),
    ('kayak'::material_category, '48', '48', NULL),
    ('kayak'::material_category, '49', '49', NULL),
    ('kayak'::material_category, '5.5', '5.5', NULL),
    ('kayak'::material_category, '5.9', '5.9', NULL),
    ('kayak'::material_category, '50', '50', NULL),
    ('kayak'::material_category, '52', '52', NULL),
    ('kayak'::material_category, '54', '54', NULL),
    ('kayak'::material_category, '55', '55', NULL),
    ('kayak'::material_category, '56', '56', NULL),
    ('kayak'::material_category, '57', '57', NULL),
    ('kayak'::material_category, '58', '58', NULL),
    ('kayak'::material_category, '59', '59', NULL),
    ('kayak'::material_category, '6.0', '6.0', NULL),
    ('kayak'::material_category, '6.1', '6.1', NULL),
    ('kayak'::material_category, '6.2', '6.2', NULL),
    ('kayak'::material_category, '6.3', '6.3', NULL),
    ('kayak'::material_category, '6.9', '6.9', NULL),
    ('kayak'::material_category, '60', '60', NULL),
    ('kayak'::material_category, '62', '62', NULL),
    ('kayak'::material_category, '64', '64', NULL),
    ('kayak'::material_category, '65', '65', NULL),
    ('kayak'::material_category, '67', '67', NULL),
    ('kayak'::material_category, '69', '69', NULL),
    ('kayak'::material_category, '7.1', '7.1', NULL),
    ('kayak'::material_category, '7.3', '7.3', NULL),
    ('kayak'::material_category, '7.5 (2005)', '7.5', '2005'),
    ('kayak'::material_category, '7.6', '7.6', NULL),
    ('kayak'::material_category, '7.8', '7.8', NULL),
    ('kayak'::material_category, '70', '70', NULL),
    ('kayak'::material_category, '72', '72', NULL),
    ('kayak'::material_category, '73', '73', NULL),
    ('kayak'::material_category, '74', '74', NULL),
    ('kayak'::material_category, '75', '75', NULL),
    ('kayak'::material_category, '76', '76', NULL),
    ('kayak'::material_category, '79', '79', NULL),
    ('kayak'::material_category, '8.0', '8.0', NULL),
    ('kayak'::material_category, '8.0 (2005)', '8.0', '2005'),
    ('kayak'::material_category, '8.1', '8.1', NULL),
    ('kayak'::material_category, '8.5', '8.5', NULL),
    ('kayak'::material_category, '8.5 (2005)', '8.5', '2005'),
    ('kayak'::material_category, '8.6', '8.6', NULL),
    ('kayak'::material_category, '80', '80', NULL),
    ('kayak'::material_category, '83', '83', NULL),
    ('kayak'::material_category, '85', '85', NULL),
    ('kayak'::material_category, '88', '88', NULL),
    ('kayak'::material_category, '9', '9', NULL),
    ('kayak'::material_category, '9.0', '9.0', NULL),
    ('kayak'::material_category, '9.7', '9.7', NULL),
    ('kayak'::material_category, '90', '90', NULL),
    ('kayak'::material_category, '93', '93', NULL),
    ('kayak'::material_category, '95', '95', NULL),
    ('kayak'::material_category, 'L', 'L', NULL),
    ('kayak'::material_category, 'LG', 'L', NULL),
    ('kayak'::material_category, 'Large', 'L', NULL),
    ('kayak'::material_category, 'M', 'M', NULL),
    ('kayak'::material_category, 'M/L', 'M/L', NULL),
    ('kayak'::material_category, 'MD', 'M', NULL),
    ('kayak'::material_category, 'MD/LG', 'M/L', NULL),
    ('kayak'::material_category, 'Medium', 'M', NULL),
    ('kayak'::material_category, 'Medium/Large', 'M/L', NULL),
    ('kayak'::material_category, 'M|L', 'M/L', NULL),
    ('kayak'::material_category, 'S', 'S', NULL),
    ('kayak'::material_category, 'S/M', 'S/M', NULL),
    ('kayak'::material_category, 'SM', 'S', NULL),
    ('kayak'::material_category, 'SM/MD', 'S/M', NULL),
    ('kayak'::material_category, 'Small', 'S', NULL),
    ('kayak'::material_category, 'XL', 'XL', NULL),
    ('kayak'::material_category, 'XS', 'XS', NULL),
    ('paddle'::material_category, 'L', 'L', NULL),
    ('paddle'::material_category, 'M', 'M', NULL),
    ('paddle'::material_category, 'S', 'S', NULL)
) AS v(category, old_variant, size, variant)
WHERE m.category = v.category
  AND m.variant = v.old_variant
  AND m.created_by = 'system-catalogue'
  AND m.updated_by IS NULL;

CREATE UNIQUE INDEX materials_identity_key ON materials (
    category, lower(btrim(brand)), lower(btrim(model)),
    lower(btrim(COALESCE(variant, ''))), lower(btrim(COALESCE(size, '')))
);
