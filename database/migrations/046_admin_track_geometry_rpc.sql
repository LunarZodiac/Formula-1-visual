BEGIN;

CREATE OR REPLACE FUNCTION atlas.admin_inspect_track_geometry(
    p_circuit_id text, p_layout_id text, p_geometry jsonb,
    p_direction text, p_was_closed boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_layout record;
    v_geometry public.geometry;
    v_points integer;
    v_measured integer;
    v_maximum integer;
    v_valid_coordinates boolean;
    v_simple boolean;
    v_deviation numeric;
    v_warnings text[] := ARRAY[]::text[];
BEGIN
    IF p_circuit_id IS NULL OR p_circuit_id !~ '^[A-Za-z0-9_-]+$'
       OR p_layout_id IS NULL OR p_layout_id !~ '^[A-Za-z0-9_-]+$'
       OR p_direction IS NULL OR p_direction NOT IN ('clockwise', 'counterclockwise')
       OR p_was_closed IS NULL OR p_geometry->>'type' IS NULL
       OR p_geometry->>'type' <> 'LineString' THEN
        RAISE EXCEPTION 'Некорректный контур конфигурации';
    END IF;
    v_geometry := public.ST_Force3D(public.ST_SetSRID(public.ST_GeomFromGeoJSON(p_geometry::text), 4326));
    v_points := public.ST_NPoints(v_geometry);
    IF public.ST_GeometryType(v_geometry) <> 'ST_LineString'
       OR v_points NOT BETWEEN 3 AND 50001
       OR NOT public.ST_IsClosed(v_geometry)
       OR NOT public.ST_IsValid(v_geometry) THEN
        RAISE EXCEPTION 'Контур должен быть корректной замкнутой линией';
    END IF;
    SELECT bool_and(public.ST_X(point.geom) BETWEEN -180 AND 180
            AND public.ST_Y(point.geom) BETWEEN -90 AND 90
            AND public.ST_Z(point.geom) BETWEEN -1000 AND 10000)
    INTO v_valid_coordinates
    FROM public.ST_DumpPoints(v_geometry) AS point;
    IF NOT coalesce(v_valid_coordinates, false) THEN
        RAISE EXCEPTION 'Координаты контура выходят за допустимые границы';
    END IF;

    SELECT layout.id, layout.name, layout.length_m, layout.provenance_type,
           layout.review_status, source.url AS source_url, circuit.location
    INTO v_layout
    FROM atlas.track_layouts AS layout
    JOIN atlas.circuits AS circuit ON circuit.id = layout.circuit_id
    LEFT JOIN atlas.data_sources AS source ON source.id = layout.source_id
    WHERE layout.id = p_layout_id AND layout.circuit_id = p_circuit_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Конфигурация не найдена'; END IF;

    v_measured := round(public.ST_Length(public.ST_Force2D(v_geometry)::public.geography))::integer;
    SELECT round(max(public.ST_Distance(point.geom::public.geography, v_layout.location)))::integer
    INTO v_maximum
    FROM public.ST_DumpPoints(public.ST_Force2D(v_geometry)) AS point;
    v_simple := public.ST_IsSimple(public.ST_Force2D(v_geometry));
    IF v_measured NOT BETWEEN 100 AND 100000 THEN
        RAISE EXCEPTION 'Измеренная длина контура вне диапазона 100–100 000 м';
    END IF;
    IF v_maximum > 75000 THEN
        RAISE EXCEPTION 'Контур дальше 75 км от точки трассы';
    END IF;
    IF v_layout.length_m IS NOT NULL AND v_layout.length_m > 0 THEN
        v_deviation := round(100.0 * (v_measured - v_layout.length_m) / v_layout.length_m, 1);
    END IF;
    IF NOT p_was_closed THEN
        v_warnings := array_append(v_warnings,
            'Контур не был замкнут — первая точка добавлена в конце автоматически');
    END IF;
    IF NOT v_simple THEN
        v_warnings := array_append(v_warnings,
            'Линия пересекает сама себя — проверьте конфигурацию');
    END IF;
    IF v_deviation IS NOT NULL AND abs(v_deviation) > 10 THEN
        v_warnings := array_append(v_warnings,
            'Измеренная длина отличается от указанной на ' || abs(v_deviation)::text || '%');
    END IF;
    RETURN jsonb_build_object(
        'geometry', p_geometry, 'direction', p_direction,
        'pointCount', v_points, 'measuredLengthM', v_measured,
        'maximumDistanceM', v_maximum, 'expectedLengthM', v_layout.length_m,
        'lengthDeviationPercent', v_deviation, 'warnings', to_jsonb(v_warnings),
        'layout', jsonb_build_object('id', v_layout.id, 'name', v_layout.name,
            'provenanceType', v_layout.provenance_type,
            'reviewStatus', v_layout.review_status,
            'sourceUrl', v_layout.source_url)
    );
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_import_track_geometry(
    p_circuit_id text, p_layout_id text, p_geometry jsonb,
    p_direction text, p_was_closed boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_preview jsonb;
BEGIN
    PERFORM 1 FROM atlas.circuits WHERE id = p_circuit_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Трасса не найдена'; END IF;
    IF EXISTS (SELECT 1 FROM atlas.circuit_page_profiles
        WHERE circuit_id = p_circuit_id AND geometry_id = p_layout_id
          AND editorial_status = 'published') THEN
        RAISE EXCEPTION 'Контур используется опубликованной страницей трассы';
    END IF;
    PERFORM 1 FROM atlas.track_layouts
    WHERE id = p_layout_id AND circuit_id = p_circuit_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Конфигурация не найдена'; END IF;
    v_preview := atlas.admin_inspect_track_geometry(
        p_circuit_id, p_layout_id, p_geometry, p_direction, p_was_closed);
    IF v_preview->'layout'->>'provenanceType' = 'unknown' THEN
        RAISE EXCEPTION 'Перед импортом укажите происхождение геометрии';
    END IF;
    UPDATE atlas.track_layouts SET
        centerline = public.ST_Force3D(public.ST_SetSRID(
            public.ST_GeomFromGeoJSON(p_geometry::text), 4326)),
        direction = p_direction, review_status = 'candidate', verified_at = NULL,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'adminGeometryImport', jsonb_build_object(
                'importedAt', now(),
                'measuredLengthM', v_preview->'measuredLengthM',
                'pointCount', v_preview->'pointCount',
                'maximumDistanceM', v_preview->'maximumDistanceM',
                'lengthDeviationPercent', v_preview->'lengthDeviationPercent',
                'warnings', v_preview->'warnings')),
        updated_at = now()
    WHERE id = p_layout_id AND circuit_id = p_circuit_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Конфигурация не найдена'; END IF;
    RETURN jsonb_build_object('circuitId', p_circuit_id, 'layoutId', p_layout_id,
        'preview', v_preview, 'publicDataSynced', false);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_inspect_track_geometry(text, text, jsonb, text, boolean)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION atlas.admin_import_track_geometry(text, text, jsonb, text, boolean)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_inspect_track_geometry(text, text, jsonb, text, boolean)
    TO service_role;
GRANT EXECUTE ON FUNCTION atlas.admin_import_track_geometry(text, text, jsonb, text, boolean)
    TO service_role;

COMMIT;
