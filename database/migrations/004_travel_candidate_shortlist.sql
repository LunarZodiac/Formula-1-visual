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
            p.importance * 0.55
            + pc.default_priority * 0.25
            + CASE
                WHEN ctp.distance_to_circuit_m <= 5000 THEN 20
                WHEN ctp.distance_to_circuit_m <= 15000 THEN 15
                WHEN ctp.distance_to_circuit_m <= 30000 THEN 10
                WHEN ctp.distance_to_circuit_m <= 50000 THEN 5
                ELSE 0
              END
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

CREATE OR REPLACE VIEW atlas.circuit_travel_recommended_pois AS
WITH diverse AS (
    SELECT queue.*
    FROM atlas.circuit_travel_candidate_queue queue
    WHERE category_rank <= CASE category_id
        WHEN 'airport' THEN 4
        WHEN 'railway_station' THEN 6
        WHEN 'bus_station' THEN 6
        WHEN 'park_and_ride' THEN 6
        WHEN 'hotel' THEN 7
        WHEN 'hostel' THEN 4
        WHEN 'guest_house' THEN 6
        WHEN 'apartment' THEN 6
        WHEN 'camp_site' THEN 6
        WHEN 'motorsport' THEN 8
        WHEN 'museum' THEN 8
        WHEN 'heritage' THEN 8
        WHEN 'nature' THEN 8
        WHEN 'viewpoint' THEN 8
        WHEN 'attraction' THEN 8
        WHEN 'tourist_information' THEN 4
        WHEN 'pharmacy' THEN 4
        WHEN 'hospital' THEN 4
        WHEN 'supermarket' THEN 4
        WHEN 'circuit_access' THEN 20
        WHEN 'grandstand' THEN 20
        WHEN 'fan_zone' THEN 20
        ELSE 5
    END
), role_ranked AS (
    SELECT
        diverse.*,
        row_number() OVER (
            PARTITION BY circuit_id, role
            ORDER BY selection_score DESC, distance_to_circuit_m, poi_id
        ) AS role_rank
    FROM diverse
), balanced AS (
    SELECT role_ranked.*
    FROM role_ranked
    WHERE role_rank <= CASE role
        WHEN 'transport' THEN 15
        WHEN 'stay' THEN 15
        WHEN 'explore' THEN 25
        WHEN 'essential' THEN 10
        WHEN 'circuit' THEN 15
    END
), final_ranked AS (
    SELECT
        balanced.*,
        row_number() OVER (
            PARTITION BY circuit_id
            ORDER BY
                CASE role
                    WHEN 'transport' THEN 1
                    WHEN 'stay' THEN 2
                    WHEN 'explore' THEN 3
                    WHEN 'essential' THEN 4
                    WHEN 'circuit' THEN 5
                END,
                role_rank
        ) AS shortlist_order
    FROM balanced
)
SELECT final_ranked.*
FROM final_ranked
JOIN atlas.circuit_travel_profiles profile ON profile.circuit_id = final_ranked.circuit_id
WHERE shortlist_order <= profile.target_poi_count;

COMMIT;
