BEGIN;

INSERT INTO atlas.data_sources (id, name, url, licence, retrieved_at, notes)
VALUES (
    'f1db-v2026-12-0',
    'F1DB — справочник пилотов v2026.12.0',
    'https://github.com/f1db/f1db/releases/tag/v2026.12.0',
    'CC BY 4.0',
    now(),
    'Источник для проверки исторических идентификаторов пилотов'
)
ON CONFLICT (id) DO NOTHING;

UPDATE atlas.drivers
SET given_name = 'Boy',
    family_name = 'Hayje',
    updated_at = now()
WHERE id = 'hayje'
  AND given_name = 'Boy'
  AND family_name = 'Lunger';

INSERT INTO atlas.driver_profiles (driver_id, name_ru, source_id, review_status, updated_at)
VALUES ('hayje', 'Бой Хайе', 'f1db-v2026-12-0', 'reviewed', now())
ON CONFLICT (driver_id) DO UPDATE SET
    name_ru = EXCLUDED.name_ru,
    source_id = EXCLUDED.source_id,
    review_status = 'reviewed',
    updated_at = now();

INSERT INTO atlas.driver_profile_field_sources
    (driver_id, field_name, source_id, source_url, retrieved_at, review_status, notes)
VALUES (
    'hayje',
    'name_ru',
    'f1db-v2026-12-0',
    'https://github.com/f1db/f1db/releases/tag/v2026.12.0',
    now(),
    'reviewed',
    'Исправлено ошибочное объединение Boy Hayje с Brett Lunger'
)
ON CONFLICT (driver_id, field_name, source_id) DO UPDATE SET
    source_url = EXCLUDED.source_url,
    retrieved_at = EXCLUDED.retrieved_at,
    review_status = EXCLUDED.review_status,
    notes = EXCLUDED.notes;

COMMIT;
