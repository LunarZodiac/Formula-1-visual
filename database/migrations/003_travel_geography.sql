BEGIN;

CREATE TABLE atlas.travel_category_groups (
    id text PRIMARY KEY,
    name_ru text NOT NULL,
    marker_colour char(7) NOT NULL CHECK (marker_colour ~ '^#[0-9A-Fa-f]{6}$'),
    sort_order smallint NOT NULL DEFAULT 0,
    description_ru text
);

ALTER TABLE atlas.poi_categories
    ADD COLUMN group_id text REFERENCES atlas.travel_category_groups(id),
    ADD COLUMN name_en text,
    ADD COLUMN min_zoom numeric(4,1) NOT NULL DEFAULT 10,
    ADD COLUMN is_clustered boolean NOT NULL DEFAULT true;

ALTER TABLE atlas.tourism_pois
    ADD COLUMN name_ru text,
    ADD COLUMN description_ru text,
    ADD COLUMN original_language text,
    ADD COLUMN importance smallint NOT NULL DEFAULT 50 CHECK (importance BETWEEN 0 AND 100),
    ADD COLUMN price_band smallint CHECK (price_band BETWEEN 1 AND 4),
    ADD COLUMN typical_visit_minutes smallint CHECK (typical_visit_minutes IS NULL OR typical_visit_minutes > 0),
    ADD COLUMN booking_required boolean NOT NULL DEFAULT false,
    ADD COLUMN event_only boolean NOT NULL DEFAULT false,
    ADD COLUMN wheelchair_access text CHECK (wheelchair_access IS NULL OR wheelchair_access IN ('yes', 'limited', 'no', 'unknown')),
    ADD COLUMN seasonal_notes_ru text,
    ADD COLUMN review_status text NOT NULL DEFAULT 'candidate' CHECK (review_status IN ('candidate', 'reviewed', 'published', 'hidden')),
    ADD COLUMN verified_at timestamptz;

