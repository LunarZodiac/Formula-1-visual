BEGIN;

ALTER TABLE atlas.travel_routes
    ALTER COLUMN distance_m DROP NOT NULL,
    ALTER COLUMN duration_minutes DROP NOT NULL;

ALTER TABLE atlas.travel_routes
    DROP CONSTRAINT travel_routes_reviewed_geometry_check;

ALTER TABLE atlas.travel_routes
    ADD CONSTRAINT travel_routes_publishable_content_check CHECK (
        review_status IN ('candidate', 'hidden')
        OR (
            geometry IS NOT NULL
            AND distance_m IS NOT NULL
            AND duration_minutes IS NOT NULL
        )
    );

COMMIT;
