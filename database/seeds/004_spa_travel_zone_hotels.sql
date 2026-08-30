BEGIN;

DELETE FROM atlas.travel_zone_pois
WHERE zone_id IN (SELECT id FROM atlas.travel_zones WHERE circuit_id = 'spa');

WITH ranked AS (
    SELECT
        zone.id AS zone_id,
        poi.id AS poi_id,
        row_number() OVER (
            PARTITION BY zone.id
            ORDER BY poi.importance DESC,
                     ST_Distance(poi.location, ST_Centroid(zone.geometry::geometry)::geography),
                     poi.id
        ) AS rank
    FROM atlas.travel_zones AS zone
    JOIN atlas.circuit_travel_pois AS selected
      ON selected.circuit_id = zone.circuit_id AND selected.role = 'stay'
    JOIN atlas.tourism_pois AS poi ON poi.id = selected.poi_id
    WHERE zone.circuit_id = 'spa'
      AND zone.zone_type = 'accommodation'
      AND poi.review_status <> 'hidden'
      AND ST_Intersects(zone.geometry, poi.location)
)
INSERT INTO atlas.travel_zone_pois (zone_id, poi_id, is_example, sort_order)
SELECT zone_id, poi_id, rank <= 5, rank
FROM ranked
ON CONFLICT (zone_id, poi_id) DO UPDATE SET
    is_example = EXCLUDED.is_example,
    sort_order = EXCLUDED.sort_order;

COMMIT;
