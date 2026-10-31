-- A user may have one pending update or delete per material entry.
CREATE UNIQUE INDEX uniq_proposals_material_pending_change
    ON proposals (submitted_by, entity_id)
    WHERE entity_type = 'material'
      AND status = 'pending'
      AND operation IN ('update', 'delete');
