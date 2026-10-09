BEGIN;

CREATE OR REPLACE FUNCTION atlas.admin_save_travel_point_photo(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_circuit_id text := p_input->>'circuitId';
  v_point_id text := p_input->>'pointId';
  v_asset_id text := p_input->>'assetId';
  v_source_id text := p_input->>'sourceId';
  v_source_url text := p_input->>'sourceUrl';
  v_alt text := nullif(btrim(p_input->>'altTextRu'), '');
  v_author text := nullif(btrim(p_input->>'author'), '');
  v_licence text := nullif(btrim(p_input->>'licence'), '');
  v_url text := p_input->>'url';
  v_original jsonb := p_input->'original';
  v_variants jsonb := p_input->'variants';
  v_row jsonb;
  v_variant text;
BEGIN
  IF p_input IS NULL OR pg_catalog.jsonb_typeof(p_input) <> 'object'
    OR v_circuit_id IS NULL OR v_circuit_id !~ '^[A-Za-z0-9_-]{1,100}$'
    OR v_point_id IS NULL OR v_point_id !~ '^[A-Za-z0-9_-]{1,100}$'
    OR v_asset_id IS NULL OR v_asset_id !~ ('^travel-point-' || v_point_id || '-[a-f0-9-]{36}$')
    OR v_source_id IS NULL OR v_source_id !~ '^media-[a-f0-9]{16}$'
    OR v_source_url IS NULL OR length(v_source_url) > 2000 OR v_source_url !~ '^https?://[^/?#@]+([/?#]|$)'
    OR v_alt IS NULL OR length(v_alt) > 500
    OR v_author IS NULL OR length(v_author) > 500
    OR v_licence IS NULL OR length(v_licence) > 500
    OR v_url IS NULL OR length(v_url) > 2000 OR v_url !~ '^https?://'
    OR pg_catalog.jsonb_typeof(v_original) <> 'object'
    OR pg_catalog.jsonb_typeof(v_variants) <> 'array'
    OR pg_catalog.jsonb_array_length(v_variants) <> 3 THEN
    RAISE EXCEPTION 'Некорректные сведения о фотографии туристической точки';
  END IF;
  IF v_original->>'mimeType' NOT IN ('image/jpeg', 'image/png', 'image/webp')
    OR v_original->>'width' IS NULL OR (v_original->>'width')::integer <= 0
    OR v_original->>'height' IS NULL OR (v_original->>'height')::integer <= 0
    OR v_original->>'fileSize' IS NULL OR (v_original->>'fileSize')::bigint <= 0
    OR v_original->>'url' IS NULL OR v_original->>'url' !~ '^https?://' THEN
    RAISE EXCEPTION 'Некорректный оригинал фотографии';
  END IF;

  PERFORM 1 FROM atlas.tourism_pois poi
  JOIN atlas.circuit_travel_pois link ON link.poi_id = poi.id
  WHERE poi.id = v_point_id AND link.circuit_id = v_circuit_id
  FOR UPDATE OF poi, link;
  IF NOT FOUND THEN RAISE EXCEPTION 'Точка не относится к выбранной трассе'; END IF;

  INSERT INTO atlas.data_sources (id, name, url, licence, retrieved_at, notes)
  VALUES (v_source_id, pg_catalog.split_part(pg_catalog.split_part(v_source_url, '://', 2), '/', 1),
    v_source_url, v_licence, now(), 'Источник фотографии туристической точки из локального редактора')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url,
    licence = EXCLUDED.licence, retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

  UPDATE atlas.media_assets SET is_primary = false
  WHERE entity_type = 'tourism_poi' AND entity_id = v_point_id
    AND media_type = 'image' AND is_primary;

  INSERT INTO atlas.media_assets
    (id, entity_type, entity_id, media_type, url, alt_text_ru, author, licence,
     source_url, is_primary, usage_role, source_id, provenance_type, rights_status,
     review_status, verified_at, usage_scope)
  VALUES (v_asset_id, 'tourism_poi', v_point_id, 'image', v_url, v_alt, v_author, v_licence,
    v_source_url, true, 'travel_card', v_source_id, 'provided_by_user', 'verified',
    'reviewed', now(), ARRAY['travel_card', 'travel_popup']);

  INSERT INTO atlas.media_asset_derivatives
    (id, media_asset_id, variant, url, mime_type, width_px, height_px, file_size_bytes)
  VALUES (v_asset_id || '-original', v_asset_id, 'original', v_original->>'url',
    v_original->>'mimeType', (v_original->>'width')::integer,
    (v_original->>'height')::integer, (v_original->>'fileSize')::bigint);

  FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(v_variants) LOOP
    v_variant := v_row->>'name';
    IF v_variant IS NULL OR v_variant NOT IN ('1280w', '640w', '320w')
      OR v_row->>'url' IS NULL OR v_row->>'url' !~ '^https?://'
      OR v_row->>'width' IS NULL OR (v_row->>'width')::integer <= 0
      OR v_row->>'height' IS NULL OR (v_row->>'height')::integer <= 0
      OR v_row->>'fileSize' IS NULL OR (v_row->>'fileSize')::bigint <= 0 THEN
      RAISE EXCEPTION 'Некорректный вариант фотографии';
    END IF;
    INSERT INTO atlas.media_asset_derivatives
      (id, media_asset_id, variant, url, mime_type, width_px, height_px, file_size_bytes)
    VALUES (v_asset_id || '-' || v_variant, v_asset_id, v_variant, v_row->>'url',
      'image/webp', (v_row->>'width')::integer,
      (v_row->>'height')::integer, (v_row->>'fileSize')::bigint);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM atlas.media_asset_derivatives
    WHERE media_asset_id = v_asset_id AND variant = '1280w' AND url = v_url) THEN
    RAISE EXCEPTION 'Основной вариант фотографии отсутствует';
  END IF;
  RETURN pg_catalog.jsonb_build_object('assetId', v_asset_id, 'url', v_url,
    'publicDataSynced', false);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_save_travel_point_photo(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_save_travel_point_photo(jsonb) TO service_role;

COMMIT;
