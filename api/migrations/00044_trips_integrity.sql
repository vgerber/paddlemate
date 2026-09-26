-- Rules the route layer used to police, moved to where no code path can
-- forget them.

-- A watched section is a plan, not a record: if the run is deleted from the
-- map it simply drops off the watch lists, rather than a private list nobody
-- else can see blocking the deletion.
ALTER TABLE trip_sections
    DROP CONSTRAINT trip_sections_section_id_fkey,
    ADD CONSTRAINT trip_sections_section_id_fkey
        FOREIGN KEY (section_id) REFERENCES water_sections(id) ON DELETE CASCADE;

-- Reordering a watch list moves positions past each other, so the
-- one-row-per-position rule is checked at commit, not per statement. It
-- stays immediate unless a transaction asks otherwise.
ALTER TABLE trip_sections
    DROP CONSTRAINT trip_sections_stay_id_sort_order_key,
    ADD CONSTRAINT trip_sections_stay_id_sort_order_key
        UNIQUE (stay_id, sort_order) DEFERRABLE INITIALLY IMMEDIATE;

-- Covered by trip_sections_stay_id_section_id_key, which leads on stay_id.
DROP INDEX idx_trip_sections_stay;

-- Candidates are edited by the whole trip, so they carry a version like
-- trips and stays do.
ALTER TABLE trip_stay_candidates
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD CONSTRAINT trip_stay_candidates_id_trip_key UNIQUE (id, trip_id);

-- Only members vote, and leaving takes your votes with you: the vote hangs
-- off the membership, the same way attendance does.
ALTER TABLE trip_stay_candidate_votes ADD COLUMN trip_id BIGINT;

UPDATE trip_stay_candidate_votes v
   SET trip_id = c.trip_id
  FROM trip_stay_candidates c
 WHERE c.id = v.candidate_id;

DELETE FROM trip_stay_candidate_votes v
 WHERE NOT EXISTS (SELECT 1 FROM trip_members tm
                    WHERE tm.trip_id = v.trip_id AND tm.user_id = v.user_id);

ALTER TABLE trip_stay_candidate_votes
    ALTER COLUMN trip_id SET NOT NULL,
    DROP CONSTRAINT trip_stay_candidate_votes_candidate_id_fkey,
    DROP CONSTRAINT trip_stay_candidate_votes_user_id_fkey,
    ADD CONSTRAINT trip_stay_candidate_votes_candidate_fkey
        FOREIGN KEY (candidate_id, trip_id)
        REFERENCES trip_stay_candidates (id, trip_id) ON DELETE CASCADE,
    ADD CONSTRAINT trip_stay_candidate_votes_member_fkey
        FOREIGN KEY (trip_id, user_id)
        REFERENCES trip_members (trip_id, user_id) ON DELETE CASCADE;

-- Covered by the primary key, which leads on candidate_id.
DROP INDEX trip_stay_candidate_votes_candidate_id_idx;
CREATE INDEX trip_stay_candidate_votes_member_idx
    ON trip_stay_candidate_votes (trip_id, user_id);

-- A log is linked to a trip only while its owner is on it. Leaving unlinks
-- the log (the log itself stays), so a private log is never shown to a trip
-- its owner has walked away from.
UPDATE descents d
   SET trip_id = NULL
 WHERE d.trip_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM trip_members tm
                    WHERE tm.trip_id = d.trip_id AND tm.user_id = d.user_id);

ALTER TABLE descents
    ADD CONSTRAINT descents_trip_member_fkey
        FOREIGN KEY (trip_id, user_id)
        REFERENCES trip_members (trip_id, user_id) ON DELETE SET NULL (trip_id);

DROP INDEX idx_descents_trip;
CREATE INDEX idx_descents_trip ON descents (trip_id, user_id);
