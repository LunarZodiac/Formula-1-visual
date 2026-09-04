BEGIN;

INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('spa_grand_prix_mobility_2027', 'Spa Grand Prix — Access to the circuit: mobility',
     'https://www.spagrandprix.com/en/faqs/cat19_access-to-the-circuit-mobility',
     'Official website', '2026-08-30T00:00:00Z',
     'Точка высадки и отправления трансфера Вервье-Центральный — Rue de Sart перед кольцом Trou Hennet; расписание относится к этапу 2027'),
    ('osm_trou_hennet', 'OpenStreetMap — Trou Hennet and Rue de Sart',
     'https://www.openstreetmap.org/node/782749200', 'ODbL-1.0',
     '2026-08-30T00:00:00Z',
     'Координаты ближайшего размеченного перехода на Rue de Sart перед кольцом N62/N640; проверено также по OSM way 759551621'),
    ('osm_spa_combes_gate', 'OpenStreetMap — Entrance Combes',
     'https://www.openstreetmap.org/node/910505532', 'ODbL-1.0',
     '2026-08-30T00:00:00Z',
     'Размеченные ворота Entrance Combes; используются только как конечный ориентир черновых маршрутов, не как подтверждение доступа в дни этапа')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

INSERT INTO atlas.tourism_pois (
    id, category_id, name, name_ru, description_ru, original_language,
    location, is_curated, source_id, importance, event_only,
    review_status, verified_at, properties
) VALUES (
    'spa-event-shuttle-trou-hennet',
    'event_shuttle',
    'Trou Hennet event shuttle stop',
    'Остановка трансфера Trou Hennet',
    'Официальная точка высадки и отправления трансфера между вокзалом Вервье-Центральный и этапом в Спа-Франкоршам',
    'fr',
    ST_SetSRID(ST_MakePoint(5.9529001, 50.4625845), 4326)::geography,
    true,
    'osm_trou_hennet',
    100,
    true,
    'reviewed',
    '2026-08-30T00:00:00Z',
    '{"osmNodeId":782749200,"coordinateRole":"nearest_mapped_crossing_before_roundabout","eventSeason":2027}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    category_id = EXCLUDED.category_id,
    name = EXCLUDED.name,
    name_ru = EXCLUDED.name_ru,
    description_ru = EXCLUDED.description_ru,
    original_language = EXCLUDED.original_language,
    location = EXCLUDED.location,
    is_curated = EXCLUDED.is_curated,
    source_id = EXCLUDED.source_id,
    importance = EXCLUDED.importance,
    event_only = EXCLUDED.event_only,
    review_status = EXCLUDED.review_status,
    verified_at = EXCLUDED.verified_at,
    properties = EXCLUDED.properties,
    updated_at = now();

INSERT INTO atlas.tourism_pois (
    id, category_id, name, name_ru, description_ru, original_language,
    location, is_curated, source_id, importance, event_only,
    review_status, verified_at, properties
) VALUES (
    'spa-routing-anchor-combes',
    'circuit_access',
    'Entrance Combes routing anchor',
    'Ориентир у въезда Combes',
    'Конечный ориентир черновых автомобильных маршрутов рядом с полигоном трассы; доступ во время конкретного этапа проверяется отдельно',
    'en',
    ST_SetSRID(ST_MakePoint(5.9774658, 50.4293502), 4326)::geography,
    true,
    'osm_spa_combes_gate',
    90,
    false,
    'reviewed',
    '2026-08-30T00:00:00Z',
    '{"osmNodeId":910505532,"coordinateRole":"draft_route_anchor","eventAccessConfirmed":false}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    category_id = EXCLUDED.category_id,
    name = EXCLUDED.name,
    name_ru = EXCLUDED.name_ru,
    description_ru = EXCLUDED.description_ru,
    original_language = EXCLUDED.original_language,
    location = EXCLUDED.location,
    is_curated = EXCLUDED.is_curated,
    source_id = EXCLUDED.source_id,
    importance = EXCLUDED.importance,
    event_only = EXCLUDED.event_only,
    review_status = EXCLUDED.review_status,
    verified_at = EXCLUDED.verified_at,
    properties = EXCLUDED.properties,
    updated_at = now();

INSERT INTO atlas.circuit_travel_pois (
    circuit_id, poi_id, role, priority, is_featured, event_only,
    editorial_note_ru, source_id
) VALUES (
    'spa',
    'spa-routing-anchor-combes',
    'circuit',
    90,
    false,
    false,
    'Только конечный ориентир черновых маршрутов; не показывать как подтверждённый вход этапа',
    'osm_spa_combes_gate'
)
ON CONFLICT (circuit_id, poi_id) DO UPDATE SET
    role = EXCLUDED.role,
    priority = EXCLUDED.priority,
    is_featured = EXCLUDED.is_featured,
    event_only = EXCLUDED.event_only,
    editorial_note_ru = EXCLUDED.editorial_note_ru,
    source_id = EXCLUDED.source_id,
    updated_at = now();

INSERT INTO atlas.circuit_travel_pois (
    circuit_id, poi_id, role, priority, is_featured, event_only,
    editorial_note_ru, valid_from_year, valid_to_year, source_id
) VALUES (
    'spa',
    'spa-event-shuttle-trou-hennet',
    'transport',
    100,
    false,
    true,
    'Использовать как конечную точку официального трансфера; не строить маршрут к центру полигона трассы',
    2027,
    2027,
    'spa_grand_prix_mobility_2027'
)
ON CONFLICT (circuit_id, poi_id) DO UPDATE SET
    role = EXCLUDED.role,
    priority = EXCLUDED.priority,
    is_featured = EXCLUDED.is_featured,
    event_only = EXCLUDED.event_only,
    editorial_note_ru = EXCLUDED.editorial_note_ru,
    valid_from_year = EXCLUDED.valid_from_year,
    valid_to_year = EXCLUDED.valid_to_year,
    source_id = EXCLUDED.source_id,
    updated_at = now();

UPDATE atlas.travel_routes
SET review_status = 'hidden',
    source_id = 'spa_grand_prix_mobility_2027',
    schedule_notes_ru = 'Геометрия прежнего кандидата вела к центру автодрома и скрыта. Публикация возможна только после получения официальной линии трансфера до Trou Hennet.',
    verified_at = NULL,
    updated_at = now()
WHERE id = 'spa-route-verviers-shuttle'
  AND review_status <> 'published';

DELETE FROM atlas.travel_route_stops
WHERE route_id = 'spa-route-verviers-shuttle';

INSERT INTO atlas.travel_route_stops (
    route_id, sequence, poi_id, name_ru, instruction_ru
)
SELECT 'spa-route-verviers-shuttle', 1, 'osm-node-26446051',
       'Вокзал Вервье-Центральный', 'Посадка перед вокзалом'
WHERE EXISTS (SELECT 1 FROM atlas.travel_routes WHERE id = 'spa-route-verviers-shuttle')
UNION ALL
SELECT 'spa-route-verviers-shuttle', 2, 'spa-event-shuttle-trou-hennet',
       'Остановка трансфера Trou Hennet', 'Высадка на Rue de Sart перед кольцом'
WHERE EXISTS (SELECT 1 FROM atlas.travel_routes WHERE id = 'spa-route-verviers-shuttle');

COMMIT;
