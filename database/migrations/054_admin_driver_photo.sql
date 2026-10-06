BEGIN;

CREATE OR REPLACE FUNCTION atlas.admin_save_driver_photo(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_driver_id text := p_input->>'driverId';
    v_asset_id text := p_input->>'assetId';
    v_source_id text := p_input->>'sourceId';
    v_source_url text := p_input->>'sourceUrl';
    v_alt text := nullif(btrim(p_input->>'altTextRu'), '');
    v_author text := nullif(btrim(p_input->>'author'), '');
    v_licence text := nullif(btrim(p_input->>'licence'), '');
    v_photo_url text := p_input->>'url';
    v_original jsonb := p_input->'original';
    v_variants jsonb := p_input->'variants';
    v_row jsonb;
    v_variant text;
BEGIN
    IF v_driver_id IS NULL OR v_driver_id !~ '^[A-Za-z0-9_-]+$'
       OR v_asset_id IS NULL OR v_asset_id !~ ('^driver-' || v_driver_id || '-portrait-[a-f0-9-]{36}$')
       OR v_source_id IS NULL OR v_source_id !~ '^media-[a-f0-9]{16}$'
       OR v_source_url IS NULL OR length(v_source_url) > 2000 OR v_source_url !~ '^https?://[^/?#@]+([/?#]|$)'
       OR v_alt IS NULL OR length(v_alt) > 500
       OR v_author IS NULL OR length(v_author) > 500
       OR v_licence IS NULL OR length(v_licence) > 500
       OR v_photo_url IS NULL OR length(v_photo_url) > 2000 OR v_photo_url !~ '^https?://'
       OR jsonb_typeof(v_original) <> 'object'
       OR jsonb_typeof(v_variants) <> 'array'
       OR jsonb_array_length(v_variants) <> 3 THEN
        RAISE EXCEPTION 'Некорректные сведения о фотографии пилота';
    END IF;

    IF v_original->>'mimeType' IS NULL
       OR v_original->>'mimeType' NOT IN ('image/jpeg', 'image/png', 'image/webp')
       OR v_original->>'width' IS NULL OR (v_original->>'width')::integer <= 0
       OR v_original->>'height' IS NULL OR (v_original->>'height')::integer <= 0
       OR v_original->>'fileSize' IS NULL OR (v_original->>'fileSize')::bigint <= 0
       OR v_original->>'url' IS NULL OR v_original->>'url' !~ '^https?://' THEN
        RAISE EXCEPTION 'Некорректный оригинал фотографии';
    END IF;

    PERFORM 1 FROM atlas.drivers WHERE id = v_driver_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Пилот не найден'; END IF;

    INSERT INTO atlas.data_sources (id, name, url, licence, retrieved_at, notes)
    VALUES (v_source_id, split_part(split_part(v_source_url, '://', 2), '/', 1),
            v_source_url, v_licence, now(), 'Источник фотографии пилота из локального редактора')
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, url = EXCLUDED.url, licence = EXCLUDED.licence,
        retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

    UPDATE atlas.media_assets
    SET is_primary = false
    WHERE entity_type = 'driver' AND entity_id = v_driver_id
      AND media_type = 'image' AND usage_role = 'portrait' AND is_primary;

    INSERT INTO atlas.media_assets
        (id, entity_type, entity_id, media_type, url, alt_text_ru, author, licence,
         source_url, is_primary, usage_role, source_id, provenance_type, rights_status,
         review_status, verified_at, usage_scope)
    VALUES
        (v_asset_id, 'driver', v_driver_id, 'image', v_photo_url, v_alt, v_author, v_licence,
         v_source_url, true, 'portrait', v_source_id, 'provided_by_user', 'verified',
         'reviewed', now(), ARRAY['driver_catalog', 'driver_profile']);

    INSERT INTO atlas.media_asset_derivatives
        (id, media_asset_id, variant, url, mime_type, width_px, height_px, file_size_bytes)
    VALUES
        (v_asset_id || '-original', v_asset_id, 'original', v_original->>'url',
         v_original->>'mimeType', (v_original->>'width')::integer,
         (v_original->>'height')::integer, (v_original->>'fileSize')::bigint);

    FOR v_row IN SELECT value FROM jsonb_array_elements(v_variants) LOOP
        v_variant := v_row->>'name';
        IF v_variant IS NULL OR v_variant NOT IN ('portrait', 'card', 'thumbnail')
           OR v_row->>'url' IS NULL OR v_row->>'url' !~ '^https?://'
           OR v_row->>'width' IS NULL OR (v_row->>'width')::integer <= 0
           OR v_row->>'height' IS NULL OR (v_row->>'height')::integer <= 0
           OR v_row->>'fileSize' IS NULL OR (v_row->>'fileSize')::bigint <= 0 THEN
            RAISE EXCEPTION 'Некорректный вариант фотографии';
        END IF;
        INSERT INTO atlas.media_asset_derivatives
            (id, media_asset_id, variant, url, mime_type, width_px, height_px, file_size_bytes)
        VALUES
            (v_asset_id || '-' || v_variant, v_asset_id, v_variant, v_row->>'url',
             'image/webp', (v_row->>'width')::integer,
             (v_row->>'height')::integer, (v_row->>'fileSize')::bigint);
    END LOOP;

    IF NOT EXISTS (
        SELECT 1 FROM atlas.media_asset_derivatives
        WHERE media_asset_id = v_asset_id AND variant = 'portrait' AND url = v_photo_url
    ) THEN
        RAISE EXCEPTION 'Основной вариант фотографии отсутствует';
    END IF;

    UPDATE atlas.drivers SET updated_at = now() WHERE id = v_driver_id;
    RETURN jsonb_build_object('assetId', v_asset_id, 'url', v_photo_url,
                              'publicDataSynced', false);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_save_driver_photo(jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_save_driver_photo(jsonb) TO service_role;

COMMIT;
