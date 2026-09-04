BEGIN;

ALTER TABLE atlas.circuit_page_profiles
    ALTER COLUMN geometry_id DROP NOT NULL,
    ALTER COLUMN summary_ru DROP NOT NULL,
    ALTER COLUMN circuit_type_ru DROP NOT NULL;

ALTER TABLE atlas.circuit_page_profiles
    ADD CONSTRAINT circuit_page_profiles_published_complete_check CHECK (
        editorial_status <> 'published'
        OR (geometry_id IS NOT NULL AND summary_ru IS NOT NULL AND circuit_type_ru IS NOT NULL)
    );

COMMIT;
