BEGIN;

CREATE OR REPLACE FUNCTION atlas.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

ALTER TABLE atlas.constructor_entries
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE atlas.session_results
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE atlas.driver_standings
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE atlas.constructor_standings
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'seasons',
        'circuits',
        'drivers',
        'constructors',
        'constructor_entries',
        'races',
        'sessions',
        'session_results',
        'driver_standings',
        'constructor_standings'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS touch_updated_at ON atlas.%I', table_name);
        EXECUTE format(
            'CREATE TRIGGER touch_updated_at BEFORE UPDATE ON atlas.%I '
            'FOR EACH ROW EXECUTE FUNCTION atlas.touch_updated_at()',
            table_name
        );
    END LOOP;
END;
$$;

CREATE OR REPLACE VIEW atlas.web_export_freshness AS
SELECT
    season.year AS season_year,
    GREATEST(
        season.updated_at,
        COALESCE(races.changed_at, '-infinity'::timestamptz),
        COALESCE(circuits.changed_at, '-infinity'::timestamptz),
        COALESCE(sessions.changed_at, '-infinity'::timestamptz),
        COALESCE(results.changed_at, '-infinity'::timestamptz),
        COALESCE(drivers.changed_at, '-infinity'::timestamptz),
        COALESCE(entries.changed_at, '-infinity'::timestamptz),
        COALESCE(constructors.changed_at, '-infinity'::timestamptz),
        COALESCE(driver_standings.changed_at, '-infinity'::timestamptz),
        COALESCE(constructor_standings.changed_at, '-infinity'::timestamptz)
    ) AS changed_at
FROM atlas.seasons AS season
LEFT JOIN LATERAL (
    SELECT max(race.updated_at) AS changed_at
    FROM atlas.races AS race
    WHERE race.season_year = season.year
) AS races ON true
LEFT JOIN LATERAL (
    SELECT max(circuit.updated_at) AS changed_at
    FROM atlas.races AS race
    JOIN atlas.circuits AS circuit ON circuit.id = race.circuit_id
    WHERE race.season_year = season.year
) AS circuits ON true
LEFT JOIN LATERAL (
    SELECT max(session.updated_at) AS changed_at
    FROM atlas.races AS race
    JOIN atlas.sessions AS session ON session.race_id = race.id
    WHERE race.season_year = season.year
) AS sessions ON true
LEFT JOIN LATERAL (
    SELECT max(result.updated_at) AS changed_at
    FROM atlas.races AS race
    JOIN atlas.sessions AS session ON session.race_id = race.id
    JOIN atlas.session_results AS result ON result.session_id = session.id
    WHERE race.season_year = season.year
) AS results ON true
LEFT JOIN LATERAL (
    SELECT max(driver.updated_at) AS changed_at
    FROM atlas.races AS race
    JOIN atlas.sessions AS session ON session.race_id = race.id
    JOIN atlas.session_results AS result ON result.session_id = session.id
    JOIN atlas.drivers AS driver ON driver.id = result.driver_id
    WHERE race.season_year = season.year
) AS drivers ON true
LEFT JOIN LATERAL (
    SELECT max(entry.updated_at) AS changed_at
    FROM atlas.constructor_entries AS entry
    WHERE entry.season_year = season.year
) AS entries ON true
LEFT JOIN LATERAL (
    SELECT max(constructor.updated_at) AS changed_at
    FROM atlas.constructor_entries AS entry
    JOIN atlas.constructors AS constructor ON constructor.id = entry.constructor_id
    WHERE entry.season_year = season.year
) AS constructors ON true
LEFT JOIN LATERAL (
    SELECT max(standing.updated_at) AS changed_at
    FROM atlas.driver_standings AS standing
    WHERE standing.season_year = season.year
) AS driver_standings ON true
LEFT JOIN LATERAL (
    SELECT max(standing.updated_at) AS changed_at
    FROM atlas.constructor_standings AS standing
    WHERE standing.season_year = season.year
) AS constructor_standings ON true;

COMMIT;