CREATE TABLE atlas.circuit_travel_profiles (
    circuit_id text PRIMARY KEY REFERENCES atlas.circuits(id) ON DELETE CASCADE,
    base_city_name text,
    timezone text,
    intro_ru text,
    arrival_advice_ru text,
    race_day_advice_ru text,
    accommodation_advice_ru text,
    target_poi_count smallint NOT NULL DEFAULT 50 CHECK (target_poi_count BETWEEN 20 AND 100),
    target_route_count smallint NOT NULL DEFAULT 6 CHECK (target_route_count BETWEEN 2 AND 20),
    target_zone_count smallint NOT NULL DEFAULT 4 CHECK (target_zone_count BETWEEN 1 AND 12),
    editorial_status text NOT NULL DEFAULT 'draft' CHECK (editorial_status IN ('draft', 'review', 'published')),
    source_id text REFERENCES atlas.data_sources(id),
    properties jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE atlas.circuit_travel_pois (
    circuit_id text NOT NULL REFERENCES atlas.circuits(id) ON DELETE CASCADE,
    poi_id text NOT NULL REFERENCES atlas.tourism_pois(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('transport', 'stay', 'explore', 'essential', 'circuit')),
    priority smallint NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
    is_featured boolean NOT NULL DEFAULT false,
    event_only boolean NOT NULL DEFAULT false,
    distance_to_circuit_m integer CHECK (distance_to_circuit_m IS NULL OR distance_to_circuit_m >= 0),
    travel_times jsonb NOT NULL DEFAULT '{}'::jsonb,
    editorial_note_ru text,
    valid_from_year smallint,
    valid_to_year smallint,
    source_id text REFERENCES atlas.data_sources(id),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (circuit_id, poi_id),
    CHECK (valid_to_year IS NULL OR valid_from_year IS NULL OR valid_to_year >= valid_from_year)
);

CREATE TABLE atlas.travel_zones (
    id text PRIMARY KEY,
    circuit_id text NOT NULL REFERENCES atlas.circuits(id) ON DELETE CASCADE,
    zone_type text NOT NULL CHECK (zone_type IN ('accommodation', 'parking', 'park_and_ride', 'access', 'restricted', 'walking', 'travel_time')),
    name text NOT NULL,
    name_ru text NOT NULL,
    description_ru text,
    geometry geography(MultiPolygon, 4326) NOT NULL,
    priority smallint NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
    price_band smallint CHECK (price_band BETWEEN 1 AND 4),
    best_for text[] NOT NULL DEFAULT ARRAY[]::text[],
    advantages_ru text[] NOT NULL DEFAULT ARRAY[]::text[],
    disadvantages_ru text[] NOT NULL DEFAULT ARRAY[]::text[],
    event_only boolean NOT NULL DEFAULT false,
    valid_from date,
    valid_to date,
    source_id text REFERENCES atlas.data_sources(id),
    properties jsonb NOT NULL DEFAULT '{}'::jsonb,
    review_status text NOT NULL DEFAULT 'candidate' CHECK (review_status IN ('candidate', 'reviewed', 'published', 'hidden')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE TABLE atlas.travel_zone_pois (
    zone_id text NOT NULL REFERENCES atlas.travel_zones(id) ON DELETE CASCADE,
    poi_id text NOT NULL REFERENCES atlas.tourism_pois(id) ON DELETE CASCADE,
    is_example boolean NOT NULL DEFAULT false,
    sort_order smallint NOT NULL DEFAULT 0,
    PRIMARY KEY (zone_id, poi_id)
);

CREATE TABLE atlas.travel_routes (
    id text PRIMARY KEY,
    circuit_id text NOT NULL REFERENCES atlas.circuits(id) ON DELETE CASCADE,
    route_type text NOT NULL CHECK (route_type IN ('arrival', 'race_day', 'event_shuttle', 'park_and_ride', 'tourist_half_day', 'tourist_full_day', 'walking', 'scenic_drive')),
    travel_mode text NOT NULL CHECK (travel_mode IN ('car', 'transit', 'shuttle', 'walk', 'bicycle', 'mixed')),
    name text NOT NULL,
    name_ru text NOT NULL,
    summary_ru text,
    geometry geography(LineString, 4326) NOT NULL,
    distance_m integer NOT NULL CHECK (distance_m > 0),
    duration_minutes smallint NOT NULL CHECK (duration_minutes > 0),
    difficulty text NOT NULL DEFAULT 'easy' CHECK (difficulty IN ('easy', 'moderate', 'difficult')),
    event_only boolean NOT NULL DEFAULT false,
    booking_required boolean NOT NULL DEFAULT false,
    accessibility_notes_ru text,
    schedule_notes_ru text,
    valid_from date,
    valid_to date,
    source_id text REFERENCES atlas.data_sources(id),
    route_engine text,
    route_engine_profile text,
    properties jsonb NOT NULL DEFAULT '{}'::jsonb,
    review_status text NOT NULL DEFAULT 'candidate' CHECK (review_status IN ('candidate', 'reviewed', 'published', 'hidden')),
    verified_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE TABLE atlas.travel_route_stops (
    route_id text NOT NULL REFERENCES atlas.travel_routes(id) ON DELETE CASCADE,
    sequence smallint NOT NULL CHECK (sequence > 0),
    poi_id text REFERENCES atlas.tourism_pois(id),
    name_ru text,
    location geography(Point, 4326),
    dwell_minutes smallint CHECK (dwell_minutes IS NULL OR dwell_minutes >= 0),
    instruction_ru text,
    PRIMARY KEY (route_id, sequence),
    CHECK (poi_id IS NOT NULL OR location IS NOT NULL)
);

CREATE INDEX circuit_travel_pois_role_idx ON atlas.circuit_travel_pois (circuit_id, role, priority DESC);
CREATE INDEX circuit_travel_pois_featured_idx ON atlas.circuit_travel_pois (circuit_id, is_featured) WHERE is_featured;
CREATE INDEX travel_zones_geometry_gix ON atlas.travel_zones USING gist (geometry);
CREATE INDEX travel_zones_circuit_type_idx ON atlas.travel_zones (circuit_id, zone_type);
CREATE INDEX travel_routes_geometry_gix ON atlas.travel_routes USING gist (geometry);
CREATE INDEX travel_routes_circuit_type_idx ON atlas.travel_routes (circuit_id, route_type);
CREATE INDEX tourism_pois_review_priority_idx ON atlas.tourism_pois (review_status, importance DESC);

INSERT INTO atlas.travel_category_groups (id, name_ru, marker_colour, sort_order, description_ru) VALUES
    ('transport', 'Транспорт', '#58C7E8', 10, 'Как добраться до региона и автодрома'),
    ('stay', 'Размещение', '#F2C14E', 20, 'Где остановиться во время этапа'),
    ('explore', 'Достопримечательности', '#A47CFF', 30, 'Что посмотреть в свободное время'),
    ('essential', 'Полезное рядом', '#7FD98A', 40, 'Практические объекты и сервисы'),
    ('circuit', 'Инфраструктура этапа', '#FF3158', 50, 'Входы, трибуны, фан-зоны и сервисы автодрома')
ON CONFLICT (id) DO UPDATE SET name_ru = EXCLUDED.name_ru, marker_colour = EXCLUDED.marker_colour, sort_order = EXCLUDED.sort_order, description_ru = EXCLUDED.description_ru;

INSERT INTO atlas.poi_categories (id, name_ru, name_en, icon, default_priority, group_id, min_zoom, is_clustered) VALUES
    ('airport', 'Аэропорт', 'Airport', 'airport', 90, 'transport', 7, false),
    ('railway_station', 'Железнодорожный вокзал', 'Railway station', 'train', 90, 'transport', 8, false),
    ('bus_station', 'Автостанция', 'Bus station', 'bus', 80, 'transport', 10, true),
    ('public_transport', 'Остановка транспорта', 'Public transport stop', 'transport', 65, 'transport', 12, true),
    ('event_shuttle', 'Трансфер этапа', 'Event shuttle', 'shuttle', 95, 'transport', 10, false),
    ('park_and_ride', 'Перехватывающая парковка', 'Park and ride', 'park-and-ride', 90, 'transport', 10, false),
    ('parking', 'Парковка', 'Parking', 'parking', 75, 'transport', 12, true),
    ('taxi', 'Такси', 'Taxi', 'taxi', 55, 'transport', 13, true),
    ('car_rental', 'Прокат автомобилей', 'Car rental', 'car', 55, 'transport', 11, true),
    ('hotel', 'Отель', 'Hotel', 'hotel', 65, 'stay', 11, true),
    ('hostel', 'Хостел', 'Hostel', 'hostel', 55, 'stay', 12, true),
    ('guest_house', 'Гостевой дом', 'Guest house', 'guest-house', 55, 'stay', 12, true),
    ('apartment', 'Апартаменты', 'Apartment', 'apartment', 50, 'stay', 13, true),
    ('camp_site', 'Кемпинг', 'Camp site', 'camping', 70, 'stay', 11, true),
    ('motorsport', 'Автомобильная история', 'Motorsport heritage', 'helmet', 85, 'explore', 9, false),
    ('museum', 'Музей', 'Museum', 'museum', 75, 'explore', 10, true),
    ('heritage', 'Историческое место', 'Heritage site', 'landmark', 70, 'explore', 10, true),
    ('architecture', 'Архитектура', 'Architecture', 'architecture', 60, 'explore', 11, true),
    ('nature', 'Природа', 'Nature', 'nature', 65, 'explore', 10, true),
    ('viewpoint', 'Смотровая площадка', 'Viewpoint', 'viewpoint', 65, 'explore', 11, true),
    ('family', 'Для всей семьи', 'Family attraction', 'family', 55, 'explore', 11, true),
    ('restaurant', 'Ресторан', 'Restaurant', 'restaurant', 50, 'essential', 13, true),
    ('supermarket', 'Супермаркет', 'Supermarket', 'supermarket', 45, 'essential', 13, true),
    ('pharmacy', 'Аптека', 'Pharmacy', 'pharmacy', 55, 'essential', 13, true),
    ('hospital', 'Медицинская помощь', 'Medical assistance', 'hospital', 75, 'essential', 11, false),
    ('tourist_information', 'Туристический центр', 'Tourist information', 'information', 60, 'essential', 11, true),
    ('circuit_access', 'Вход на автодром', 'Circuit entrance', 'gate', 100, 'circuit', 12, false),
    ('grandstand', 'Трибуна', 'Grandstand', 'grandstand', 95, 'circuit', 13, false),
    ('fan_zone', 'Фан-зона', 'Fan zone', 'flag', 90, 'circuit', 13, false)
ON CONFLICT (id) DO UPDATE SET name_ru = EXCLUDED.name_ru, name_en = EXCLUDED.name_en, icon = EXCLUDED.icon, default_priority = EXCLUDED.default_priority, group_id = EXCLUDED.group_id, min_zoom = EXCLUDED.min_zoom, is_clustered = EXCLUDED.is_clustered;

UPDATE atlas.poi_categories SET group_id = CASE id
    WHEN 'circuit_access' THEN 'circuit' WHEN 'grandstand' THEN 'circuit' WHEN 'fan_zone' THEN 'circuit'
    WHEN 'hotel' THEN 'stay' WHEN 'attraction' THEN 'explore'
    WHEN 'airport' THEN 'transport' WHEN 'parking' THEN 'transport' WHEN 'public_transport' THEN 'transport'
    ELSE COALESCE(group_id, 'essential') END
WHERE group_id IS NULL;

ALTER TABLE atlas.poi_categories ALTER COLUMN group_id SET NOT NULL;

INSERT INTO atlas.data_sources (id, name, url, licence, notes) VALUES
    ('openstreetmap', 'OpenStreetMap contributors', 'https://www.openstreetmap.org/copyright', 'ODbL-1.0', 'Координаты, категории и базовые свойства объектов'),
    ('wikidata', 'Wikidata', 'https://www.wikidata.org/', 'CC0-1.0', 'Локализованные названия, описания и внешние идентификаторы'),
    ('gtfs', 'GTFS transport feeds', 'https://gtfs.org/', 'Varies by agency', 'Расписания и геометрия общественного транспорта'),
    ('valhalla', 'Valhalla routing engine', 'https://valhalla.github.io/valhalla/', 'MIT', 'Расчёт маршрутов, времени в пути и зон доступности')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url, licence = EXCLUDED.licence, notes = EXCLUDED.notes;

COMMIT;
