BEGIN;

CREATE OR REPLACE FUNCTION atlas.admin_save_history_era(p_slug text, p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_status text := p_input->>'editorialStatus';
  v_years text := nullif(btrim(p_input->>'yearsLabel'), '');
  v_title text := nullif(btrim(p_input->>'titleRu'), '');
  v_summary text := nullif(btrim(p_input->>'summaryRu'), '');
  v_media text := nullif(btrim(p_input->>'heroMediaAssetId'), '');
BEGIN
  IF v_status NOT IN ('draft', 'review', 'published') OR v_status IS NULL
     OR v_years IS NULL OR length(v_years) > 80
     OR v_title IS NULL OR length(v_title) > 180
     OR v_summary IS NULL OR length(v_summary) > 2000 THEN
    RAISE EXCEPTION 'Некорректные поля исторической эпохи';
  END IF;
  PERFORM 1 FROM atlas.history_eras WHERE slug = p_slug FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Историческая эпоха не найдена'; END IF;
  IF v_status = 'published' AND NOT EXISTS (
    SELECT 1 FROM atlas.history_era_blocks
    WHERE era_slug = p_slug AND editorial_status = 'published'
  ) THEN
    RAISE EXCEPTION 'До публикации эпохи опубликуйте хотя бы один блок';
  END IF;
  UPDATE atlas.history_eras SET years_label = v_years, title_ru = v_title,
    summary_ru = v_summary, editorial_status = v_status,
    hero_media_asset_id = v_media, updated_at = now()
  WHERE slug = p_slug;
  RETURN pg_catalog.jsonb_build_object('slug', p_slug, 'publicDataSynced', false);
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_save_history_block(
  p_era_slug text, p_block_id bigint, p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_id bigint;
  v_order integer;
  v_type text := p_input->>'blockType';
  v_status text := p_input->>'editorialStatus';
  v_eyebrow text := nullif(btrim(p_input->>'eyebrowRu'), '');
  v_title text := nullif(btrim(p_input->>'titleRu'), '');
  v_body text := nullif(btrim(p_input->>'bodyRu'), '');
  v_media text := nullif(btrim(p_input->>'mediaAssetId'), '');
  v_position text := CASE WHEN nullif(btrim(p_input->>'mediaAssetId'), '') IS NULL
    THEN NULL ELSE p_input->>'mediaPosition' END;
  v_url text := nullif(btrim(p_input->>'sourceUrl'), '');
  v_source_id text;
  v_host text;
  v_era_status text;
BEGIN
  IF v_type NOT IN ('text', 'media', 'quote', 'timeline', 'entities') OR v_type IS NULL
     OR v_status NOT IN ('draft', 'review', 'published') OR v_status IS NULL
     OR (v_media IS NOT NULL AND v_position NOT IN ('left', 'right', 'wide'))
     OR (v_media IS NOT NULL AND v_position IS NULL)
     OR (v_type IN ('text', 'quote') AND v_body IS NULL)
     OR (v_type = 'media' AND v_media IS NULL)
     OR (v_status = 'published' AND v_url IS NULL)
     OR length(v_eyebrow) > 500 OR length(v_title) > 500
     OR length(v_body) > 20000 OR length(v_url) > 2000 THEN
    RAISE EXCEPTION 'Некорректные поля блока исторической эпохи';
  END IF;
  IF v_url IS NOT NULL THEN
    IF v_url !~ '^https?://[^/?#@]+([/?#]|$)' THEN
      RAISE EXCEPTION 'Некорректный URL источника';
    END IF;
    v_host := pg_catalog.split_part(pg_catalog.split_part(v_url, '://', 2), '/', 1);
    v_source_id := 'history-era-' || pg_catalog.substr(pg_catalog.md5(v_url), 1, 24);
  END IF;
  SELECT editorial_status INTO v_era_status FROM atlas.history_eras
  WHERE slug = p_era_slug FOR UPDATE;
  IF v_era_status IS NULL THEN RAISE EXCEPTION 'Историческая эпоха не найдена'; END IF;
  IF v_source_id IS NOT NULL THEN
    INSERT INTO atlas.data_sources (id, name, url, retrieved_at, notes)
    VALUES (v_source_id, v_host, v_url, now(), 'Источник редакционного блока исторической эпохи')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url,
      retrieved_at = EXCLUDED.retrieved_at;
  END IF;
  IF p_block_id IS NULL THEN
    IF p_input->>'sortOrder' IS NULL THEN RAISE EXCEPTION 'Порядок блока обязателен'; END IF;
    v_order := (p_input->>'sortOrder')::integer;
    IF v_order < 0 OR v_order > 9999 THEN RAISE EXCEPTION 'Некорректный порядок блока'; END IF;
    INSERT INTO atlas.history_era_blocks
      (era_slug, sort_order, block_type, eyebrow_ru, title_ru, body_ru,
       media_asset_id, media_position, source_id, source_url, editorial_status)
    VALUES (p_era_slug, v_order, v_type, v_eyebrow, v_title, v_body,
      v_media, v_position, v_source_id, v_url, v_status)
    RETURNING id INTO v_id;
  ELSE
    UPDATE atlas.history_era_blocks SET block_type = v_type, eyebrow_ru = v_eyebrow,
      title_ru = v_title, body_ru = v_body, media_asset_id = v_media,
      media_position = v_position, source_id = v_source_id, source_url = v_url,
      editorial_status = v_status, updated_at = now()
    WHERE id = p_block_id AND era_slug = p_era_slug RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Блок эпохи не найден'; END IF;
  END IF;
  IF v_era_status = 'published' AND NOT EXISTS (
    SELECT 1 FROM atlas.history_era_blocks
    WHERE era_slug = p_era_slug AND editorial_status = 'published'
  ) THEN
    RAISE EXCEPTION 'Опубликованная эпоха должна содержать опубликованный блок';
  END IF;
  RETURN pg_catalog.jsonb_build_object('id', v_id, 'publicDataSynced', false);
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_delete_history_block(p_era_slug text, p_block_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_id bigint; v_era_status text;
BEGIN
  SELECT editorial_status INTO v_era_status FROM atlas.history_eras
  WHERE slug = p_era_slug FOR UPDATE;
  IF v_era_status IS NULL THEN RAISE EXCEPTION 'Историческая эпоха не найдена'; END IF;
  DELETE FROM atlas.history_era_blocks
  WHERE id = p_block_id AND era_slug = p_era_slug RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Блок эпохи не найден'; END IF;
  IF v_era_status = 'published' AND NOT EXISTS (
    SELECT 1 FROM atlas.history_era_blocks
    WHERE era_slug = p_era_slug AND editorial_status = 'published'
  ) THEN
    RAISE EXCEPTION 'Опубликованная эпоха должна содержать опубликованный блок';
  END IF;
  RETURN pg_catalog.jsonb_build_object('id', v_id, 'publicDataSynced', false);
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_reorder_history_blocks(
  p_era_slug text, p_ordered_ids bigint[], p_expected_ids bigint[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_existing bigint[];
  v_max integer;
  v_base integer;
BEGIN
  IF p_ordered_ids IS NULL OR p_expected_ids IS NULL THEN
    RAISE EXCEPTION 'Порядок блоков обязателен';
  END IF;
  PERFORM 1 FROM atlas.history_eras WHERE slug = p_era_slug FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Историческая эпоха не найдена'; END IF;
  SELECT coalesce(pg_catalog.array_agg(id ORDER BY sort_order, id), '{}'::bigint[]),
         coalesce(max(sort_order), -1)
    INTO v_existing, v_max
  FROM atlas.history_era_blocks WHERE era_slug = p_era_slug;
  IF v_existing IS DISTINCT FROM p_expected_ids
     OR pg_catalog.array_length(v_existing, 1) IS DISTINCT FROM pg_catalog.array_length(p_ordered_ids, 1)
     OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_ordered_ids) AS requested(id)
       WHERE requested.id IS NULL OR requested.id <> ALL(v_existing))
     OR (SELECT count(DISTINCT id) FROM pg_catalog.unnest(p_ordered_ids) AS requested(id))
        <> coalesce(pg_catalog.array_length(p_ordered_ids, 1), 0) THEN
    RAISE EXCEPTION 'Набор или порядок блоков изменился. Обновите страницу';
  END IF;
  IF coalesce(pg_catalog.array_length(p_ordered_ids, 1), 0) > 0 THEN
    v_base := v_max + 1;
    IF v_base + pg_catalog.array_length(p_ordered_ids, 1) - 1 > 32767 THEN
      RAISE EXCEPTION 'Не удалось выделить временный диапазон сортировки';
    END IF;
    UPDATE atlas.history_era_blocks SET
      sort_order = v_base + pg_catalog.array_position(p_ordered_ids, id) - 1,
      updated_at = now()
    WHERE era_slug = p_era_slug;
    UPDATE atlas.history_era_blocks SET
      sort_order = pg_catalog.array_position(p_ordered_ids, id) - 1,
      updated_at = now()
    WHERE era_slug = p_era_slug;
  END IF;
  RETURN pg_catalog.jsonb_build_object('eraSlug', p_era_slug,
    'orderedIds', pg_catalog.to_jsonb(p_ordered_ids), 'publicDataSynced', false);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_save_history_era(text, jsonb),
  atlas.admin_save_history_block(text, bigint, jsonb),
  atlas.admin_delete_history_block(text, bigint),
  atlas.admin_reorder_history_blocks(text, bigint[], bigint[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_save_history_era(text, jsonb),
  atlas.admin_save_history_block(text, bigint, jsonb),
  atlas.admin_delete_history_block(text, bigint),
  atlas.admin_reorder_history_blocks(text, bigint[], bigint[])
  TO service_role;

COMMIT;
