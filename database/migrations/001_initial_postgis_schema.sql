BEGIN;

-- Supabase installs extensions into a dedicated schema. Keeping both schemas in
-- the migration search path also preserves compatibility with local databases
-- where PostGIS was previously installed into public.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis SCHEMA extensions;
SET LOCAL search_path = public, extensions;

CREATE SCHEMA IF NOT EXISTS atlas;

CREATE TABLE atlas.data_sources (
    id text PRIMARY KEY,
    name text NOT NULL,
    url text,
    licence text,
    retrieved_at timestamptz,
    notes text
);

CREATE TABLE atlas.seasons (
    year smallint PRIMARY KEY CHECK (year >= 1950),
    status text NOT NULL DEFAULT 'completed'
        CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
    rounds_planned smallint CHECK (rounds_planned IS NULL OR rounds_planned >= 0),
    source_id text REFERENCES atlas.data_sources(id),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE atlas.circuits (
    id text PRIMARY KEY,
    name text NOT NULL,
    short_name text,
    locality text,
    country_code char(2) NOT NULL,
    circuit_type text NOT NULL DEFAULT 'permanent'
        CHECK (circuit_type IN ('permanent', 'street', 'hybrid', 'temporary')),
    location geography(Point, 4326) NOT NULL,
    opened_year smallint,
    website_url text,
    source_id text REFERENCES atlas.data_sources(id),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- A circuit is a place; a layout is the exact configuration used in a period.
-- This prevents historic configurations from overwriting the modern geometry.
CREATE TABLE atlas.track_layouts (
    id text PRIMARY KEY,
    circuit_id text NOT NULL REFERENCES atlas.circuits(id) ON DELETE CASCADE,
    name text NOT NULL,
    valid_from_year smallint CHECK (valid_from_year IS NULL OR valid_from_year >= 1950),
    valid_to_year smallint,
    length_m integer CHECK (length_m IS NULL OR length_m > 0),
    turns smallint CHECK (turns IS NULL OR turns > 0),
    direction text CHECK (direction IS NULL OR direction IN ('clockwise', 'counterclockwise')),
    elevation_min_m numeric(8,2),
    elevation_max_m numeric(8,2),
    centerline geometry(LineStringZ, 4326),
    source_id text REFERENCES atlas.data_sources(id),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, circuit_id),
    CHECK (valid_to_year IS NULL OR valid_from_year IS NULL OR valid_to_year >= valid_from_year)
);

CREATE TABLE atlas.track_features (
    id bigserial PRIMARY KEY,
    layout_id text NOT NULL REFERENCES atlas.track_layouts(id) ON DELETE CASCADE,
    feature_type text NOT NULL
        CHECK (feature_type IN (
            'turn', 'sector', 'drs_zone', 'drs_detection', 'speed_trap',
            'start_finish', 'pit_lane', 'elevation_sample'
        )),
    label text,
    sequence smallint,
    geometry geometry(GeometryZ, 4326) NOT NULL,
    properties jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_id text REFERENCES atlas.data_sources(id)
);

CREATE TABLE atlas.drivers (
    id text PRIMARY KEY,
    given_name text NOT NULL,
    family_name text NOT NULL,
    abbreviation char(3),
    permanent_number smallint,
    date_of_birth date,
    nationality text,
    source_id text REFERENCES atlas.data_sources(id),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE atlas.constructors (
    id text PRIMARY KEY,
    name text NOT NULL,
    nationality text,
    team_colour char(7) CHECK (team_colour IS NULL OR team_colour ~ '^#[0-9A-Fa-f]{6}$'),
    source_id text REFERENCES atlas.data_sources(id),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- A season entry stores season-specific team naming, colour and car media.
CREATE TABLE atlas.constructor_entries (
    id bigserial PRIMARY KEY,
    season_year smallint NOT NULL REFERENCES atlas.seasons(year) ON DELETE CASCADE,
    constructor_id text NOT NULL REFERENCES atlas.constructors(id),
    display_name text NOT NULL,
    engine_name text,
    team_colour char(7) CHECK (team_colour IS NULL OR team_colour ~ '^#[0-9A-Fa-f]{6}$'),
    car_model text,
    car_image_url text,
    UNIQUE (season_year, constructor_id)
);

CREATE TABLE atlas.races (
    id text PRIMARY KEY,
    season_year smallint NOT NULL REFERENCES atlas.seasons(year) ON DELETE CASCADE,
    round smallint NOT NULL CHECK (round > 0),
    circuit_id text NOT NULL REFERENCES atlas.circuits(id),
    layout_id text,
    name text NOT NULL,
    race_date date,
    start_time_utc time,
    status text NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled', 'postponed')),
    source_id text REFERENCES atlas.data_sources(id),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (layout_id, circuit_id)
        REFERENCES atlas.track_layouts(id, circuit_id),
    UNIQUE (season_year, round)
);

CREATE TABLE atlas.sessions (
    id text PRIMARY KEY,
    race_id text NOT NULL REFERENCES atlas.races(id) ON DELETE CASCADE,
    session_type text NOT NULL
        CHECK (session_type IN (
            'practice_1', 'practice_2', 'practice_3',
            'qualifying', 'sprint_shootout', 'sprint', 'race'
        )),
    name text NOT NULL,
    starts_at timestamptz,
    ends_at timestamptz,
    status text NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled', 'postponed')),
    source_id text REFERENCES atlas.data_sources(id),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (race_id, session_type)
);

CREATE TABLE atlas.session_results (
    session_id text NOT NULL REFERENCES atlas.sessions(id) ON DELETE CASCADE,
    position_order smallint NOT NULL CHECK (position_order > 0),
    position_text text NOT NULL,
    driver_id text NOT NULL REFERENCES atlas.drivers(id),
    constructor_entry_id bigint REFERENCES atlas.constructor_entries(id),
    grid_position smallint CHECK (grid_position IS NULL OR grid_position >= 0),
    laps smallint CHECK (laps IS NULL OR laps >= 0),
    status text,
    points numeric(7,2) NOT NULL DEFAULT 0,
    elapsed_ms bigint,
    gap_ms bigint,
    gap_text text,
    fastest_lap_rank smallint,
    fastest_lap_number smallint,
    fastest_lap_ms integer,
    -- Qualifying segments, penalties and provider-specific fields live here.
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_id text REFERENCES atlas.data_sources(id),
    PRIMARY KEY (session_id, position_order),
    UNIQUE (session_id, driver_id)
);

CREATE TABLE atlas.driver_standings (
    season_year smallint NOT NULL REFERENCES atlas.seasons(year) ON DELETE CASCADE,
    after_round smallint NOT NULL CHECK (after_round >= 0),
    position smallint NOT NULL CHECK (position > 0),
    driver_id text NOT NULL REFERENCES atlas.drivers(id),
    points numeric(8,2) NOT NULL DEFAULT 0,
    wins smallint NOT NULL DEFAULT 0,
    PRIMARY KEY (season_year, after_round, position),
    UNIQUE (season_year, after_round, driver_id)
);

CREATE TABLE atlas.constructor_standings (
    season_year smallint NOT NULL REFERENCES atlas.seasons(year) ON DELETE CASCADE,
    after_round smallint NOT NULL CHECK (after_round >= 0),
    position smallint NOT NULL CHECK (position > 0),
    constructor_entry_id bigint NOT NULL REFERENCES atlas.constructor_entries(id),
    points numeric(8,2) NOT NULL DEFAULT 0,
    wins smallint NOT NULL DEFAULT 0,
    PRIMARY KEY (season_year, after_round, position),
    UNIQUE (season_year, after_round, constructor_entry_id)
);

CREATE TABLE atlas.poi_categories (
    id text PRIMARY KEY,
    name_ru text NOT NULL,
    icon text,
    default_priority smallint NOT NULL DEFAULT 50 CHECK (default_priority BETWEEN 0 AND 100)
);

CREATE TABLE atlas.tourism_pois (
    id text PRIMARY KEY,
    category_id text NOT NULL REFERENCES atlas.poi_categories(id),
    name text NOT NULL,
    location geography(Point, 4326) NOT NULL,
    address text,
    website_url text,
    opening_hours text,
    is_curated boolean NOT NULL DEFAULT false,
    source_id text REFERENCES atlas.data_sources(id),
    properties jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Explicit links are reserved for editorially selected POIs. Nearby objects can
-- also be selected dynamically with ST_DWithin and the layout centerline.
CREATE TABLE atlas.circuit_pois (
    layout_id text NOT NULL REFERENCES atlas.track_layouts(id) ON DELETE CASCADE,
    poi_id text NOT NULL REFERENCES atlas.tourism_pois(id) ON DELETE CASCADE,
    priority smallint NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
    editorial_note text,
    PRIMARY KEY (layout_id, poi_id)
);

CREATE TABLE atlas.buildings (
    id text PRIMARY KEY,
    footprint geometry(MultiPolygon, 4326) NOT NULL,
    height_m numeric(8,2),
    min_height_m numeric(8,2) NOT NULL DEFAULT 0,
    levels numeric(5,1),
    building_type text,
    name text,
    detail_level smallint NOT NULL DEFAULT 1 CHECK (detail_level BETWEEN 0 AND 3),
    model_url text,
    source_id text REFERENCES atlas.data_sources(id),
    properties jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (height_m IS NULL OR height_m >= min_height_m)
);

CREATE TABLE atlas.external_identifiers (
    provider text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    external_id text NOT NULL,
    PRIMARY KEY (provider, entity_type, external_id),
    UNIQUE (provider, entity_type, entity_id)
);

CREATE TABLE atlas.media_assets (
    id text PRIMARY KEY,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    media_type text NOT NULL CHECK (media_type IN ('image', 'video', 'model_3d', 'document')),
    url text NOT NULL,
    alt_text_ru text,
    author text,
    licence text,
    source_url text,
    season_year smallint REFERENCES atlas.seasons(year),
    is_primary boolean NOT NULL DEFAULT false
);

CREATE INDEX circuits_location_gix ON atlas.circuits USING gist (location);
CREATE INDEX track_layouts_centerline_gix ON atlas.track_layouts USING gist (centerline);
CREATE INDEX track_features_geometry_gix ON atlas.track_features USING gist (geometry);
CREATE INDEX races_season_round_idx ON atlas.races (season_year, round);
CREATE INDEX sessions_race_idx ON atlas.sessions (race_id);
CREATE INDEX session_results_driver_idx ON atlas.session_results (driver_id);
CREATE INDEX tourism_pois_location_gix ON atlas.tourism_pois USING gist (location);
CREATE INDEX tourism_pois_category_idx ON atlas.tourism_pois (category_id);
CREATE INDEX buildings_footprint_gix ON atlas.buildings USING gist (footprint);

INSERT INTO atlas.poi_categories (id, name_ru, icon, default_priority) VALUES
    ('circuit_access', 'Вход на автодром', 'gate', 100),
    ('grandstand', 'Трибуна', 'grandstand', 95),
    ('fan_zone', 'Фан-зона', 'flag', 90),
    ('parking', 'Парковка', 'parking', 80),
    ('public_transport', 'Общественный транспорт', 'transport', 85),
    ('hotel', 'Отель', 'hotel', 60),
    ('restaurant', 'Ресторан', 'restaurant', 55),
    ('attraction', 'Достопримечательность', 'landmark', 65),
    ('airport', 'Аэропорт', 'airport', 70)
ON CONFLICT (id) DO NOTHING;

COMMIT;
