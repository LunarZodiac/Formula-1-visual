BEGIN;

ALTER TABLE atlas.circuit_travel_profiles
    ADD COLUMN page_intro_ru text,
    ADD COLUMN source_note_ru text,
    ADD COLUMN route_note_ru text;

CREATE TABLE atlas.circuit_travel_story_stats (
    circuit_id text NOT NULL REFERENCES atlas.circuits(id) ON DELETE CASCADE,
    sort_order smallint NOT NULL CHECK (sort_order >= 0),
    value_ru text NOT NULL,
    label_ru text NOT NULL,
    PRIMARY KEY (circuit_id, sort_order)
);

CREATE TABLE atlas.circuit_travel_story_chapters (
    id text PRIMARY KEY,
    circuit_id text NOT NULL REFERENCES atlas.circuits(id) ON DELETE CASCADE,
    sort_order smallint NOT NULL CHECK (sort_order >= 0),
    display_index text NOT NULL,
    eyebrow_ru text NOT NULL,
    title_ru text NOT NULL,
    description_ru text NOT NULL,
    UNIQUE (circuit_id, sort_order)
);

CREATE TABLE atlas.circuit_travel_story_chapter_features (
    chapter_id text NOT NULL REFERENCES atlas.circuit_travel_story_chapters(id) ON DELETE CASCADE,
    feature_id text NOT NULL,
    sort_order smallint NOT NULL CHECK (sort_order >= 0),
    PRIMARY KEY (chapter_id, feature_id),
    UNIQUE (chapter_id, sort_order)
);

CREATE TABLE atlas.circuit_travel_planner_items (
    circuit_id text NOT NULL REFERENCES atlas.circuits(id) ON DELETE CASCADE,
    sort_order smallint NOT NULL CHECK (sort_order >= 0),
    label_ru text NOT NULL,
    value_ru text NOT NULL,
    detail_ru text NOT NULL,
    PRIMARY KEY (circuit_id, sort_order)
);

CREATE TABLE atlas.circuit_travel_zone_presentations (
    zone_id text PRIMARY KEY REFERENCES atlas.travel_zones(id) ON DELETE CASCADE,
    sort_order smallint NOT NULL CHECK (sort_order >= 0),
    character_ru text NOT NULL,
    travel_time_ru text NOT NULL,
    tone char(7) NOT NULL CHECK (tone ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE INDEX circuit_travel_story_chapters_circuit_order_idx
    ON atlas.circuit_travel_story_chapters (circuit_id, sort_order);

COMMIT;
