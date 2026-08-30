BEGIN;

ALTER TABLE atlas.constructor_entries
    ADD COLUMN logo_image_url text;

COMMIT;
