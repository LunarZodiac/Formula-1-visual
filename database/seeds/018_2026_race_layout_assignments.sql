BEGIN;

DO $$
DECLARE
    race_count integer;
    resolved_count integer;
BEGIN
    SELECT count(*) INTO race_count
    FROM atlas.races
    WHERE season_year = 2026;

    SELECT count(*) INTO resolved_count
    FROM (
        SELECT race.id
        FROM atlas.races AS race
        JOIN atlas.track_layouts AS layout
          ON layout.circuit_id = race.circuit_id
         AND layout.metadata->>'importedForSeason' = '2026'
         AND layout.centerline IS NOT NULL
         AND layout.provenance_type <> 'unknown'
         AND layout.review_status IN ('reviewed', 'published')
        WHERE race.season_year = 2026
        GROUP BY race.id
        HAVING count(layout.id) = 1
    ) AS resolved;

    IF race_count = 0 OR resolved_count <> race_count THEN
        RAISE EXCEPTION
            'Нельзя однозначно назначить конфигурации сезона 2026: этапов %, разрешено %',
            race_count, resolved_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM atlas.races AS race
        JOIN atlas.track_layouts AS layout
          ON layout.circuit_id = race.circuit_id
         AND layout.metadata->>'importedForSeason' = '2026'
         AND layout.centerline IS NOT NULL
         AND layout.provenance_type <> 'unknown'
         AND layout.review_status IN ('reviewed', 'published')
        WHERE race.season_year = 2026
          AND race.layout_id IS NOT NULL
          AND race.layout_id <> layout.id
    ) THEN
        RAISE EXCEPTION 'У этапа сезона 2026 уже назначена другая конфигурация';
    END IF;
END
$$;

UPDATE atlas.races AS race
SET layout_id = layout.id,
    updated_at = now()
FROM atlas.track_layouts AS layout
WHERE race.season_year = 2026
  AND layout.circuit_id = race.circuit_id
  AND layout.metadata->>'importedForSeason' = '2026'
  AND layout.centerline IS NOT NULL
  AND layout.provenance_type <> 'unknown'
  AND layout.review_status IN ('reviewed', 'published')
  AND race.layout_id IS DISTINCT FROM layout.id;

COMMIT;
