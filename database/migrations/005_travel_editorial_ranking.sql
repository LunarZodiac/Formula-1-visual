BEGIN;

CREATE OR REPLACE VIEW atlas.circuit_travel_candidate_queue AS
WITH scored AS (
    SELECT
        ctp.circuit_id,
        ctp.poi_id,
        ctp.role,
        p.category_id,
        pc.name_ru AS category_name_ru,
        p.name,
        p.name_ru,
        p.review_status,
        p.location,
        ctp.distance_to_circuit_m,
        round((
            p.importance * 0.25
            + ctp.priority * 0.35
            + pc.default_priority * 0.20
            + CASE
                WHEN ctp.distance_to_circuit_m <= 5000 THEN 20
                WHEN ctp.distance_to_circuit_m <= 15000 THEN 15
                WHEN ctp.distance_to_circuit_m <= 30000 THEN 10
                WHEN ctp.distance_to_circuit_m <= 50000 THEN 5
                ELSE 0
              END
            + CASE WHEN ctp.is_featured THEN 20 ELSE 0 END
        )::numeric, 2) AS selection_score
    FROM atlas.circuit_travel_pois ctp
    JOIN atlas.tourism_pois p ON p.id = ctp.poi_id
    JOIN atlas.poi_categories pc ON pc.id = p.category_id
    WHERE p.review_status <> 'hidden'
), ranked AS (
    SELECT
        scored.*,
        row_number() OVER (
            PARTITION BY circuit_id, category_id
            ORDER BY selection_score DESC, distance_to_circuit_m, poi_id
        ) AS category_rank
    FROM scored
)
SELECT * FROM ranked;

COMMIT;
