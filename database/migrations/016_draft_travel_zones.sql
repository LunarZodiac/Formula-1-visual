BEGIN;

ALTER TABLE atlas.travel_zones
    ALTER COLUMN geometry DROP NOT NULL;

ALTER TABLE atlas.travel_zones
    ADD CONSTRAINT travel_zones_reviewed_geometry_check CHECK (
        review_status IN ('candidate', 'hidden') OR geometry IS NOT NULL
    );

COMMIT;
