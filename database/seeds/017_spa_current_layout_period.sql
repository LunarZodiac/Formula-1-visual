BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM atlas.track_layouts
        WHERE id = 'be-1925'
          AND circuit_id = 'spa'
          AND centerline IS NOT NULL
          AND provenance_type = 'user_digitized'
          AND review_status IN ('reviewed', 'published')
    ) THEN
        RAISE EXCEPTION 'Проверенный самостоятельно оцифрованный контур Спа be-1925 не найден';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM atlas.races
        WHERE circuit_id = 'spa'
          AND season_year >= 2007
          AND layout_id IS NOT NULL
          AND layout_id <> 'be-1925'
    ) THEN
        RAISE EXCEPTION 'У этапа Спа с 2007 года уже назначена другая конфигурация';
    END IF;
END
$$;

UPDATE atlas.track_layouts
SET name = 'Современная конфигурация Спа-Франкоршам',
    valid_from_year = 2007,
    valid_to_year = NULL,
    length_m = 7004,
    turns = 19,
    metadata = metadata || jsonb_build_object(
        'periodSourceId', 'spa_circuit_official',
        'periodVerificationNoteRu', 'Современная конфигурация после реконструкции 2007 года; более ранним этапам не назначается',
        'periodVerifiedAt', '2026-08-31'
    ),
    updated_at = now()
WHERE id = 'be-1925'
  AND circuit_id = 'spa';

UPDATE atlas.races
SET layout_id = 'be-1925',
    updated_at = now()
WHERE circuit_id = 'spa'
  AND season_year >= 2007
  AND layout_id IS DISTINCT FROM 'be-1925';

COMMIT;
