BEGIN;

CREATE OR REPLACE FUNCTION atlas.admin_travel_access_anchors(p_circuit_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_circuit jsonb; v_rows jsonb; v_points jsonb;
BEGIN
  SELECT pg_catalog.jsonb_build_object('id', circuit.id,
    'name', coalesce(profile.name_ru, circuit.short_name, circuit.name)) INTO v_circuit
  FROM atlas.circuits circuit
  LEFT JOIN atlas.circuit_page_profiles profile ON profile.circuit_id = circuit.id
  WHERE circuit.id = p_circuit_id;
  IF v_circuit IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', row.id, 'poiId', row.poi_id, 'poiName', row.poi_name,
    'accessKind', row.access_kind, 'travelModes', row.travel_modes,
    'eventScope', row.event_scope, 'validFromYear', row.valid_from_year,
    'validToYear', row.valid_to_year, 'verificationStatus', row.verification_status,
    'confidence', row.confidence, 'sourceUrl', row.source_url,
    'evidenceNoteRu', row.evidence_note_ru, 'verifiedAt', row.verified_at,
    'revision', row.revision
  ) ORDER BY row.status_sort, row.confidence DESC, pg_catalog.lower(row.poi_name)), '[]'::jsonb)
  INTO v_rows FROM (
    SELECT anchor.*, pg_catalog.md5(pg_catalog.to_jsonb(anchor)::text) AS revision,
      coalesce(poi.name_ru, poi.name) AS poi_name, source.url AS source_url,
      CASE anchor.verification_status WHEN 'needs_review' THEN 0 WHEN 'candidate' THEN 1
        WHEN 'verified' THEN 2 ELSE 3 END AS status_sort
    FROM atlas.travel_access_anchors anchor
    JOIN atlas.tourism_pois poi ON poi.id = anchor.poi_id
    LEFT JOIN atlas.data_sources source ON source.id = anchor.source_id
    WHERE anchor.circuit_id = p_circuit_id
  ) row;

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', row.id, 'name', row.name, 'categoryName', row.category_name,
    'reviewStatus', row.review_status
  ) ORDER BY row.role_sort, row.priority DESC, pg_catalog.lower(row.name)), '[]'::jsonb)
  INTO v_points FROM (
    SELECT poi.id, coalesce(poi.name_ru, poi.name) AS name,
      category.name_ru AS category_name, poi.review_status, link.priority,
      CASE WHEN link.role = 'circuit' THEN 0 ELSE 1 END AS role_sort
    FROM atlas.circuit_travel_pois link
    JOIN atlas.tourism_pois poi ON poi.id = link.poi_id
    JOIN atlas.poi_categories category ON category.id = poi.category_id
    WHERE link.circuit_id = p_circuit_id
      AND (poi.review_status <> 'hidden' OR EXISTS (
        SELECT 1 FROM atlas.travel_access_anchors hidden_anchor
        WHERE hidden_anchor.circuit_id = p_circuit_id AND hidden_anchor.poi_id = poi.id))
      AND ((link.role = 'circuit' AND poi.category_id <> 'automotive_history')
        OR poi.category_id IN ('circuit_access','parking','park_and_ride','event_shuttle','bus_station','railway_station')
        OR EXISTS (SELECT 1 FROM atlas.travel_access_anchors existing_anchor
          WHERE existing_anchor.circuit_id = p_circuit_id AND existing_anchor.poi_id = poi.id))
  ) row;
  RETURN pg_catalog.jsonb_build_object('circuit', v_circuit, 'rows', v_rows,
    'pointOptions', v_points);
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_save_travel_access_anchor(
  p_circuit_id text, p_anchor_id text, p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_poi_id text := p_input->>'poiId';
  v_kind text := p_input->>'accessKind';
  v_scope text := p_input->>'eventScope';
  v_status text := p_input->>'verificationStatus';
  v_confidence integer := (p_input->>'confidence')::integer;
  v_from integer := nullif(p_input->>'validFromYear', '')::integer;
  v_to integer := nullif(p_input->>'validToYear', '')::integer;
  v_modes text[];
  v_source_url text := nullif(btrim(p_input->>'sourceUrl'), '');
  v_source_id text;
  v_existing atlas.travel_access_anchors%ROWTYPE;
  v_expected text := nullif(p_input->>'expectedRevision', '');
BEGIN
  IF p_input IS NULL OR pg_catalog.jsonb_typeof(p_input) <> 'object'
    OR p_circuit_id IS NULL OR p_circuit_id !~ '^[A-Za-z0-9_-]{1,100}$'
    OR p_anchor_id IS NULL OR p_anchor_id !~ '^[A-Za-z0-9_-]{1,100}$'
    OR v_poi_id IS NULL OR v_poi_id !~ '^[A-Za-z0-9_-]{1,100}$'
    OR v_kind IS NULL OR v_kind NOT IN ('gate','parking','dropoff','shuttle_stop','approach')
    OR v_scope IS NULL OR v_scope NOT IN ('general','event')
    OR v_status IS NULL OR v_status NOT IN ('candidate','needs_review','verified','rejected','expired')
    OR v_confidence IS NULL OR v_confidence < 0 OR v_confidence > 100
    OR (v_from IS NOT NULL AND (v_from < 1900 OR v_from > 2100))
    OR (v_to IS NOT NULL AND (v_to < 1900 OR v_to > 2100))
    OR (v_from IS NOT NULL AND v_to IS NOT NULL AND v_to < v_from)
    OR pg_catalog.jsonb_typeof(p_input->'travelModes') <> 'array' THEN
    RAISE EXCEPTION 'Некорректные данные точки доступа';
  END IF;
  SELECT coalesce(pg_catalog.array_agg(DISTINCT value), ARRAY[]::text[])
    INTO v_modes FROM pg_catalog.jsonb_array_elements_text(p_input->'travelModes') AS value;
  IF EXISTS (SELECT 1 FROM pg_catalog.unnest(v_modes) mode
    WHERE mode NOT IN ('car','transit','shuttle','walk','bicycle','mixed')) THEN
    RAISE EXCEPTION 'Некорректный способ передвижения';
  END IF;
  IF v_source_url IS NOT NULL AND (
    pg_catalog.length(v_source_url) > 2000
    OR v_source_url !~ '^https?://[^/?#@]+([/?#]|$)'
  ) THEN RAISE EXCEPTION 'Некорректный URL источника'; END IF;
  IF v_status = 'verified' AND (
    v_source_url IS NULL OR v_confidence < 70 OR pg_catalog.cardinality(v_modes) = 0
  ) THEN RAISE EXCEPTION 'Для проверки нужны источник, уверенность от 70%% и способ передвижения'; END IF;

  PERFORM 1 FROM atlas.circuit_travel_pois link
  WHERE link.circuit_id = p_circuit_id AND link.poi_id = v_poi_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Точка не относится к выбранной трассе'; END IF;

  SELECT * INTO v_existing FROM atlas.travel_access_anchors
  WHERE id = p_anchor_id FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.circuit_id <> p_circuit_id THEN
      RAISE EXCEPTION 'ID точки доступа уже принадлежит другой трассе';
    END IF;
    IF v_expected IS NULL OR pg_catalog.md5(pg_catalog.to_jsonb(v_existing)::text) <> v_expected THEN
      RAISE EXCEPTION 'Точка доступа изменена после открытия страницы. Обновите страницу';
    END IF;
  ELSIF v_expected IS NOT NULL THEN
    RAISE EXCEPTION 'Точка доступа больше не существует';
  END IF;
  IF v_status <> 'verified' AND EXISTS (
    SELECT 1 FROM atlas.travel_route_access_anchors assignment
    JOIN atlas.travel_routes route ON route.id = assignment.route_id
    WHERE assignment.anchor_id = p_anchor_id
      AND route.review_status IN ('reviewed','published')
  ) THEN RAISE EXCEPTION 'Точка используется проверенным или опубликованным маршрутом'; END IF;

  IF v_source_url IS NOT NULL THEN
    v_source_id := 'travel-access-' || pg_catalog.left(pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(v_source_url, 'UTF8')), 'hex'), 16);
    INSERT INTO atlas.data_sources (id, name, url, retrieved_at, notes)
    VALUES (v_source_id,
      pg_catalog.split_part(pg_catalog.split_part(v_source_url, '://', 2), '/', 1),
      v_source_url, now(), 'Источник точки доступа к трассе')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url,
      retrieved_at = now();
  END IF;
  IF v_existing.id IS NULL THEN
    INSERT INTO atlas.travel_access_anchors
      (id,circuit_id,poi_id,access_kind,travel_modes,event_scope,valid_from_year,valid_to_year,
       verification_status,confidence,source_id,evidence_note_ru,verified_at)
    VALUES (p_anchor_id,p_circuit_id,v_poi_id,v_kind,v_modes,v_scope,v_from,v_to,
      v_status,v_confidence,v_source_id,nullif(btrim(p_input->>'evidenceNoteRu'),''),
      CASE WHEN v_status = 'verified' THEN now() ELSE NULL END);
  ELSE
    UPDATE atlas.travel_access_anchors SET poi_id=v_poi_id,access_kind=v_kind,
      travel_modes=v_modes,event_scope=v_scope,valid_from_year=v_from,valid_to_year=v_to,
      verification_status=v_status,confidence=v_confidence,source_id=v_source_id,
      evidence_note_ru=nullif(btrim(p_input->>'evidenceNoteRu'),''),
      verified_at=CASE WHEN v_status='verified' THEN now() ELSE NULL END
    WHERE id=p_anchor_id;
  END IF;
  RETURN pg_catalog.jsonb_build_object('id',p_anchor_id,'circuitId',p_circuit_id);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_travel_access_anchors(text),
  atlas.admin_save_travel_access_anchor(text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_travel_access_anchors(text),
  atlas.admin_save_travel_access_anchor(text,text,jsonb) TO service_role;

COMMIT;
