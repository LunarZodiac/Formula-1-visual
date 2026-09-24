BEGIN;

ALTER TABLE atlas.travel_routes
    ADD COLUMN route_variant_kind text NOT NULL DEFAULT 'recommended',
    ADD COLUMN display_priority smallint NOT NULL DEFAULT 100,
    ADD COLUMN geometry_mode text NOT NULL DEFAULT 'routed',
    ADD COLUMN lifecycle text NOT NULL DEFAULT 'active',
    ADD COLUMN archived_at timestamptz,
    ADD COLUMN optimize_waypoint_order boolean NOT NULL DEFAULT false,
    ADD COLUMN optimization_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE atlas.travel_routes
    ADD CONSTRAINT travel_routes_variant_kind_check
        CHECK (route_variant_kind IN ('recommended', 'fastest', 'shortest', 'loop', 'manual')),
    ADD CONSTRAINT travel_routes_display_priority_check
        CHECK (display_priority BETWEEN 0 AND 100),
    ADD CONSTRAINT travel_routes_loop_secondary_check
        CHECK (route_variant_kind <> 'loop' OR display_priority <= 49),
    ADD CONSTRAINT travel_routes_geometry_mode_check
        CHECK (geometry_mode IN ('routed', 'waypoints', 'freehand')),
    ADD CONSTRAINT travel_routes_lifecycle_check
        CHECK (lifecycle IN ('draft', 'active', 'archived')),
    ADD CONSTRAINT travel_routes_archive_timestamp_check
        CHECK ((lifecycle = 'archived') = (archived_at IS NOT NULL)),
    ADD CONSTRAINT travel_routes_optimization_metadata_object_check
        CHECK (jsonb_typeof(optimization_metadata) = 'object');

-- Existing routes remain active; newly created routes start as drafts until they
-- are deliberately activated. review_status continues to govern editorial review.
ALTER TABLE atlas.travel_routes
    ALTER COLUMN lifecycle SET DEFAULT 'draft';

COMMENT ON COLUMN atlas.travel_routes.route_variant_kind IS
    'Role of this route among alternatives; loop variants are secondary by display priority';
COMMENT ON COLUMN atlas.travel_routes.display_priority IS
    'Display priority ordered descending; loop variants are restricted to 0..49';
COMMENT ON COLUMN atlas.travel_routes.geometry_mode IS
    'How route geometry is authored: routing engine, ordered waypoints, or freehand line';
COMMENT ON COLUMN atlas.travel_routes.lifecycle IS
    'Retention lifecycle independent from editorial review_status; archive instead of deleting';
COMMENT ON COLUMN atlas.travel_routes.optimize_waypoint_order IS
    'Whether waypoint-order optimization is requested; does not assert that optimization ran';
COMMENT ON COLUMN atlas.travel_routes.optimization_metadata IS
    'Optimization request or provenance metadata; optimized results are not persisted without evidence';

CREATE INDEX travel_routes_circuit_lifecycle_priority_idx
    ON atlas.travel_routes (circuit_id, lifecycle, display_priority DESC, id);

COMMIT;
