BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM (VALUES
            ('2010-01', 'bahrain', 'bh-bahrain-endurance-2010'),
            ('2020-15', 'bahrain', 'bh-2002'),
            ('2020-16', 'bahrain', 'bh-2020-outer')
        ) AS expected(race_id, circuit_id, layout_id)
        LEFT JOIN atlas.races AS race
          ON race.id = expected.race_id
         AND race.circuit_id = expected.circuit_id
        LEFT JOIN atlas.track_layouts AS layout
          ON layout.id = expected.layout_id
         AND layout.circuit_id = expected.circuit_id
        WHERE race.id IS NULL OR layout.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Не найдены ожидаемые этапы или конфигурации Бахрейна';
    END IF;
END
$$;

UPDATE atlas.races AS race
SET layout_id = assignment.layout_id,
    updated_at = now()
FROM (VALUES
    ('2010-01', 'bh-bahrain-endurance-2010'),
    ('2020-15', 'bh-2002'),
    ('2020-16', 'bh-2020-outer')
) AS assignment(race_id, layout_id)
WHERE race.id = assignment.race_id
  AND race.circuit_id = 'bahrain'
  AND race.layout_id IS DISTINCT FROM assignment.layout_id;

COMMIT;
