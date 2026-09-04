BEGIN;

INSERT INTO atlas.data_sources (id, name, licence, notes)
VALUES (
    'user_provided_team_media_2024_2026',
    'Архивы логотипов и болидов, предоставленные владельцем проекта',
    'Rights unresolved',
    'Локальные файлы из пользовательских архивов за сезоны 2024–2026; происхождение и права требуют отдельной проверки'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    licence = EXCLUDED.licence,
    notes = EXCLUDED.notes;

INSERT INTO atlas.media_assets (
    id, entity_type, entity_id, media_type, usage_role, url, alt_text_ru,
    season_year, is_primary, source_id, provenance_type, rights_status,
    review_status, usage_scope
)
SELECT
    entry.constructor_id || '-' || entry.season_year || '-logo',
    'constructor', entry.constructor_id, 'image', 'team_logo',
    entry.logo_image_url,
    'Логотип команды ' || constructor.name || ' в сезоне ' || entry.season_year,
    entry.season_year, true, 'user_provided_team_media_2024_2026',
    'provided_by_user', 'unresolved', 'candidate',
    ARRAY['standings', 'results', 'constructor_profile']::text[]
FROM atlas.constructor_entries AS entry
JOIN atlas.constructors AS constructor ON constructor.id = entry.constructor_id
WHERE entry.season_year BETWEEN 2024 AND 2026
  AND entry.logo_image_url IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
    url = EXCLUDED.url,
    alt_text_ru = EXCLUDED.alt_text_ru,
    usage_role = EXCLUDED.usage_role,
    source_id = EXCLUDED.source_id,
    provenance_type = EXCLUDED.provenance_type,
    rights_status = EXCLUDED.rights_status,
    review_status = EXCLUDED.review_status,
    usage_scope = EXCLUDED.usage_scope;

INSERT INTO atlas.media_assets (
    id, entity_type, entity_id, media_type, usage_role, url, alt_text_ru,
    season_year, is_primary, source_id, provenance_type, rights_status,
    review_status, usage_scope
)
SELECT
    entry.constructor_id || '-' || entry.season_year || '-car',
    'constructor', entry.constructor_id, 'image', 'constructor_car',
    entry.car_image_url,
    'Болид команды ' || constructor.name || ' в сезоне ' || entry.season_year,
    entry.season_year, true, 'user_provided_team_media_2024_2026',
    'provided_by_user', 'unresolved', 'candidate',
    ARRAY['constructor_standings', 'constructor_profile']::text[]
FROM atlas.constructor_entries AS entry
JOIN atlas.constructors AS constructor ON constructor.id = entry.constructor_id
WHERE entry.season_year BETWEEN 2024 AND 2026
  AND entry.car_image_url IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
    url = EXCLUDED.url,
    alt_text_ru = EXCLUDED.alt_text_ru,
    usage_role = EXCLUDED.usage_role,
    source_id = EXCLUDED.source_id,
    provenance_type = EXCLUDED.provenance_type,
    rights_status = EXCLUDED.rights_status,
    review_status = EXCLUDED.review_status,
    usage_scope = EXCLUDED.usage_scope;

COMMIT;
