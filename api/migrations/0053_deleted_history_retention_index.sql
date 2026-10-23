-- The retention purge finds expired deletes of every entity kind by time.
CREATE INDEX idx_entity_history_deleted_at
    ON entity_history (at)
    WHERE kind = 'deleted';
