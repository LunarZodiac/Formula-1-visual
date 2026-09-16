BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM atlas.track_layouts
        WHERE id = 'it-1922'
          AND circuit_id = 'monza'
          AND centerline IS NOT NULL
          AND provenance_type = 'user_digitized'
          AND review_status IN ('reviewed', 'published')
    ) THEN
        RAISE EXCEPTION 'Проверенный самостоятельно оцифрованный контур Монцы it-1922 не найден';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM atlas.races
        WHERE circuit_id = 'monza'
          AND season_year BETWEEN 2000 AND 2026
          AND layout_id IS NOT NULL
          AND layout_id <> 'it-1922'
    ) THEN
        RAISE EXCEPTION 'У этапа Монцы 2000–2026 годов уже назначена другая конфигурация';
    END IF;
END
$$;

UPDATE atlas.track_layouts
SET name = 'Современная конфигурация Монцы',
    valid_from_year = 2000,
    valid_to_year = 2026,
    length_m = 5793,
    metadata = metadata || jsonb_build_object(
        'periodSourceId', 'monza_circuit_official',
        'periodSourceUrl', 'https://www.monzanet.it/en/history/',
        'periodVerificationNoteRu', 'Современная конфигурация после перестройки Variante del Rettifilo летом 2000 года; более ранним этапам не назначается',
        'periodVerifiedAt', '2026-09-14'
    ),
    updated_at = now()
WHERE id = 'it-1922'
  AND circuit_id = 'monza';

UPDATE atlas.races
SET layout_id = 'it-1922',
    updated_at = now()
WHERE circuit_id = 'monza'
  AND season_year BETWEEN 2000 AND 2026
  AND layout_id IS DISTINCT FROM 'it-1922';

COMMIT;
