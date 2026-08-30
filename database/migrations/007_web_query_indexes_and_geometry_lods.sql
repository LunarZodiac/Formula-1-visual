BEGIN;

-- Read paths used by circuit pages, season exports and editorial tools.
CREATE INDEX IF NOT EXISTS track_layouts_circuit_period_idx
    ON atlas.track_layouts (circuit_id, valid_from_year, valid_to_year);
CREATE INDEX IF NOT EXISTS track_features_layout_type_sequence_idx
    ON atlas.track_features (layout_id, feature_type, sequence);
CREATE INDEX IF NOT EXISTS races_circuit_season_idx
    ON atlas.races (circuit_id, season_year DESC);
CREATE INDEX IF NOT EXISTS session_results_constructor_entry_idx
    ON atlas.session_results (constructor_entry_id)
    WHERE constructor_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS media_assets_entity_season_idx
    ON atlas.media_assets (entity_type, entity_id, season_year);
CREATE UNIQUE INDEX IF NOT EXISTS media_assets_one_primary_idx
    ON atlas.media_assets (entity_type, entity_id, media_type, COALESCE(season_year, 0))
    WHERE is_primary;
CREATE INDEX IF NOT EXISTS tourism_pois_review_category_priority_idx
    ON atlas.tourism_pois (review_status, category_id, importance DESC);
CREATE INDEX IF NOT EXISTS travel_routes_publication_idx
    ON atlas.travel_routes (circuit_id, review_status, route_type);
CREATE INDEX IF NOT EXISTS travel_zones_publication_idx
    ON atlas.travel_zones (circuit_id, review_status, zone_type);
CREATE INDEX IF NOT EXISTS travel_zone_pois_poi_idx
    ON atlas.travel_zone_pois (poi_id);
CREATE INDEX IF NOT EXISTS travel_route_stops_poi_idx
    ON atlas.travel_route_stops (poi_id)
    WHERE poi_id IS NOT NULL;

-- Three stable geometry levels for web exports. Simplification happens in
-- projected metres and never replaces the canonical centerline.
CREATE OR REPLACE VIEW atlas.track_layout_web_geometries AS
SELECT
    layout.id,
    layout.circuit_id,
    layout.name,
    layout.valid_from_year,
    layout.valid_to_year,
    ST_Force2D(layout.centerline) AS centerline_full,
    ST_Transform(
        ST_SimplifyPreserveTopology(ST_Transform(ST_Force2D(layout.centerline), 3857), 25),
        4326
    ) AS centerline_detail,
    ST_Transform(
        ST_SimplifyPreserveTopology(ST_Transform(ST_Force2D(layout.centerline), 3857), 150),
        4326
    ) AS centerline_overview
FROM atlas.track_layouts AS layout
WHERE layout.centerline IS NOT NULL;

COMMIT;
