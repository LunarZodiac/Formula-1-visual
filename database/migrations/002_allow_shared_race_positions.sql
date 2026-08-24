BEGIN;

-- Early Formula 1 races allowed several drivers to share one car and therefore
-- the same classified position. A result is uniquely identified by its driver
-- within a session, not by the displayed position.
ALTER TABLE atlas.session_results
    DROP CONSTRAINT IF EXISTS session_results_pkey;

ALTER TABLE atlas.session_results
    DROP CONSTRAINT IF EXISTS session_results_session_id_driver_id_key;

ALTER TABLE atlas.session_results
    ADD CONSTRAINT session_results_pkey PRIMARY KEY (session_id, driver_id);

CREATE INDEX IF NOT EXISTS session_results_session_position_idx
    ON atlas.session_results (session_id, position_order);

COMMIT;
