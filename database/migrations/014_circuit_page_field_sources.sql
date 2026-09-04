BEGIN;

-- A profile can combine localization, editorial text and geometry from
-- different sources. Keep provenance at field level instead of assigning one
-- ambiguous source to the whole row.
CREATE TABLE atlas.circuit_page_profile_field_sources (
    circuit_id text NOT NULL
        REFERENCES atlas.circuit_page_profiles(circuit_id) ON DELETE CASCADE,
    field_name text NOT NULL CHECK (field_name IN (
        'slug', 'geometry_id', 'name_ru', 'city_ru', 'country_ru',
        'summary_ru', 'circuit_type_ru'
    )),
    source_id text NOT NULL REFERENCES atlas.data_sources(id),
    editorial_status text NOT NULL DEFAULT 'verified'
        CHECK (editorial_status IN ('candidate', 'verified', 'rejected')),
    verified_at timestamptz,
    notes text,
    PRIMARY KEY (circuit_id, field_name)
);

CREATE INDEX circuit_page_profile_field_sources_status_idx
    ON atlas.circuit_page_profile_field_sources (editorial_status, circuit_id);

COMMIT;
