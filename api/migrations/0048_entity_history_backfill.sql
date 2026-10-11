-- Give every existing river, section and feature its first history step, and
-- turn accepted proposals into steps. Only rows that predate the history
-- writes are touched; from here on the API records steps itself.

-- A river has no creator column; it counts as imported when the Rivermap
-- importer made any of its sections.
INSERT INTO entity_history
    (entity_kind, entity_id, waterway_id, kind, source_id, changes, at)
SELECT 'waterway', w.id, w.id,
       CASE WHEN r.imported THEN 'imported' ELSE 'created' END,
       CASE WHEN r.imported THEN 'import:rivermap' END,
       COALESCE((
           SELECT jsonb_agg(jsonb_build_object('field', v.f, 'before', NULL::text, 'after', v.a))
           FROM (VALUES ('name', left(w.name, 200)), ('description', left(w.description, 200))) v(f, a)
           WHERE v.a IS NOT NULL
       ), '[]'),
       w.created_at
FROM waterways w
CROSS JOIN LATERAL (
    SELECT EXISTS (
        SELECT 1 FROM water_sections s
        WHERE s.waterway_id = w.id AND s.created_by = 'rivermap-import'
    ) AS imported
) r;

INSERT INTO entity_history
    (entity_kind, entity_id, waterway_id, section_id, kind, actor_id, source_id, changes, at)
SELECT 'section', s.id, s.waterway_id, s.id,
       CASE WHEN s.created_by = 'rivermap-import' THEN 'imported' ELSE 'created' END,
       u.id,
       CASE WHEN s.created_by = 'rivermap-import' THEN 'import:rivermap' END,
       COALESCE((
           SELECT jsonb_agg(jsonb_build_object('field', v.f, 'before', NULL::text, 'after', v.a))
           FROM (VALUES ('name', left(s.name, 200)),
                        ('description', left(s.description, 200)),
                        ('country', s.country)) v(f, a)
           WHERE v.a IS NOT NULL
       ), '[]'),
       s.created_at
FROM water_sections s
LEFT JOIN users u ON u.id = s.created_by;

INSERT INTO entity_history
    (entity_kind, entity_id, waterway_id, section_id, kind, actor_id, source_id, changes, at)
SELECT 'feature', f.id, s.waterway_id, s.id,
       CASE WHEN i.imported THEN 'imported' ELSE 'created' END,
       u.id,
       CASE WHEN i.imported THEN 'import:rivermap' END,
       jsonb_build_array(jsonb_build_object(
           'field', 'feature_type', 'before', NULL::text, 'after', f.feature_type::text)),
       f.created_at
FROM features f
JOIN water_sections s ON s.id = f.section_id
LEFT JOIN users u ON u.id = f.created_by
CROSS JOIN LATERAL (
    SELECT f.created_by = 'rivermap-import' OR f.created_by LIKE 'rivermap:%' AS imported
) i;

-- Rows that came in through an accepted "create" proposal: attribute the
-- first step to the proposal. The proposal does not record what it created,
-- so match on what it asked for.
UPDATE entity_history h
SET kind = 'proposal_accepted', actor_id = p.submitted_by,
    proposal_id = p.id, reviewer_id = p.reviewed_by
FROM proposals p
JOIN waterways w ON lower(w.name) = lower(p.proposed_data->>'name')
WHERE p.entity_type = 'waterway' AND p.operation = 'create' AND p.status = 'approved'
  AND h.entity_kind = 'waterway' AND h.entity_id = w.id AND h.kind = 'created';

UPDATE waterways w
SET created_by = p.submitted_by
FROM proposals p
WHERE p.entity_type = 'waterway' AND p.operation = 'create' AND p.status = 'approved'
  AND lower(w.name) = lower(p.proposed_data->>'name');

UPDATE entity_history h
SET kind = 'proposal_accepted', actor_id = p.submitted_by,
    proposal_id = p.id, reviewer_id = p.reviewed_by
FROM proposals p
JOIN water_sections s
  ON s.created_by = p.submitted_by
 AND s.name = p.proposed_data->>'name'
 AND p.proposed_data->>'waterway_id' ~ '^[0-9]+$'
 AND s.waterway_id = (p.proposed_data->>'waterway_id')::bigint
