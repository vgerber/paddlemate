-- A section's deleted features, newest first, without walking the river's
-- whole history.
CREATE INDEX idx_entity_history_deleted_features
    ON entity_history (waterway_id, section_id, at DESC, id DESC)
    WHERE entity_kind = 'feature' AND kind = 'deleted';
