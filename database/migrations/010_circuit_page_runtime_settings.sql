BEGIN;

CREATE TABLE atlas.circuit_page_map_settings (
    circuit_id text PRIMARY KEY REFERENCES atlas.circuit_page_profiles(circuit_id) ON DELETE CASCADE,
    track_max_zoom numeric(4,2) NOT NULL CHECK (track_max_zoom BETWEEN 1 AND 22),
    track_pitch numeric(5,2) NOT NULL CHECK (track_pitch BETWEEN 0 AND 85),
    track_bearing numeric(6,2) NOT NULL CHECK (track_bearing BETWEEN -180 AND 180),
    track_padding smallint NOT NULL CHECK (track_padding BETWEEN 0 AND 500),
    travel_bounds geometry(Polygon, 4326) NOT NULL,
    travel_zoom numeric(4,2) NOT NULL CHECK (travel_zoom BETWEEN 1 AND 22),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE atlas.circuit_page_feature_flags (
    circuit_id text PRIMARY KEY REFERENCES atlas.circuit_page_profiles(circuit_id) ON DELETE CASCADE,
    technical_overlay boolean NOT NULL DEFAULT false,
    travel_mode boolean NOT NULL DEFAULT false,
    local_3d_model boolean NOT NULL DEFAULT false,
    buildings_3d boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE atlas.circuit_page_result_settings (
    circuit_id text PRIMARY KEY REFERENCES atlas.circuit_page_profiles(circuit_id) ON DELETE CASCADE,
    default_season smallint NOT NULL REFERENCES atlas.seasons(year),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX circuit_page_result_default_season_idx
    ON atlas.circuit_page_result_settings (default_season);

COMMIT;
