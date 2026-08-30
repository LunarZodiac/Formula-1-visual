INSERT INTO atlas.circuit_travel_profiles (
    circuit_id,
    base_city_name,
    timezone,
    intro_ru,
    arrival_advice_ru,
    race_day_advice_ru,
    accommodation_advice_ru,
    target_poi_count,
    target_route_count,
    target_zone_count,
    editorial_status,
    properties
)
SELECT
    'spa',
    'Спа / Мальмеди / Ставло',
    'Europe/Brussels',
    'Путеводитель по Арденнам вокруг трассы Спа-Франкоршам',
    'Сравниваем прибытие через крупные аэропорты, железнодорожные станции и автомобильные маршруты',
    'Отдельно показываем официальные трансферы, парковки, входы и ограничения гоночного уик-энда',
    'Размещение группируется по районам, времени в пути, ценовой категории и удобству без автомобиля',
    60,
    8,
    6,
    'draft',
    '{"pilot": true, "selectionStrategy": "expanded-curated", "publicPoiLimit": 60}'::jsonb
WHERE EXISTS (SELECT 1 FROM atlas.circuits WHERE id = 'spa')
ON CONFLICT (circuit_id) DO UPDATE SET
    base_city_name = EXCLUDED.base_city_name,
    timezone = EXCLUDED.timezone,
    intro_ru = EXCLUDED.intro_ru,
    arrival_advice_ru = EXCLUDED.arrival_advice_ru,
    race_day_advice_ru = EXCLUDED.race_day_advice_ru,
    accommodation_advice_ru = EXCLUDED.accommodation_advice_ru,
    target_poi_count = EXCLUDED.target_poi_count,
    target_route_count = EXCLUDED.target_route_count,
    target_zone_count = EXCLUDED.target_zone_count,
    properties = EXCLUDED.properties,
    updated_at = now();
