BEGIN;

CREATE OR REPLACE FUNCTION atlas.admin_travel_points(
  p_circuit_id text, p_filters jsonb DEFAULT '{}'::jsonb,
  p_page integer DEFAULT 1, p_limit integer DEFAULT 30
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_circuit jsonb;
  v_rows jsonb;
  v_map jsonb;
  v_count integer;
  v_categories jsonb;
  v_query text := left(btrim(coalesce(p_filters->>'query', '')), 120);
  v_status text := coalesce(p_filters->>'status', '');
  v_category text := left(btrim(coalesce(p_filters->>'category', '')), 80);
  v_role text := coalesce(p_filters->>'role', '');
  v_photo text := coalesce(p_filters->>'photo', '');
  v_featured text := coalesce(p_filters->>'featured', '');
  v_translation text := coalesce(p_filters->>'translation', '');
  v_distance_min double precision := nullif(p_filters->>'distanceMin', '')::double precision;
  v_distance_max double precision := nullif(p_filters->>'distanceMax', '')::double precision;
  v_importance_min double precision := nullif(p_filters->>'importanceMin', '')::double precision;
  v_importance_max double precision := nullif(p_filters->>'importanceMax', '')::double precision;
BEGIN
  IF p_page IS NULL OR p_page < 1 OR p_page > 100000 OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100
    OR p_filters IS NULL OR pg_catalog.jsonb_typeof(p_filters) <> 'object'
    OR v_status NOT IN ('', 'candidate', 'reviewed', 'published', 'hidden')
    OR v_role NOT IN ('', 'transport', 'stay', 'explore', 'essential', 'circuit')
    OR v_photo NOT IN ('', 'yes', 'no') OR v_featured NOT IN ('', 'yes', 'no')
    OR v_translation NOT IN ('', 'ready', 'missing')
    OR coalesce(v_distance_min, 0) < 0 OR coalesce(v_distance_max, 0) < 0
    OR coalesce(v_importance_min, 0) < 0 OR coalesce(v_importance_max, 0) < 0 THEN
    RAISE EXCEPTION 'Некорректные фильтры туристических точек';
  END IF;

  SELECT pg_catalog.jsonb_build_object('id', c.id,
    'name', coalesce(profile.name_ru, c.short_name, c.name),
    'latitude', public.ST_Y(c.location::public.geometry),
    'longitude', public.ST_X(c.location::public.geometry)) INTO v_circuit
  FROM atlas.circuits c LEFT JOIN atlas.circuit_page_profiles profile ON profile.circuit_id = c.id
  WHERE c.id = p_circuit_id;
  IF v_circuit IS NULL THEN RETURN NULL; END IF;

  WITH filtered AS MATERIALIZED (
    SELECT poi.id, poi.name, poi.name_ru, poi.category_id, category.name_ru AS category_name,
      coalesce(category.icon, '') AS category_icon, link.role, poi.importance, poi.review_status,
      link.is_featured, link.priority,
      pg_catalog.round(coalesce(link.distance_to_circuit_m, public.ST_Distance(poi.location, c.location)))::integer AS distance_m,
      public.ST_Y(poi.location::public.geometry) AS latitude,
      public.ST_X(poi.location::public.geometry) AS longitude,
      photo.id AS photo_id, coalesce(thumb.url, photo.url) AS photo_url,
      photo.alt_text_ru AS photo_alt_text_ru, photo.author AS photo_author,
      photo.licence AS photo_licence, photo.source_url AS photo_source_url,
      photo.review_status AS photo_review_status, photo.rights_status AS photo_rights_status
    FROM atlas.circuit_travel_pois link
    JOIN atlas.tourism_pois poi ON poi.id = link.poi_id
    JOIN atlas.poi_categories category ON category.id = poi.category_id
    JOIN atlas.circuits c ON c.id = link.circuit_id
    LEFT JOIN LATERAL (
      SELECT media.* FROM atlas.media_assets media
      WHERE media.entity_type = 'tourism_poi' AND media.entity_id = poi.id AND media.media_type = 'image'
      ORDER BY media.is_primary DESC, media.id LIMIT 1
    ) photo ON true
    LEFT JOIN LATERAL (
      SELECT derivative.url FROM atlas.media_asset_derivatives derivative
      WHERE derivative.media_asset_id = photo.id
      ORDER BY CASE derivative.variant WHEN '640w' THEN 0 WHEN '1280w' THEN 1 ELSE 2 END LIMIT 1
    ) thumb ON true
    WHERE link.circuit_id = p_circuit_id
      AND (v_status = '' OR poi.review_status = v_status)
      AND (v_query = '' OR poi.id ILIKE '%' || v_query || '%' OR poi.name ILIKE '%' || v_query || '%'
        OR coalesce(poi.name_ru, '') ILIKE '%' || v_query || '%')
      AND (v_category = '' OR poi.category_id = v_category)
      AND (v_role = '' OR link.role = v_role)
      AND (v_photo = '' OR (v_photo = 'yes' AND photo.id IS NOT NULL)
        OR (v_photo = 'no' AND photo.id IS NULL))
      AND (v_featured = '' OR (v_featured = 'yes' AND link.is_featured)
        OR (v_featured = 'no' AND NOT link.is_featured))
      AND (v_distance_min IS NULL OR coalesce(link.distance_to_circuit_m, public.ST_Distance(poi.location, c.location)) >= v_distance_min * 1000)
      AND (v_distance_max IS NULL OR coalesce(link.distance_to_circuit_m, public.ST_Distance(poi.location, c.location)) <= v_distance_max * 1000)
      AND (v_importance_min IS NULL OR poi.importance >= v_importance_min)
      AND (v_importance_max IS NULL OR poi.importance <= v_importance_max)
      AND (v_translation = '' OR (v_translation = 'missing' AND nullif(btrim(coalesce(poi.name_ru, '')), '') IS NULL)
        OR (v_translation = 'ready' AND nullif(btrim(coalesce(poi.name_ru, '')), '') IS NOT NULL))
  ), page_rows AS (
    SELECT * FROM filtered ORDER BY priority DESC, pg_catalog.lower(coalesce(name_ru, name)), id
    LIMIT p_limit OFFSET (p_page - 1) * p_limit
  ), map_rows AS (
    SELECT * FROM filtered ORDER BY priority DESC, id LIMIT 2001
  )
  SELECT
    (SELECT count(*)::integer FROM filtered),
    coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', r.id, 'name', r.name, 'nameRu', r.name_ru, 'categoryId', r.category_id,
      'categoryName', r.category_name, 'role', r.role, 'importance', r.importance,
      'distanceToCircuitM', r.distance_m, 'reviewStatus', r.review_status,
      'isFeatured', r.is_featured,
      'photo', CASE WHEN r.photo_id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
        'id', r.photo_id, 'url', r.photo_url, 'altTextRu', r.photo_alt_text_ru,
        'author', r.photo_author, 'licence', r.photo_licence, 'sourceUrl', r.photo_source_url,
        'reviewStatus', r.photo_review_status, 'rightsStatus', r.photo_rights_status) END
    ) ORDER BY r.priority DESC, pg_catalog.lower(coalesce(r.name_ru, r.name)), r.id) FROM page_rows r), '[]'::jsonb),
    coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', m.id, 'name', coalesce(nullif(btrim(m.name_ru), ''), m.name),
      'nameRu', nullif(btrim(m.name_ru), ''), 'originalName', m.name,
      'categoryId', m.category_id, 'categoryIcon', m.category_icon, 'role', m.role,
      'latitude', m.latitude, 'longitude', m.longitude,
      'distanceToCircuitM', m.distance_m, 'reviewStatus', m.review_status
    ) ORDER BY m.priority DESC, m.id) FROM (SELECT * FROM map_rows LIMIT 2000) m), '[]'::jsonb)
  INTO v_count, v_rows, v_map;

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', category.id, 'name', category.name_ru, 'groupId', category.group_id
  ) ORDER BY category.group_id, category.default_priority DESC, category.name_ru), '[]'::jsonb)
  INTO v_categories FROM atlas.poi_categories category;

  RETURN pg_catalog.jsonb_build_object('circuit', v_circuit, 'rows', v_rows, 'mapPoints', v_map,
    'mapPointsTruncated', v_count > 2000, 'mapPointLimit', 2000,
    'categories', v_categories, 'filteredCount', v_count, 'page', p_page, 'limit', p_limit);
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_travel_point(p_circuit_id text, p_point_id text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT pg_catalog.jsonb_build_object(
    'point', pg_catalog.jsonb_build_object(
      'id', poi.id, 'circuitId', link.circuit_id,
      'circuitName', coalesce(profile.name_ru, circuit.short_name, circuit.name),
      'categoryId', poi.category_id, 'categoryName', category.name_ru, 'role', link.role,
      'name', poi.name, 'nameRu', poi.name_ru, 'descriptionRu', poi.description_ru,
      'latitude', public.ST_Y(poi.location::public.geometry),
      'longitude', public.ST_X(poi.location::public.geometry),
      'address', poi.address, 'websiteUrl', poi.website_url, 'openingHours', poi.opening_hours,
      'importance', poi.importance,
      'distanceToCircuitM', pg_catalog.round(coalesce(link.distance_to_circuit_m,
        public.ST_Distance(poi.location, circuit.location)))::integer,
      'reviewStatus', poi.review_status, 'priority', link.priority,
      'revision', pg_catalog.md5(poi.updated_at::text || '|' || link.updated_at::text),
      'isFeatured', link.is_featured, 'editorialNoteRu', link.editorial_note_ru,
      'sourceName', source.name, 'sourceUrl', source.url,
      'photo', CASE WHEN photo.id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
        'id', photo.id, 'url', coalesce(thumb.url, photo.url), 'altTextRu', photo.alt_text_ru,
        'author', photo.author, 'licence', photo.licence, 'sourceUrl', photo.source_url,
        'reviewStatus', photo.review_status, 'rightsStatus', photo.rights_status) END
    ),
    'categories', (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', cat.id, 'name', cat.name_ru, 'groupId', cat.group_id
    ) ORDER BY cat.group_id, cat.default_priority DESC, cat.name_ru), '[]'::jsonb)
      FROM atlas.poi_categories cat)
  )
  FROM atlas.circuit_travel_pois link
  JOIN atlas.tourism_pois poi ON poi.id = link.poi_id
  JOIN atlas.poi_categories category ON category.id = poi.category_id
  JOIN atlas.circuits circuit ON circuit.id = link.circuit_id
  LEFT JOIN atlas.circuit_page_profiles profile ON profile.circuit_id = circuit.id
  LEFT JOIN atlas.data_sources source ON source.id = poi.source_id
  LEFT JOIN LATERAL (
    SELECT media.* FROM atlas.media_assets media
    WHERE media.entity_type = 'tourism_poi' AND media.entity_id = poi.id AND media.media_type = 'image'
    ORDER BY media.is_primary DESC, media.id LIMIT 1
  ) photo ON true
  LEFT JOIN LATERAL (
    SELECT derivative.url FROM atlas.media_asset_derivatives derivative
    WHERE derivative.media_asset_id = photo.id
    ORDER BY CASE derivative.variant WHEN '640w' THEN 0 WHEN '1280w' THEN 1 ELSE 2 END LIMIT 1
  ) thumb ON true
  WHERE link.circuit_id = p_circuit_id AND poi.id = p_point_id;
$$;

REVOKE ALL ON FUNCTION atlas.admin_travel_points(text, jsonb, integer, integer),
  atlas.admin_travel_point(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_travel_points(text, jsonb, integer, integer),
  atlas.admin_travel_point(text, text) TO service_role;

COMMIT;
