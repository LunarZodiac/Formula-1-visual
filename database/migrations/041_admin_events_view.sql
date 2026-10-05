BEGIN;

CREATE OR REPLACE VIEW atlas.admin_events
WITH (security_invoker = true)
AS
SELECT
    race.id,
    race.season_year,
    race.round,
    race.name,
    race.race_date,
    race.start_time_utc,
    race.status,
    race.circuit_id,
    COALESCE(profile.name_ru, circuit.short_name, circuit.name) AS circuit_name,
    race.layout_id,
    layout.name AS layout_name,
    source.url AS source_url,
    race.updated_at,
    (
        SELECT count(*)::integer
        FROM atlas.sessions AS session
        WHERE session.race_id = race.id
    ) AS session_count,
    (
        SELECT count(*)::integer
        FROM atlas.sessions AS session
        WHERE session.race_id = race.id AND session.status = 'completed'
    ) AS completed_session_count,
    (
        SELECT count(*)::integer
        FROM atlas.session_results AS result
        JOIN atlas.sessions AS session ON session.id = result.session_id
        WHERE session.race_id = race.id
    ) AS result_count,
    winner.driver_id AS winner_id,
    winner.name AS winner_name
FROM atlas.races AS race
JOIN atlas.circuits AS circuit ON circuit.id = race.circuit_id
LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id
LEFT JOIN atlas.track_layouts AS layout
    ON layout.id = race.layout_id AND layout.circuit_id = race.circuit_id
LEFT JOIN atlas.data_sources AS source ON source.id = race.source_id
LEFT JOIN LATERAL (
    SELECT
        result.driver_id,
        COALESCE(driver_profile.name_ru, concat_ws(' ', driver.given_name, driver.family_name)) AS name
    FROM atlas.sessions AS session
    JOIN atlas.session_results AS result
        ON result.session_id = session.id AND result.position_order = 1
    JOIN atlas.drivers AS driver ON driver.id = result.driver_id
    LEFT JOIN atlas.driver_profiles AS driver_profile ON driver_profile.driver_id = driver.id
    WHERE session.race_id = race.id AND session.session_type = 'race'
    LIMIT 1
) AS winner ON true;

REVOKE ALL ON atlas.admin_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON atlas.admin_events TO service_role;

COMMIT;
