BEGIN;

ALTER TABLE atlas.track_layouts
    ADD COLUMN provenance_type text NOT NULL DEFAULT 'unknown'
        CHECK (provenance_type IN ('unknown', 'official', 'open_data', 'user_digitized')),
    ADD COLUMN review_status text NOT NULL DEFAULT 'candidate'
        CHECK (review_status IN ('candidate', 'reviewed', 'published', 'rejected')),
    ADD COLUMN verified_at timestamptz;

CREATE INDEX track_layouts_review_status_idx
    ON atlas.track_layouts (review_status, circuit_id);

COMMIT;
