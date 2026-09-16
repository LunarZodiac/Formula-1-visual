BEGIN;

CREATE TABLE atlas.driver_profiles (
    driver_id text PRIMARY KEY REFERENCES atlas.drivers(id) ON DELETE CASCADE,
    name_ru text,
    birth_place_ru text,
    height_cm numeric(5,2) CHECK (height_cm IS NULL OR height_cm BETWEEN 120 AND 230),
    weight_kg numeric(5,2) CHECK (weight_kg IS NULL OR weight_kg BETWEEN 35 AND 200),
    biography_ru text,
    source_id text REFERENCES atlas.data_sources(id),
    review_status text NOT NULL DEFAULT 'candidate'
        CHECK (review_status IN ('candidate', 'reviewed', 'verified', 'published', 'rejected')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (name_ru IS NULL OR btrim(name_ru) <> ''),
    CHECK (birth_place_ru IS NULL OR btrim(birth_place_ru) <> ''),
    CHECK (biography_ru IS NULL OR btrim(biography_ru) <> '')
);

CREATE INDEX driver_profiles_review_idx
    ON atlas.driver_profiles (review_status, driver_id);
CREATE INDEX driver_profiles_source_idx
    ON atlas.driver_profiles (source_id)
    WHERE source_id IS NOT NULL;

CREATE TABLE atlas.driver_profile_field_sources (
    driver_id text NOT NULL REFERENCES atlas.drivers(id) ON DELETE CASCADE,
    field_name text NOT NULL
        CHECK (field_name IN ('name_ru', 'birth_date', 'birth_place_ru', 'height_cm', 'weight_kg', 'biography_ru')),
    source_id text NOT NULL REFERENCES atlas.data_sources(id),
    source_url text,
    retrieved_at timestamptz NOT NULL DEFAULT now(),
    review_status text NOT NULL DEFAULT 'candidate'
        CHECK (review_status IN ('candidate', 'reviewed', 'verified', 'rejected')),
    notes text,
    PRIMARY KEY (driver_id, field_name, source_id),
    CHECK (review_status NOT IN ('reviewed', 'verified') OR source_url IS NOT NULL)
);

CREATE INDEX driver_profile_field_sources_source_idx
    ON atlas.driver_profile_field_sources (source_id);

CREATE TABLE atlas.driver_relationships (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    driver_id text NOT NULL REFERENCES atlas.drivers(id) ON DELETE CASCADE,
    relationship_type text NOT NULL CHECK (relationship_type IN ('spouse', 'partner')),
    person_name text NOT NULL CHECK (btrim(person_name) <> ''),
    start_year smallint CHECK (start_year IS NULL OR start_year >= 1900),
    end_year smallint,
    relationship_status text NOT NULL DEFAULT 'unknown'
        CHECK (relationship_status IN ('current', 'former', 'unknown')),
    source_id text NOT NULL REFERENCES atlas.data_sources(id),
    source_url text NOT NULL,
    review_status text NOT NULL DEFAULT 'candidate'
        CHECK (review_status IN ('candidate', 'reviewed', 'verified', 'published', 'rejected')),
    notes text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_year IS NULL OR start_year IS NULL OR end_year >= start_year)
);

CREATE INDEX driver_relationships_driver_idx
    ON atlas.driver_relationships (driver_id, relationship_status);
CREATE INDEX driver_relationships_source_idx
    ON atlas.driver_relationships (source_id);
CREATE UNIQUE INDEX driver_relationships_identity_idx
    ON atlas.driver_relationships (
        driver_id, relationship_type, lower(person_name),
        COALESCE(start_year, 0), COALESCE(end_year, 0)
    );

COMMIT;
