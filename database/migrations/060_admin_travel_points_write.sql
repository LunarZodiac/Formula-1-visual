BEGIN;

CREATE OR REPLACE FUNCTION atlas.admin_save_travel_point(
  p_circuit_id text, p_point_id text, p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_name text := nullif(btrim(p_input->>'name'), '');
  v_category text := nullif(btrim(p_input->>'categoryId'), '');
  v_role text := p_input->>'role';
  v_status text := p_input->>'reviewStatus';
  v_latitude double precision := (p_input->>'latitude')::double precision;
  v_longitude double precision := (p_input->>'longitude')::double precision;
  v_importance integer := (p_input->>'importance')::integer;
  v_priority integer := (p_input->>'priority')::integer;
  v_website text := nullif(btrim(p_input->>'websiteUrl'), '');
  v_updated text;
  v_current_revision text;
BEGIN
  IF p_input IS NULL OR pg_catalog.jsonb_typeof(p_input) <> 'object'
    OR p_circuit_id IS NULL OR p_point_id IS NULL
    OR v_name IS NULL OR v_category IS NULL OR pg_catalog.length(v_name) > 500
    OR v_role NOT IN ('transport', 'stay', 'explore', 'essential', 'circuit')
    OR v_status NOT IN ('candidate', 'reviewed', 'published', 'hidden')
    OR v_latitude IS NULL OR v_latitude < -90 OR v_latitude > 90
    OR v_longitude IS NULL OR v_longitude < -180 OR v_longitude > 180
    OR v_importance IS NULL OR v_importance < 0 OR v_importance > 100
    OR v_priority IS NULL OR v_priority < 0 OR v_priority > 100
    OR pg_catalog.jsonb_typeof(p_input->'isFeatured') <> 'boolean'
    OR nullif(p_input->>'expectedRevision', '') IS NULL
    OR (v_website IS NOT NULL AND (v_website !~* '^https?://[^[:space:]@/]+' OR v_website ~ '@')) THEN
    RAISE EXCEPTION 'Некорректные данные туристической точки';
  END IF;

  SELECT pg_catalog.md5(poi.updated_at::text || '|' || link.updated_at::text)
    INTO v_current_revision
  FROM atlas.circuit_travel_pois link
  JOIN atlas.tourism_pois poi ON poi.id = link.poi_id
  WHERE link.circuit_id = p_circuit_id AND link.poi_id = p_point_id
  FOR UPDATE OF poi, link;
  IF v_current_revision IS NULL THEN RAISE EXCEPTION 'Точка не относится к выбранной трассе'; END IF;
  IF v_current_revision <> p_input->>'expectedRevision' THEN
    RAISE EXCEPTION 'Точка была изменена после открытия страницы. Обновите страницу перед сохранением';
  END IF;

  UPDATE atlas.tourism_pois poi SET
    category_id = v_category, name = v_name,
    name_ru = nullif(btrim(p_input->>'nameRu'), ''),
    description_ru = nullif(btrim(p_input->>'descriptionRu'), ''),
    location = public.ST_SetSRID(public.ST_MakePoint(v_longitude, v_latitude), 4326)::public.geography,
    address = nullif(btrim(p_input->>'address'), ''), website_url = v_website,
    opening_hours = nullif(btrim(p_input->>'openingHours'), ''),
    importance = v_importance, review_status = v_status, updated_at = pg_catalog.clock_timestamp()
  WHERE poi.id = p_point_id AND EXISTS (
    SELECT 1 FROM atlas.circuit_travel_pois link
    WHERE link.circuit_id = p_circuit_id AND link.poi_id = poi.id
  ) RETURNING poi.id INTO v_updated;
  IF v_updated IS NULL THEN RAISE EXCEPTION 'Точка не относится к выбранной трассе'; END IF;

  UPDATE atlas.circuit_travel_pois SET role = v_role, priority = v_priority,
    is_featured = (p_input->>'isFeatured')::boolean,
    editorial_note_ru = nullif(btrim(p_input->>'editorialNoteRu'), ''), updated_at = pg_catalog.clock_timestamp()
  WHERE circuit_id = p_circuit_id AND poi_id = p_point_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Связь точки с трассой не найдена'; END IF;
  RETURN pg_catalog.jsonb_build_object('id', p_point_id, 'circuitId', p_circuit_id,
    'publicDataSynced', false);
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_save_travel_points_bulk(
  p_circuit_id text, p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_ids text[];
  v_count integer;
  v_status text := p_input->>'reviewStatus';
  v_featured boolean := (p_input->>'isFeatured')::boolean;
  v_has_status boolean := p_input ? 'reviewStatus';
  v_has_featured boolean := p_input ? 'isFeatured';
BEGIN
  IF p_circuit_id IS NULL OR p_circuit_id !~ '^[A-Za-z0-9_-]{1,100}$'
    OR p_input IS NULL OR pg_catalog.jsonb_typeof(p_input) <> 'object'
    OR pg_catalog.jsonb_typeof(p_input->'pointIds') <> 'array'
    OR v_has_status = v_has_featured
    OR (v_has_status AND v_status NOT IN ('candidate', 'reviewed', 'published', 'hidden'))
    OR (v_has_featured AND pg_catalog.jsonb_typeof(p_input->'isFeatured') <> 'boolean') THEN
    RAISE EXCEPTION 'Некорректное пакетное действие';
  END IF;
  SELECT pg_catalog.array_agg(value), count(*)::integer INTO v_ids, v_count
  FROM pg_catalog.jsonb_array_elements_text(p_input->'pointIds') AS value;
  IF v_count IS NULL OR v_count < 1 OR v_count > 100
    OR EXISTS (SELECT 1 FROM pg_catalog.unnest(v_ids) id WHERE id !~ '^[A-Za-z0-9_-]{1,100}$')
    OR (SELECT count(DISTINCT id) FROM pg_catalog.unnest(v_ids) id) <> v_count THEN
    RAISE EXCEPTION 'Некорректный список туристических точек';
  END IF;
  SELECT count(*)::integer INTO v_count FROM atlas.circuit_travel_pois link
  WHERE link.circuit_id = p_circuit_id AND link.poi_id = ANY(v_ids);
  IF v_count <> pg_catalog.array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'Одна или несколько точек не относятся к выбранной трассе';
  END IF;
  IF v_has_status THEN
    UPDATE atlas.tourism_pois poi SET review_status = v_status, updated_at = now()
    WHERE poi.id = ANY(v_ids) AND EXISTS (
      SELECT 1 FROM atlas.circuit_travel_pois link
      WHERE link.circuit_id = p_circuit_id AND link.poi_id = poi.id
    );
  ELSE
    UPDATE atlas.circuit_travel_pois SET is_featured = v_featured, updated_at = now()
    WHERE circuit_id = p_circuit_id AND poi_id = ANY(v_ids);
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> pg_catalog.array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'Не удалось обновить весь выбранный набор';
  END IF;
  RETURN pg_catalog.jsonb_build_object('circuitId', p_circuit_id,
    'updated', v_count, 'publicDataSynced', false);
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_apply_travel_osm_names(p_circuit_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_count integer;
BEGIN
  IF p_circuit_id IS NULL OR p_circuit_id !~ '^[A-Za-z0-9_-]{1,100}$' THEN
    RAISE EXCEPTION 'Некорректный ID трассы';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM atlas.circuits WHERE id = p_circuit_id) THEN
    RAISE EXCEPTION 'Трасса не найдена';
  END IF;
  UPDATE atlas.tourism_pois poi SET name_ru = nullif(btrim(coalesce(
      poi.properties #>> '{tags,name:ru}', poi.properties #>> '{osm,tags,name:ru}'
    )), ''), updated_at = now()
  FROM atlas.circuit_travel_pois link
  WHERE link.circuit_id = p_circuit_id AND link.poi_id = poi.id
    AND nullif(btrim(coalesce(poi.name_ru, '')), '') IS NULL
    AND nullif(btrim(coalesce(
      poi.properties #>> '{tags,name:ru}', poi.properties #>> '{osm,tags,name:ru}'
    )), '') IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN pg_catalog.jsonb_build_object('circuitId', p_circuit_id,
    'updated', v_count, 'publicDataSynced', v_count = 0);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_save_travel_point(text, text, jsonb),
  atlas.admin_save_travel_points_bulk(text, jsonb),
  atlas.admin_apply_travel_osm_names(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_save_travel_point(text, text, jsonb),
  atlas.admin_save_travel_points_bulk(text, jsonb),
  atlas.admin_apply_travel_osm_names(text) TO service_role;

COMMIT;
