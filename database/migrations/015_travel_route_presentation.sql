BEGIN;

CREATE TABLE atlas.travel_route_presentations (
    route_id text PRIMARY KEY REFERENCES atlas.travel_routes(id) ON DELETE CASCADE,
    route_group text NOT NULL,
    sort_order smallint NOT NULL DEFAULT 0,
    line_offset_px numeric(5,2) NOT NULL DEFAULT 0
        CHECK (line_offset_px BETWEEN -24 AND 24),
    line_colour char(7) NOT NULL DEFAULT '#FF3158'
        CHECK (line_colour ~ '^#[0-9A-Fa-f]{6}$'),
    min_zoom numeric(4,1) NOT NULL DEFAULT 7 CHECK (min_zoom BETWEEN 0 AND 24),
    max_zoom numeric(4,1) NOT NULL DEFAULT 18 CHECK (max_zoom BETWEEN 0 AND 24),
    visible_by_default boolean NOT NULL DEFAULT false,
    notes_ru text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (max_zoom >= min_zoom),
    UNIQUE (route_group, line_offset_px)
);

CREATE INDEX travel_route_presentations_group_order_idx
    ON atlas.travel_route_presentations (route_group, sort_order);

CREATE OR REPLACE VIEW atlas.travel_route_web_geometries AS
SELECT
    route.id,
    route.circuit_id,
    route.route_type,
    route.travel_mode,
    route.review_status,
    presentation.route_group,
    presentation.sort_order,
    presentation.line_offset_px,
    presentation.line_colour,
    presentation.min_zoom,
    presentation.max_zoom,
    presentation.visible_by_default,
    ST_Force2D(route.geometry::geometry) AS geometry_full,
    ST_Transform(
        ST_SimplifyPreserveTopology(
            ST_Transform(ST_Force2D(route.geometry::geometry), 3857), 25
        ), 4326
    ) AS geometry_detail,
    ST_Transform(
        ST_SimplifyPreserveTopology(
            ST_Transform(ST_Force2D(route.geometry::geometry), 3857), 100
        ), 4326
    ) AS geometry_overview
FROM atlas.travel_routes AS route
JOIN atlas.travel_route_presentations AS presentation
  ON presentation.route_id = route.id;

COMMIT;