WHERE p.entity_type = 'water_section' AND p.operation = 'create' AND p.status = 'approved'
  AND h.entity_kind = 'section' AND h.entity_id = s.id AND h.kind = 'created';

UPDATE entity_history h
SET kind = 'proposal_accepted', actor_id = m.submitted_by,
    proposal_id = m.id, reviewer_id = m.reviewed_by
FROM (
    SELECT DISTINCT ON (f.id) f.id AS feature_id, p.id, p.submitted_by, p.reviewed_by
    FROM proposals p
    JOIN features f
      ON f.created_by = p.submitted_by
     AND p.proposed_data->>'section_id' ~ '^[0-9]+$'
     AND f.section_id = (p.proposed_data->>'section_id')::bigint
     AND f.feature_type::text = p.proposed_data->>'feature_type'
     AND abs(extract(epoch FROM (f.created_at - p.updated_at))) < 60
    WHERE p.entity_type = 'feature' AND p.operation = 'create' AND p.status = 'approved'
    ORDER BY f.id, abs(extract(epoch FROM (f.created_at - p.updated_at)))
) m
WHERE h.entity_kind = 'feature' AND h.entity_id = m.feature_id AND h.kind = 'created';

-- Accepted edits. The diff comes from the snapshot taken at submission; a
-- proposal without one still gets its step, with no field list.
INSERT INTO entity_history
    (entity_kind, entity_id, waterway_id, section_id, kind, actor_id, proposal_id,
     reviewer_id, changes, at)
SELECT t.kind, t.entity_id, t.waterway_id, t.section_id, 'proposal_accepted',
       p.submitted_by, p.id, p.reviewed_by,
       COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                      'field', k,
                      'before', CASE WHEN k = 'location' THEN NULL ELSE left(p.original_data->>k, 200) END,
                      'after', CASE WHEN k = 'location' THEN NULL ELSE left(p.proposed_data->>k, 200) END)
                  ORDER BY k)
           FROM unnest(CASE t.kind
                           WHEN 'waterway' THEN ARRAY['name', 'description']
                           WHEN 'section' THEN ARRAY['name', 'description', 'country', 'regions', 'location']
                           ELSE ARRAY['feature_type', 'name', 'description', 'location']
                       END) k
           WHERE p.original_data IS NOT NULL
             AND jsonb_typeof(p.proposed_data->k) IS DISTINCT FROM 'null'
             AND p.proposed_data->k IS NOT NULL
             AND p.proposed_data->k IS DISTINCT FROM p.original_data->k
       ), '[]'),
       p.updated_at
FROM proposals p
JOIN (
    SELECT 'waterway'::text AS kind, w.id AS entity_id, w.id AS waterway_id,
           NULL::bigint AS section_id, 'waterway'::text AS etype
    FROM waterways w
    UNION ALL
    SELECT 'section', s.id, s.waterway_id, s.id, 'water_section' FROM water_sections s
    UNION ALL
    SELECT 'feature', f.id, s.waterway_id, s.id, 'feature'
    FROM features f JOIN water_sections s ON s.id = f.section_id
) t ON t.etype = p.entity_type AND t.entity_id = p.entity_id
WHERE p.operation = 'update' AND p.status = 'approved';

-- Accepted deletes of features whose section is still there; the feature's
-- history stays readable through its old path.
INSERT INTO entity_history
    (entity_kind, entity_id, waterway_id, section_id, kind, actor_id, proposal_id,
     reviewer_id, at)
SELECT 'feature', p.entity_id, s.waterway_id, s.id, 'deleted',
       p.submitted_by, p.id, p.reviewed_by, p.updated_at
FROM proposals p
JOIN water_sections s
  ON p.proposed_data->>'section_id' ~ '^[0-9]+$'
 AND s.id = (p.proposed_data->>'section_id')::bigint
WHERE p.entity_type = 'feature' AND p.operation = 'delete' AND p.status = 'approved'
  AND p.entity_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM features f WHERE f.id = p.entity_id);
