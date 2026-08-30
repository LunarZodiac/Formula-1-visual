BEGIN;

INSERT INTO atlas.data_sources (id, name, url, licence, notes) VALUES
    ('spa_grand_prix', 'Spa Grand Prix', 'https://www.spagrandprix.com/', 'Official website', 'Официальная транспортная информация гоночного уик-энда'),
    ('visit_wallonia', 'VISITWallonia', 'https://visitwallonia.com/', 'Official tourism website', 'Официальная туристическая информация Валлонии')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    notes = EXCLUDED.notes;

UPDATE atlas.circuit_travel_profiles
SET
    arrival_advice_ru = 'Основной общественный маршрут проходит через Вервье-Центральный, откуда в дни Гран-при курсирует платный трансфер к трассе',
    race_day_advice_ru = 'Парковки требуют предварительного бронирования; официальный трансфер и совместные поездки предпочтительнее автомобиля у входа',
    accommodation_advice_ru = 'Франкоршам и Мальмеди удобны для короткой поездки, Спа — для городской инфраструктуры, Ставло и Труа-Пон — для спокойного отдыха',
    source_id = 'spa_grand_prix',
    properties = properties || '{"transportVerified":"2026-08-27","tourismVerified":"2026-08-27"}'::jsonb,
    updated_at = now()
WHERE circuit_id = 'spa';

UPDATE atlas.tourism_pois
SET review_status = 'hidden', updated_at = now()
WHERE id IN (
    'osm-way-837551906',
    'osm-way-47249361',
    'osm-node-986026125',
    'osm-way-1356927941',
    'osm-way-41939703',
    'osm-node-1914655307',
    'osm-node-8338933025',
    'osm-node-10560407203',
    'osm-way-1315916169'
);

UPDATE atlas.tourism_pois
SET
    category_id = 'motorsport',
    name_ru = 'Трасса Спа-Франкоршам',
    description_ru = 'Легендарный автодром в Арденнах и центральная точка гоночного уик-энда',
    typical_visit_minutes = 120,
    review_status = 'reviewed',
    verified_at = now(),
    updated_at = now()
WHERE id = 'osm-way-234804574';

UPDATE atlas.tourism_pois
SET
    name_ru = CASE id
        WHEN 'osm-node-4021608031' THEN 'Станция Спа-Жеронстер'
        WHEN 'osm-node-4021608030' THEN 'Станция Спа'
        WHEN 'osm-node-4333858841' THEN 'Станция Труа-Пон'
        WHEN 'osm-node-26446051' THEN 'Вокзал Вервье-Центральный'
        WHEN 'osm-node-5307127700' THEN 'Вокзал Льеж-Гийемен'
        WHEN 'osm-node-3070631211' THEN 'Главный вокзал Ахена'
        WHEN 'osm-way-363819134' THEN 'Аэропорт Льеж'
        WHEN 'osm-way-6344354' THEN 'Аэропорт Маастрихт-Ахен'
        WHEN 'osm-way-389958279' THEN 'Аэропорт Люксембург'
        WHEN 'osm-relation-2269304' THEN 'Аэропорт Кёльн/Бонн'
        WHEN 'osm-way-63223157' THEN 'Аэропорт Брюссель-Шарлеруа'
        WHEN 'osm-way-143269312' THEN 'Аэропорт Дюссельдорф'
        WHEN 'osm-way-370594935' THEN 'Аэропорт Брюссель'
        ELSE name_ru
    END,
    review_status = 'reviewed',
    verified_at = now(),
    updated_at = now()
WHERE id IN (
    'osm-node-4021608031', 'osm-node-4021608030', 'osm-node-4333858841', 'osm-node-26446051',
    'osm-node-5307127700', 'osm-node-3070631211', 'osm-way-363819134',
    'osm-way-6344354', 'osm-way-389958279', 'osm-relation-2269304',
    'osm-way-63223157', 'osm-way-143269312', 'osm-way-370594935'
);

UPDATE atlas.circuit_travel_pois
SET
    priority = CASE poi_id
        WHEN 'osm-node-5307127700' THEN 100
        WHEN 'osm-node-26446051' THEN 100
        WHEN 'osm-node-4021608030' THEN 92
        WHEN 'osm-node-4333858841' THEN 90
        WHEN 'osm-node-4021608031' THEN 82
        WHEN 'osm-node-3070631211' THEN 80
        WHEN 'osm-way-370594935' THEN 100
        WHEN 'osm-way-63223157' THEN 98
        WHEN 'osm-relation-2269304' THEN 96
        WHEN 'osm-way-143269312' THEN 94
        WHEN 'osm-way-389958279' THEN 92
        WHEN 'osm-way-6344354' THEN 86
        WHEN 'osm-way-363819134' THEN 78
        ELSE priority
    END,
    is_featured = true,
    source_id = 'spa_grand_prix',
    editorial_note_ru = 'Проверить расписание и доступность трансфера для выбранного года',
    updated_at = now()
WHERE circuit_id = 'spa' AND poi_id IN (
    'osm-node-5307127700', 'osm-node-26446051', 'osm-node-4021608030', 'osm-node-4333858841',
    'osm-node-4021608031', 'osm-node-3070631211', 'osm-way-370594935',
    'osm-way-63223157', 'osm-relation-2269304', 'osm-way-143269312',
    'osm-way-389958279', 'osm-way-6344354', 'osm-way-363819134'
);

UPDATE atlas.tourism_pois
SET
    name_ru = CASE id
        WHEN 'osm-node-1931226811' THEN 'Музей трассы Спа-Франкоршам'
        WHEN 'osm-way-1418726543' THEN 'Аббатство Ставло'
        WHEN 'osm-node-2018449851' THEN 'Малмундариум'
        WHEN 'osm-node-5771053254' THEN 'Водопад Коо'
        WHEN 'osm-way-105586318' THEN 'Замок Рейнхардштайн'
        WHEN 'osm-node-1955780257' THEN 'Сигнал-де-Ботранж'
        WHEN 'osm-relation-1346961' THEN 'Природный центр Ботранж'
        WHEN 'osm-node-2292957653' THEN 'Водопад Байон'
        WHEN 'osm-relation-17885242' THEN 'Замок Франшимон'
        WHEN 'osm-node-1489845082' THEN 'Пещеры Ремушам'
        WHEN 'osm-way-89341118' THEN 'Казино Спа'
        ELSE name_ru
    END,
    review_status = 'reviewed',
    verified_at = now(),
    updated_at = now()
WHERE id IN (
    'osm-node-1931226811', 'osm-way-1418726543', 'osm-node-2018449851',
    'osm-node-5771053254', 'osm-way-105586318', 'osm-node-1955780257',
    'osm-relation-1346961', 'osm-node-2292957653', 'osm-relation-17885242',
    'osm-node-1489845082', 'osm-way-89341118'
);

UPDATE atlas.circuit_travel_pois
SET
    priority = 96,
    is_featured = true,
    source_id = 'visit_wallonia',
    updated_at = now()
WHERE circuit_id = 'spa' AND poi_id IN (
    'osm-way-234804574', 'osm-node-1931226811', 'osm-way-1418726543',
    'osm-node-2018449851', 'osm-node-5771053254', 'osm-way-105586318',
    'osm-node-1955780257', 'osm-relation-1346961', 'osm-node-2292957653',
    'osm-relation-17885242', 'osm-node-1489845082', 'osm-way-89341118'
);

COMMIT;
