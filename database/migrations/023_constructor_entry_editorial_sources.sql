BEGIN;

CREATE TABLE atlas.constructor_entry_field_sources (
    season_year smallint NOT NULL,
    constructor_id text NOT NULL,
    field_name text NOT NULL CHECK (field_name IN (
        'display_name', 'engine_name', 'team_colour', 'car_model', 'logo_image_url', 'car_image_url'
    )),
    source_id text NOT NULL REFERENCES atlas.data_sources(id),
    source_url text NOT NULL,
    retrieved_at timestamptz NOT NULL DEFAULT now(),
    review_status text NOT NULL DEFAULT 'reviewed'
        CHECK (review_status IN ('candidate', 'reviewed', 'verified', 'rejected')),
    notes text,
    PRIMARY KEY (season_year, constructor_id, field_name, source_id),
    FOREIGN KEY (season_year, constructor_id)
        REFERENCES atlas.constructor_entries(season_year, constructor_id) ON DELETE CASCADE
);

CREATE INDEX constructor_entry_field_sources_source_idx
    ON atlas.constructor_entry_field_sources (source_id);

COMMIT;
