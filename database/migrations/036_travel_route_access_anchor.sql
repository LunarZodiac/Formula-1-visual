BEGIN;

CREATE TABLE atlas.travel_route_access_anchors (
    route_id text PRIMARY KEY
        REFERENCES atlas.travel_routes(id) ON DELETE CASCADE,
    anchor_id text NOT NULL
        REFERENCES atlas.travel_access_anchors(id) ON DELETE RESTRICT,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX travel_route_access_anchors_anchor_idx
    ON atlas.travel_route_access_anchors (anchor_id);

CREATE OR REPLACE FUNCTION atlas.enforce_travel_route_access_anchor_circuit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    route_circuit_id text;
    anchor_circuit_id text;
BEGIN
    -- Lock parents in a fixed order so concurrent circuit changes cannot race
    -- with creating or reassigning an endpoint.
    SELECT route.circuit_id
    INTO route_circuit_id
    FROM atlas.travel_routes AS route
    WHERE route.id = NEW.route_id
    FOR SHARE;

    SELECT anchor.circuit_id
    INTO anchor_circuit_id
    FROM atlas.travel_access_anchors AS anchor
    WHERE anchor.id = NEW.anchor_id
    FOR SHARE;

    -- Missing parents are reported by the foreign keys after this trigger.
    IF route_circuit_id IS NULL OR anchor_circuit_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF route_circuit_id IS DISTINCT FROM anchor_circuit_id THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                CONSTRAINT = 'travel_route_access_anchors_same_circuit',
                MESSAGE = format(
                    'Route %s and access anchor %s belong to different circuits',
                    NEW.route_id,
                    NEW.anchor_id
                );
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION atlas.enforce_travel_route_anchor_after_route_circuit_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.circuit_id IS DISTINCT FROM OLD.circuit_id
       AND EXISTS (
           SELECT 1
           FROM atlas.travel_route_access_anchors AS assignment
           JOIN atlas.travel_access_anchors AS anchor
             ON anchor.id = assignment.anchor_id
           WHERE assignment.route_id = NEW.id
             AND anchor.circuit_id IS DISTINCT FROM NEW.circuit_id
       ) THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                CONSTRAINT = 'travel_route_access_anchors_same_circuit',
                MESSAGE = format(
                    'Route %s cannot move to circuit %s while its access anchor belongs to another circuit',
                    NEW.id,
                    NEW.circuit_id
                );
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION atlas.enforce_travel_route_anchor_after_anchor_circuit_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.circuit_id IS DISTINCT FROM OLD.circuit_id
       AND EXISTS (
           SELECT 1
           FROM atlas.travel_route_access_anchors AS assignment
           JOIN atlas.travel_routes AS route
             ON route.id = assignment.route_id
           WHERE assignment.anchor_id = NEW.id
             AND route.circuit_id IS DISTINCT FROM NEW.circuit_id
       ) THEN
        RAISE EXCEPTION
            USING
                ERRCODE = '23514',
                CONSTRAINT = 'travel_route_access_anchors_same_circuit',
                MESSAGE = format(
                    'Access anchor %s cannot move to circuit %s while assigned routes belong to another circuit',
                    NEW.id,
                    NEW.circuit_id
                );
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_same_circuit
    BEFORE INSERT OR UPDATE OF route_id, anchor_id
    ON atlas.travel_route_access_anchors
    FOR EACH ROW
    EXECUTE FUNCTION atlas.enforce_travel_route_access_anchor_circuit();

CREATE TRIGGER enforce_access_anchor_circuit_on_route_update
    BEFORE UPDATE OF circuit_id ON atlas.travel_routes
    FOR EACH ROW
    EXECUTE FUNCTION atlas.enforce_travel_route_anchor_after_route_circuit_change();

CREATE TRIGGER enforce_route_circuit_on_access_anchor_update
    BEFORE UPDATE OF circuit_id ON atlas.travel_access_anchors
    FOR EACH ROW
    EXECUTE FUNCTION atlas.enforce_travel_route_anchor_after_anchor_circuit_change();

CREATE TRIGGER touch_updated_at
    BEFORE UPDATE ON atlas.travel_route_access_anchors
    FOR EACH ROW EXECUTE FUNCTION atlas.touch_updated_at();

COMMIT;
