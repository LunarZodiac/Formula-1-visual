BEGIN;

CREATE OR REPLACE FUNCTION atlas.admin_travel_zones(p_circuit_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_circuit jsonb; v_rows jsonb;
BEGIN
  SELECT pg_catalog.jsonb_build_object('id', c.id,
    'name', coalesce(p.name_ru, c.short_name, c.name)) INTO v_circuit
  FROM atlas.circuits c LEFT JOIN atlas.circuit_page_profiles p ON p.circuit_id = c.id
  WHERE c.id = p_circuit_id;
  IF v_circuit IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', z.id, 'zoneType', z.zone_type, 'nameRu', z.name_ru,
    'priority', z.priority, 'priceBand', z.price_band, 'reviewStatus', z.review_status,
    'hasGeometry', z.geometry IS NOT NULL, 'pointCount', z.point_count,
    'exampleCount', z.example_count
  ) ORDER BY z.priority DESC, pg_catalog.lower(z.name_ru)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT zone.id, zone.zone_type, zone.name_ru, zone.priority, zone.price_band,
      zone.review_status, zone.geometry, count(link.poi_id)::integer AS point_count,
      count(link.poi_id) FILTER (WHERE link.is_example)::integer AS example_count
    FROM atlas.travel_zones zone LEFT JOIN atlas.travel_zone_pois link ON link.zone_id = zone.id
    WHERE zone.circuit_id = p_circuit_id GROUP BY zone.id
  ) z;
  RETURN pg_catalog.jsonb_build_object('circuit', v_circuit, 'rows', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_travel_zone(p_circuit_id text, p_zone_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_zone jsonb; v_points jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM atlas.circuits WHERE id = p_circuit_id) THEN RETURN NULL; END IF;
  IF p_zone_id = 'new' THEN
    v_zone := pg_catalog.jsonb_build_object('id', '', 'circuitId', p_circuit_id,
      'zoneType', 'accommodation', 'name', '', 'nameRu', '', 'descriptionRu', NULL,
      'geometryGeoJson', NULL, 'priority', 50, 'priceBand', NULL, 'bestFor', '[]'::jsonb,
      'advantagesRu', '[]'::jsonb, 'disadvantagesRu', '[]'::jsonb, 'eventOnly', false,
      'reviewStatus', 'candidate', 'sortOrder', 0, 'characterRu', 'Район проживания',
      'travelTimeRu', 'Уточняется', 'tone', '#F2C14E', 'sourceName', NULL,
      'sourceUrl', NULL, 'revision', NULL);
  ELSE
    SELECT pg_catalog.jsonb_build_object('id', z.id, 'circuitId', z.circuit_id,
      'zoneType', z.zone_type, 'name', z.name, 'nameRu', z.name_ru,
      'descriptionRu', z.description_ru,
      'geometryGeoJson', CASE WHEN z.geometry IS NULL THEN NULL ELSE public.ST_AsGeoJSON(z.geometry::public.geometry) END,
      'priority', z.priority, 'priceBand', z.price_band, 'bestFor', z.best_for,
      'advantagesRu', z.advantages_ru, 'disadvantagesRu', z.disadvantages_ru,
      'eventOnly', z.event_only, 'reviewStatus', z.review_status,
      'sortOrder', coalesce(p.sort_order, 0),
      'characterRu', coalesce(p.character_ru, ''), 'travelTimeRu', coalesce(p.travel_time_ru, ''),
      'tone', coalesce(p.tone, '#F2C14E'), 'sourceName', s.name, 'sourceUrl', s.url,
      'revision', pg_catalog.md5(pg_catalog.to_jsonb(z)::text || '|' ||
        coalesce(pg_catalog.to_jsonb(p)::text, '') || '|' || coalesce((
          SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l) ORDER BY l.sort_order, l.poi_id)::text
          FROM atlas.travel_zone_pois l WHERE l.zone_id = z.id), ''))),
      (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', row.id, 'name', row.name, 'categoryName', row.category_name,
        'selected', row.selected, 'isExample', row.is_example, 'sortOrder', row.sort_order
      ) ORDER BY row.selected DESC, row.sort_order, row.importance DESC,
        pg_catalog.lower(row.name)), '[]'::jsonb)
      FROM (
        SELECT poi.id, coalesce(poi.name_ru, poi.name) AS name,
          category.name_ru AS category_name, link.zone_id IS NOT NULL AS selected,
          coalesce(link.is_example, false) AS is_example,
          coalesce(link.sort_order, 0)::integer AS sort_order, poi.importance
        FROM atlas.circuit_travel_pois circuit_link
        JOIN atlas.tourism_pois poi ON poi.id = circuit_link.poi_id
        JOIN atlas.poi_categories category ON category.id = poi.category_id
        LEFT JOIN atlas.travel_zone_pois link ON link.poi_id = poi.id AND link.zone_id = z.id
        WHERE circuit_link.circuit_id = p_circuit_id AND category.group_id = 'stay'
          AND (poi.review_status <> 'hidden' OR link.zone_id IS NOT NULL)
      ) row)
    INTO v_zone, v_points
    FROM atlas.travel_zones z
    LEFT JOIN atlas.circuit_travel_zone_presentations p ON p.zone_id = z.id
    LEFT JOIN atlas.data_sources s ON s.id = z.source_id
    WHERE z.circuit_id = p_circuit_id AND z.id = p_zone_id;
    IF v_zone IS NULL THEN RETURN NULL; END IF;
  END IF;

  IF p_zone_id = 'new' THEN
    SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', row.id, 'name', row.name, 'categoryName', row.category_name,
      'selected', false, 'isExample', false, 'sortOrder', 0
    ) ORDER BY row.importance DESC, pg_catalog.lower(row.name)), '[]'::jsonb) INTO v_points
    FROM (
      SELECT poi.id, coalesce(poi.name_ru, poi.name) AS name,
        category.name_ru AS category_name, poi.importance
      FROM atlas.circuit_travel_pois circuit_link
      JOIN atlas.tourism_pois poi ON poi.id = circuit_link.poi_id
      JOIN atlas.poi_categories category ON category.id = poi.category_id
      WHERE circuit_link.circuit_id = p_circuit_id AND category.group_id = 'stay'
        AND poi.review_status <> 'hidden'
    ) row;
  END IF;
  RETURN pg_catalog.jsonb_build_object('zone', v_zone, 'points', v_points);
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_save_travel_zone(
  p_circuit_id text, p_zone_id text, p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_name text := nullif(btrim(p_input->>'name'), '');
  v_name_ru text := nullif(btrim(p_input->>'nameRu'), '');
  v_type text := p_input->>'zoneType';
  v_status text := p_input->>'reviewStatus';
  v_priority integer := (p_input->>'priority')::integer;
  v_price integer := nullif(p_input->>'priceBand', '')::integer;
  v_sort integer := (p_input->>'sortOrder')::integer;
  v_tone text := p_input->>'tone';
  v_source_url text := nullif(btrim(p_input->>'sourceUrl'), '');
  v_source_id text;
  v_geometry jsonb := nullif(btrim(p_input->>'geometryGeoJson'), '')::jsonb;
  v_shape public.geometry;
  v_selected text[];
  v_examples text[];
  v_best text[];
  v_advantages text[];
  v_disadvantages text[];
  v_existing atlas.travel_zones%ROWTYPE;
  v_revision text;
  v_expected text := nullif(p_input->>'expectedRevision', '');
BEGIN
  IF p_input IS NULL OR pg_catalog.jsonb_typeof(p_input) <> 'object'
    OR p_circuit_id IS NULL OR p_circuit_id !~ '^[A-Za-z0-9_-]{1,100}$'
    OR p_zone_id IS NULL OR p_zone_id !~ '^[A-Za-z0-9_-]{1,100}$' OR p_zone_id = 'new'
    OR v_name IS NULL OR pg_catalog.length(v_name) > 500
    OR v_name_ru IS NULL OR pg_catalog.length(v_name_ru) > 500
    OR v_type IS NULL OR v_type NOT IN ('accommodation','parking','park_and_ride','access','restricted','walking','travel_time')
    OR v_status IS NULL OR v_status NOT IN ('candidate','reviewed','published','hidden')
    OR v_priority IS NULL OR v_priority NOT BETWEEN 0 AND 100
    OR (v_price IS NOT NULL AND v_price NOT BETWEEN 1 AND 4)
    OR v_sort IS NULL OR v_sort NOT BETWEEN 0 AND 32767
    OR v_tone IS NULL OR v_tone !~ '^#[0-9A-Fa-f]{6}$'
    OR v_source_url IS NULL OR pg_catalog.length(v_source_url) > 2000
    OR v_source_url !~ '^https?://[^/?#@]+([/?#]|$)'
    OR pg_catalog.jsonb_typeof(p_input->'eventOnly') IS DISTINCT FROM 'boolean'
    OR pg_catalog.jsonb_typeof(p_input->'selectedPoints') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_typeof(p_input->'examplePoints') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_typeof(p_input->'bestFor') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_typeof(p_input->'advantagesRu') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_typeof(p_input->'disadvantagesRu') IS DISTINCT FROM 'array'
    OR (v_geometry IS NOT NULL AND (v_geometry->>'type') NOT IN ('Polygon','MultiPolygon'))
    OR (v_status IN ('reviewed','published') AND v_geometry IS NULL) THEN
    RAISE EXCEPTION 'Некорректные данные района';
  END IF;
  SELECT coalesce(pg_catalog.array_agg(value), ARRAY[]::text[]) INTO v_selected
  FROM pg_catalog.jsonb_array_elements_text(p_input->'selectedPoints') AS value;
  SELECT coalesce(pg_catalog.array_agg(value), ARRAY[]::text[]) INTO v_examples
  FROM pg_catalog.jsonb_array_elements_text(p_input->'examplePoints') AS value;
  SELECT coalesce(pg_catalog.array_agg(value), ARRAY[]::text[]) INTO v_best
  FROM pg_catalog.jsonb_array_elements_text(p_input->'bestFor') AS value;
  SELECT coalesce(pg_catalog.array_agg(value), ARRAY[]::text[]) INTO v_advantages
  FROM pg_catalog.jsonb_array_elements_text(p_input->'advantagesRu') AS value;
  SELECT coalesce(pg_catalog.array_agg(value), ARRAY[]::text[]) INTO v_disadvantages
  FROM pg_catalog.jsonb_array_elements_text(p_input->'disadvantagesRu') AS value;
  IF pg_catalog.cardinality(v_selected) > 2000
    OR pg_catalog.cardinality(v_selected) <> (SELECT count(DISTINCT item.value) FROM pg_catalog.unnest(v_selected) AS item(value))
    OR EXISTS (SELECT 1 FROM pg_catalog.unnest(v_selected) AS item(value) WHERE item.value !~ '^[A-Za-z0-9_-]{1,100}$')
    OR EXISTS (SELECT 1 FROM pg_catalog.unnest(v_examples) AS item(value) WHERE item.value <> ALL(v_selected))
    OR EXISTS (SELECT 1 FROM pg_catalog.unnest(v_selected) AS item(value) WHERE NOT EXISTS (
      SELECT 1 FROM atlas.circuit_travel_pois link
      JOIN atlas.tourism_pois poi ON poi.id = link.poi_id
      JOIN atlas.poi_categories category ON category.id = poi.category_id
      WHERE link.circuit_id = p_circuit_id AND link.poi_id = item.value AND category.group_id = 'stay'))
    OR pg_catalog.cardinality(v_best) > 50 OR pg_catalog.cardinality(v_advantages) > 50
    OR pg_catalog.cardinality(v_disadvantages) > 50 THEN
    RAISE EXCEPTION 'Некорректные объекты или списки района';
  END IF;
  IF v_geometry IS NOT NULL THEN
    v_shape := public.ST_SetSRID(public.ST_GeomFromGeoJSON(v_geometry::text), 4326);
    IF public.ST_GeometryType(v_shape) NOT IN ('ST_Polygon','ST_MultiPolygon')
      OR public.ST_IsEmpty(v_shape) OR NOT public.ST_IsValid(v_shape)
      OR public.ST_XMin(v_shape) < -180 OR public.ST_XMax(v_shape) > 180
      OR public.ST_YMin(v_shape) < -90 OR public.ST_YMax(v_shape) > 90 THEN
      RAISE EXCEPTION 'Граница района должна быть корректным полигоном';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM atlas.circuits WHERE id = p_circuit_id) THEN
    RAISE EXCEPTION 'Трасса не найдена';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_zone_id, 0));
  SELECT * INTO v_existing FROM atlas.travel_zones WHERE id = p_zone_id FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.circuit_id <> p_circuit_id THEN RAISE EXCEPTION 'ID района принадлежит другой трассе'; END IF;
    SELECT pg_catalog.md5(pg_catalog.to_jsonb(v_existing)::text || '|' ||
      coalesce(pg_catalog.to_jsonb(p)::text, '') || '|' || coalesce((
        SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l) ORDER BY l.sort_order, l.poi_id)::text
        FROM atlas.travel_zone_pois l WHERE l.zone_id = p_zone_id), '')) INTO v_revision
    FROM atlas.travel_zones z
    LEFT JOIN atlas.circuit_travel_zone_presentations p ON p.zone_id = z.id
    WHERE z.id = p_zone_id;
    IF v_revision IS NULL OR v_expected IS NULL OR v_revision <> v_expected THEN
      RAISE EXCEPTION 'Район изменён после открытия страницы. Обновите страницу';
    END IF;
  ELSIF v_expected IS NOT NULL THEN
    RAISE EXCEPTION 'Район больше не существует';
  END IF;
  v_source_id := 'travel-' || pg_catalog.left(pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_source_url, 'UTF8')), 'hex'), 16);
  INSERT INTO atlas.data_sources(id,name,url,retrieved_at,notes)
  VALUES (v_source_id, pg_catalog.split_part(pg_catalog.split_part(v_source_url,'://',2),'/',1),
    v_source_url, now(), 'Источник района проживания')
  ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,retrieved_at=now();
  INSERT INTO atlas.travel_zones
    (id,circuit_id,zone_type,name,name_ru,description_ru,geometry,priority,price_band,
     best_for,advantages_ru,disadvantages_ru,event_only,source_id,review_status)
  VALUES (p_zone_id,p_circuit_id,v_type,v_name,v_name_ru,nullif(btrim(p_input->>'descriptionRu'),''),
    CASE WHEN v_shape IS NULL THEN NULL ELSE public.ST_Multi(v_shape)::public.geography END,
    v_priority,v_price,v_best,v_advantages,v_disadvantages,(p_input->>'eventOnly')::boolean,
    v_source_id,v_status)
  ON CONFLICT(id) DO UPDATE SET zone_type=EXCLUDED.zone_type,name=EXCLUDED.name,
    name_ru=EXCLUDED.name_ru,description_ru=EXCLUDED.description_ru,geometry=EXCLUDED.geometry,
    priority=EXCLUDED.priority,price_band=EXCLUDED.price_band,best_for=EXCLUDED.best_for,
    advantages_ru=EXCLUDED.advantages_ru,disadvantages_ru=EXCLUDED.disadvantages_ru,
    event_only=EXCLUDED.event_only,source_id=EXCLUDED.source_id,
    review_status=EXCLUDED.review_status,updated_at=pg_catalog.clock_timestamp();
  INSERT INTO atlas.circuit_travel_zone_presentations(zone_id,sort_order,character_ru,travel_time_ru,tone)
  VALUES (p_zone_id,v_sort,coalesce(nullif(btrim(p_input->>'characterRu'),''),'Район проживания'),
    coalesce(nullif(btrim(p_input->>'travelTimeRu'),''),'Уточняется'),v_tone)
  ON CONFLICT(zone_id) DO UPDATE SET sort_order=EXCLUDED.sort_order,
    character_ru=EXCLUDED.character_ru,travel_time_ru=EXCLUDED.travel_time_ru,tone=EXCLUDED.tone;
  DELETE FROM atlas.travel_zone_pois WHERE zone_id = p_zone_id;
  INSERT INTO atlas.travel_zone_pois(zone_id,poi_id,is_example,sort_order)
  SELECT p_zone_id, id, id = ANY(v_examples), ordinality::smallint
  FROM pg_catalog.unnest(v_selected) WITH ORDINALITY AS points(id, ordinality);
  RETURN pg_catalog.jsonb_build_object('id',p_zone_id,'circuitId',p_circuit_id,
    'publicDataSynced',false);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_travel_zones(text),
  atlas.admin_travel_zone(text,text), atlas.admin_save_travel_zone(text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_travel_zones(text),
  atlas.admin_travel_zone(text,text), atlas.admin_save_travel_zone(text,text,jsonb)
  TO service_role;

COMMIT;
