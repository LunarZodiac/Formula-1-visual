BEGIN;

CREATE OR REPLACE FUNCTION atlas.admin_media_asset(p_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT pg_catalog.jsonb_build_object(
    'id', a.id, 'entityType', a.entity_type, 'entityId', a.entity_id,
    'mediaType', a.media_type, 'usageRole', a.usage_role, 'url', a.url,
    'altTextRu', a.alt_text_ru, 'author', a.author, 'licence', a.licence,
    'sourceUrl', a.source_url, 'sourceId', a.source_id,
    'dataSourceName', s.name, 'season', a.season_year, 'isPrimary', a.is_primary,
    'provenanceType', a.provenance_type, 'rightsStatus', a.rights_status,
    'reviewStatus', a.review_status, 'usageScope', a.usage_scope,
    'verifiedAt', a.verified_at, 'derivativeCount',
      (SELECT count(*) FROM atlas.media_asset_derivatives d WHERE d.media_asset_id = a.id),
    'derivatives', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'variant', d.variant, 'url', d.url, 'mimeType', d.mime_type,
      'width', d.width_px, 'height', d.height_px, 'fileSize', d.file_size_bytes
    ) ORDER BY d.variant) FROM atlas.media_asset_derivatives d
      WHERE d.media_asset_id = a.id), '[]'::jsonb)
  ) INTO v_result
  FROM atlas.media_assets a
  LEFT JOIN atlas.data_sources s ON s.id = a.source_id
  WHERE a.id = p_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_media_registry(
  p_query text DEFAULT '', p_entity_type text DEFAULT '', p_usage_role text DEFAULT '',
  p_season integer DEFAULT NULL, p_rights text DEFAULT '', p_review text DEFAULT '',
  p_page integer DEFAULT 1, p_limit integer DEFAULT 40
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_query text := left(btrim(coalesce(p_query, '')), 120);
  v_entity_type text := left(btrim(coalesce(p_entity_type, '')), 50);
  v_usage_role text := left(btrim(coalesce(p_usage_role, '')), 80);
  v_rights text := left(btrim(coalesce(p_rights, '')), 30);
  v_review text := left(btrim(coalesce(p_review, '')), 30);
  v_rows jsonb;
  v_count integer;
  v_summary jsonb;
  v_options jsonb;
BEGIN
  IF p_page IS NULL OR p_page < 1 OR p_page > 100000
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100
    OR (p_season IS NOT NULL AND (p_season < 1950 OR p_season > 2100)) THEN
    RAISE EXCEPTION 'Некорректные параметры медиареестра';
  END IF;
  SELECT count(*)::integer INTO v_count FROM atlas.media_assets a
  WHERE (v_query = '' OR a.id ILIKE '%' || v_query || '%'
    OR a.entity_id ILIKE '%' || v_query || '%'
    OR a.alt_text_ru ILIKE '%' || v_query || '%'
    OR a.author ILIKE '%' || v_query || '%')
    AND (v_entity_type = '' OR a.entity_type = v_entity_type)
    AND (v_usage_role = '' OR a.usage_role = v_usage_role)
    AND (v_rights = '' OR a.rights_status = v_rights)
    AND (v_review = '' OR a.review_status = v_review)
    AND (p_season IS NULL OR a.season_year = p_season);
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', page.id, 'entityType', page.entity_type, 'entityId', page.entity_id,
    'mediaType', page.media_type, 'usageRole', page.usage_role, 'url', page.url,
    'altTextRu', page.alt_text_ru, 'author', page.author, 'licence', page.licence,
    'sourceUrl', page.source_url, 'season', page.season_year,
    'isPrimary', page.is_primary, 'provenanceType', page.provenance_type,
    'rightsStatus', page.rights_status, 'reviewStatus', page.review_status,
    'verifiedAt', page.verified_at, 'derivativeCount',
      (SELECT count(*) FROM atlas.media_asset_derivatives d WHERE d.media_asset_id = page.id)
  ) ORDER BY page.season_year DESC NULLS LAST, page.entity_type,
    page.entity_id, page.usage_role, page.id), '[]'::jsonb) INTO v_rows
  FROM (SELECT a.* FROM atlas.media_assets a
    WHERE (v_query = '' OR a.id ILIKE '%' || v_query || '%'
      OR a.entity_id ILIKE '%' || v_query || '%'
      OR a.alt_text_ru ILIKE '%' || v_query || '%'
      OR a.author ILIKE '%' || v_query || '%')
      AND (v_entity_type = '' OR a.entity_type = v_entity_type)
      AND (v_usage_role = '' OR a.usage_role = v_usage_role)
      AND (v_rights = '' OR a.rights_status = v_rights)
      AND (v_review = '' OR a.review_status = v_review)
      AND (p_season IS NULL OR a.season_year = p_season)
    ORDER BY a.season_year DESC NULLS LAST, a.entity_type,
      a.entity_id, a.usage_role, a.id
    LIMIT p_limit OFFSET (p_page - 1) * p_limit) page;
  SELECT pg_catalog.jsonb_build_object(
    'total', count(*),
    'unresolved_rights', count(*) FILTER (WHERE rights_status = 'unresolved'),
    'candidates', count(*) FILTER (WHERE review_status = 'candidate'),
    'published', count(*) FILTER (WHERE review_status = 'published'),
    'primary_assets', count(*) FILTER (WHERE is_primary)
  ) INTO v_summary FROM atlas.media_assets;
  SELECT pg_catalog.jsonb_build_object(
    'entityTypes', coalesce((SELECT pg_catalog.jsonb_agg(entity_type ORDER BY entity_type)
      FROM (SELECT DISTINCT entity_type FROM atlas.media_assets) x), '[]'::jsonb),
    'usageRoles', coalesce((SELECT pg_catalog.jsonb_agg(usage_role ORDER BY usage_role)
      FROM (SELECT DISTINCT usage_role FROM atlas.media_assets) x), '[]'::jsonb)
  ) INTO v_options;
  RETURN pg_catalog.jsonb_build_object('rows', v_rows, 'filteredCount', v_count,
    'summary', v_summary, 'options', v_options, 'page', p_page, 'limit', p_limit);
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_save_media_asset(p_id text, p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_usage text := nullif(btrim(p_input->>'usageRole'), '');
  v_alt text := nullif(btrim(p_input->>'altTextRu'), '');
  v_author text := nullif(btrim(p_input->>'author'), '');
  v_licence text := nullif(btrim(p_input->>'licence'), '');
  v_source_url text := nullif(btrim(p_input->>'sourceUrl'), '');
  v_rights text := p_input->>'rightsStatus';
  v_review text := p_input->>'reviewStatus';
  v_source_id text;
  v_host text;
  v_asset jsonb;
  v_current_source_id text;
  v_current_source_url text;
BEGIN
  IF p_id IS NULL OR length(p_id) > 255
    OR v_usage IS NULL OR v_usage !~ '^[a-z][a-z0-9_]*$' OR length(v_usage) > 80
    OR length(v_alt) > 500 OR length(v_author) > 500 OR length(v_licence) > 500
    OR length(v_source_url) > 2000
    OR v_rights IS NULL OR v_rights NOT IN ('verified', 'unresolved', 'restricted')
    OR v_review IS NULL OR v_review NOT IN ('candidate', 'reviewed', 'published', 'hidden') THEN
    RAISE EXCEPTION 'Некорректные поля медиаматериала';
  END IF;
  IF v_source_url IS NOT NULL THEN
    IF v_source_url !~ '^https?://[^/?#@]+([/?#]|$)' THEN
      RAISE EXCEPTION 'Некорректный URL источника';
    END IF;
    v_host := pg_catalog.split_part(pg_catalog.split_part(v_source_url, '://', 2), '/', 1);
  END IF;
  IF v_review IN ('reviewed', 'published') AND
    (v_rights <> 'verified' OR v_source_url IS NULL OR v_alt IS NULL
      OR v_author IS NULL OR v_licence IS NULL) THEN
    RAISE EXCEPTION 'Для проверки и публикации нужны подтверждённые права, источник, автор, лицензия и описание';
  END IF;
  SELECT source_id, source_url INTO v_current_source_id, v_current_source_url
  FROM atlas.media_assets WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Медиаматериал не найден'; END IF;
  IF v_source_url IS NOT NULL THEN
    v_source_id := CASE WHEN v_current_source_url = v_source_url AND v_current_source_id IS NOT NULL
      THEN v_current_source_id ELSE 'media-' || pg_catalog.substr(
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_source_url, 'UTF8')), 'hex'), 1, 16)
    END;
  END IF;
  IF v_source_id IS NOT NULL THEN
    INSERT INTO atlas.data_sources (id, name, url, licence, retrieved_at, notes)
    VALUES (v_source_id, v_host, v_source_url, v_licence, now(),
      'Источник медиаматериала, проверенный через редакционную панель')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url,
      licence = EXCLUDED.licence, retrieved_at = EXCLUDED.retrieved_at,
      notes = EXCLUDED.notes;
  END IF;
  UPDATE atlas.media_assets SET usage_role = v_usage, alt_text_ru = v_alt,
    author = v_author, licence = v_licence, source_url = v_source_url,
    source_id = v_source_id, rights_status = v_rights, review_status = v_review,
    verified_at = CASE WHEN v_rights = 'verified' THEN coalesce(verified_at, now()) ELSE NULL END
  WHERE id = p_id;
  v_asset := atlas.admin_media_asset(p_id);
  RETURN pg_catalog.jsonb_build_object('asset', v_asset, 'publicDataSynced', false);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_media_asset(text),
  atlas.admin_media_registry(text, text, text, integer, text, text, integer, integer),
  atlas.admin_save_media_asset(text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_media_asset(text),
  atlas.admin_media_registry(text, text, text, integer, text, text, integer, integer),
  atlas.admin_save_media_asset(text, jsonb) TO service_role;

COMMIT;
