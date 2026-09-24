BEGIN;

ALTER TABLE atlas.travel_access_anchors
    ADD CONSTRAINT travel_access_anchors_circuit_poi_fk
    FOREIGN KEY (circuit_id, poi_id)
    REFERENCES atlas.circuit_travel_pois (circuit_id, poi_id)
    ON DELETE RESTRICT;

ALTER TABLE atlas.travel_access_anchors
    ADD CONSTRAINT travel_access_anchors_allowed_modes_check
    CHECK (travel_modes <@ ARRAY['car', 'transit', 'shuttle', 'walk', 'bicycle', 'mixed']::text[]);

COMMIT;
