BEGIN;

ALTER TABLE atlas.driver_profiles
    ADD COLUMN death_date date;

ALTER TABLE atlas.driver_profile_field_sources
    DROP CONSTRAINT driver_profile_field_sources_field_name_check;

ALTER TABLE atlas.driver_profile_field_sources
    ADD CONSTRAINT driver_profile_field_sources_field_name_check
    CHECK (field_name IN (
        'name_ru', 'birth_date', 'birth_place_ru', 'death_date',
        'height_cm', 'weight_kg', 'biography_ru'
    ));

COMMIT;
