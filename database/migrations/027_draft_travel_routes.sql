BEGIN;

ALTER TABLE atlas.travel_routes
    ALTER COLUMN geometry DROP NOT NULL;

ALTER TABLE atlas.travel_routes
    ADD CONSTRAINT travel_routes_reviewed_geometry_check CHECK (
        review_status IN ('candidate', 'hidden') OR geometry IS NOT NULL
    );

COMMIT;
