BEGIN;

INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('spa_grand_prix_access_map_2027', 'Spa Grand Prix — Access map 2027',
     'https://www.spagrandprix.com/assets/7743e17e-9070-4e70-8158-35e1acfd2ebc/carte-tiket-waze.pdf',
     'Official website', '2026-08-30T00:00:00Z',
     'Официальная схема перечисляет парковочные зоны и подъездные коридоры; точный маршрут к месту парковки выдаётся ссылкой Waze/Google Maps в билете'),
    ('spa_grand_prix_parking_2027', 'Spa Grand Prix — Parking tickets and mobility FAQ 2027',
     'https://www.spagrandprix.com/en/ticketing/parkings',
     'Official website', '2026-08-30T00:00:00Z',
     'Официальные наименования парковочных продуктов; режим работы и правила проверены по разделу Access to the circuit: mobility')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

INSERT INTO atlas.travel_zones (
    id, circuit_id, zone_type, name, name_ru, description_ru, geometry,
    priority, event_only, valid_from, valid_to, source_id, properties,
    review_status
) VALUES
    ('spa-parking-yellow-2027', 'spa', 'parking',
     'Car Parking Yellow Area', 'Жёлтая парковочная зона',
     'Официальная автомобильная парковочная зона этапа 2027; точная площадка и маршрут должны быть получены из ссылки в билете',
     NULL, 80, true, '2027-07-17', '2027-07-19', 'spa_grand_prix_parking_2027',
     '{"eventSeason":2027,"accessMapLabel":"Yellow area","exactGeometryPending":true,"routingSource":"ticket_link"}'::jsonb, 'candidate'),
    ('spa-parking-yellow-bis-2027', 'spa', 'parking',
     'Car Parking Yellow Area Bis', 'Жёлтая парковочная зона Bis',
     'Официальная автомобильная парковочная зона этапа 2027; точная площадка и маршрут должны быть получены из ссылки в билете',
     NULL, 75, true, '2027-07-17', '2027-07-19', 'spa_grand_prix_parking_2027',
     '{"eventSeason":2027,"accessMapLabel":"Yellow Bis","exactGeometryPending":true,"routingSource":"ticket_link"}'::jsonb, 'candidate'),
    ('spa-parking-yellow-e25-2027', 'spa', 'parking',
     'Car Parking Yellow E25', 'Жёлтая парковочная зона E25',
     'Официальная автомобильная парковочная зона этапа 2027; точная площадка и маршрут должны быть получены из ссылки в билете',
     NULL, 75, true, '2027-07-17', '2027-07-19', 'spa_grand_prix_parking_2027',
     '{"eventSeason":2027,"accessMapLabel":"Yellow E25","exactGeometryPending":true,"routingSource":"ticket_link"}'::jsonb, 'candidate'),
    ('spa-parking-red-2027', 'spa', 'parking',
     'Car Parking Red Area', 'Красная парковочная зона',
     'Официальная автомобильная парковочная зона этапа 2027; точная площадка и маршрут должны быть получены из ссылки в билете',
     NULL, 80, true, '2027-07-17', '2027-07-19', 'spa_grand_prix_parking_2027',
     '{"eventSeason":2027,"accessMapLabel":"Red area","exactGeometryPending":true,"routingSource":"ticket_link"}'::jsonb, 'candidate'),
    ('spa-parking-green-2027', 'spa', 'parking',
     'Car Parking Green Area', 'Зелёная парковочная зона',
     'Официальная автомобильная парковочная зона этапа 2027; точная площадка и маршрут должны быть получены из ссылки в билете',
     NULL, 80, true, '2027-07-17', '2027-07-19', 'spa_grand_prix_parking_2027',
     '{"eventSeason":2027,"accessMapLabel":"Green area","exactGeometryPending":true,"routingSource":"ticket_link"}'::jsonb, 'candidate'),
    ('spa-parking-green-malmedy-shuttle-2027', 'spa', 'park_and_ride',
     'Car Parking Green — Malmedy + Shuttle (Asphalt)', 'Зелёная парковка Malmedy + трансфер',
     'Официальная асфальтированная парковка с трансфером для этапа 2027; точная площадка и маршрут должны быть получены из ссылки в билете',
     NULL, 85, true, '2027-07-17', '2027-07-19', 'spa_grand_prix_parking_2027',
     '{"eventSeason":2027,"accessMapLabel":"Malmedy + Shuttle / asphalt","exactGeometryPending":true,"routingSource":"ticket_link"}'::jsonb, 'candidate')
ON CONFLICT (id) DO UPDATE SET
    circuit_id = EXCLUDED.circuit_id,
    zone_type = EXCLUDED.zone_type,
    name = EXCLUDED.name,
    name_ru = EXCLUDED.name_ru,
    description_ru = EXCLUDED.description_ru,
    geometry = EXCLUDED.geometry,
    priority = EXCLUDED.priority,
    event_only = EXCLUDED.event_only,
    valid_from = EXCLUDED.valid_from,
    valid_to = EXCLUDED.valid_to,
    source_id = EXCLUDED.source_id,
    properties = EXCLUDED.properties,
    review_status = EXCLUDED.review_status,
    updated_at = now();

COMMIT;
