BEGIN;

CREATE TABLE atlas.admin_track_annotation_import_previews (
    token uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    package_data jsonb NOT NULL,
    preview jsonb NOT NULL
);

REVOKE ALL ON atlas.admin_track_annotation_import_previews
    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON atlas.admin_track_annotation_import_previews
    TO service_role;

CREATE OR REPLACE FUNCTION atlas.admin_create_track_annotation_preview(p_package jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_circuit_id text := p_package->>'circuitId';
    v_layout_id text := p_package->>'layoutId';
    v_source_url text := p_package->>'sourceUrl';
    v_source_name text := p_package->>'sourceName';
    v_layout record;
    v_feature jsonb;
    v_properties jsonb;
    v_geometry public.geometry;
    v_type text;
    v_id text;
    v_seen text[] := ARRAY[]::text[];
    v_count integer;
    v_distance integer;
    v_callout jsonb;
    v_from integer;
    v_to integer;
    v_sequence integer;
    v_by_type jsonb := '{}'::jsonb;
    v_features jsonb := '[]'::jsonb;
    v_token uuid := gen_random_uuid();
    v_expires timestamptz := now() + interval '20 minutes';
    v_preview jsonb;
BEGIN
    v_count := jsonb_array_length(coalesce(p_package->'features', '[]'::jsonb));
    IF p_package->>'type' <> 'FeatureCollection'
       OR v_count NOT BETWEEN 1 AND 1000
       OR v_circuit_id IS NULL OR v_circuit_id !~ '^[A-Za-z0-9_-]+$'
       OR v_layout_id IS NULL OR v_layout_id !~ '^[A-Za-z0-9_-]+$'
       OR v_source_url IS NULL OR v_source_url !~ '^https?://[^/?#@]+([/?#]|$)'
       OR length(v_source_url) > 2000
       OR v_source_name IS NULL OR btrim(v_source_name) = '' THEN
        RAISE EXCEPTION 'Некорректный пакет разметки';
    END IF;
    SELECT layout.id, layout.name, circuit.id AS circuit_id,
           coalesce(profile.name_ru, circuit.short_name, circuit.name) AS circuit_name,
           layout.centerline
    INTO v_layout
    FROM atlas.track_layouts AS layout
    JOIN atlas.circuits AS circuit ON circuit.id = layout.circuit_id
    LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id
    WHERE layout.id = v_layout_id AND circuit.id = v_circuit_id
      AND layout.centerline IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Конфигурация не найдена или не имеет контура'; END IF;
    FOR v_feature IN SELECT value FROM jsonb_array_elements(p_package->'features') LOOP
        v_properties := v_feature->'properties';
        v_id := v_properties->>'id';
        v_type := v_properties->>'annotationType';
        v_sequence := nullif(v_properties->>'sequence', '')::integer;
        v_from := nullif(v_properties->>'validFromYear', '')::integer;
        v_to := nullif(v_properties->>'validToYear', '')::integer;
        v_callout := v_properties->'calloutPoint';
        IF v_feature->>'type' <> 'Feature' OR v_id IS NULL
           OR v_id !~ '^[A-Za-z0-9_-]+$' OR v_id = ANY(v_seen)
           OR v_type IS NULL OR v_type NOT IN ('sector', 'turn', 'straight',
               'timing_line', 'drs_zone', 'drs_detection', 'straight_mode_zone',
               'straight_mode_activation', 'straight_mode_low_grip_activation',
               'overtake_detection', 'overtake_activation')
           OR (nullif(v_properties->>'labelRu', '') IS NULL
               AND nullif(v_properties->>'labelOriginal', '') IS NULL
               AND v_sequence IS NULL)
           OR (v_sequence IS NOT NULL AND v_sequence NOT BETWEEN 1 AND 32767)
           OR (v_from IS NOT NULL AND v_from NOT BETWEEN 1900 AND 2100)
           OR (v_to IS NOT NULL AND v_to NOT BETWEEN 1900 AND 2100)
           OR (v_from IS NOT NULL AND v_to IS NOT NULL AND v_to < v_from)
           OR (v_type IN ('straight_mode_zone', 'straight_mode_activation',
               'straight_mode_low_grip_activation', 'overtake_detection', 'overtake_activation')
               AND coalesce(v_from, 0) < 2026) THEN
            RAISE EXCEPTION 'Некорректный элемент разметки в пакете';
        END IF;
        v_seen := array_append(v_seen, v_id);
        v_geometry := public.ST_SetSRID(
            public.ST_GeomFromGeoJSON((v_feature->'geometry')::text), 4326);
        IF (v_type IN ('turn', 'timing_line', 'drs_detection', 'straight_mode_activation',
             'straight_mode_low_grip_activation', 'overtake_detection', 'overtake_activation')
             AND public.ST_GeometryType(v_geometry) <> 'ST_Point')
           OR (v_type IN ('sector', 'straight', 'drs_zone', 'straight_mode_zone')
             AND (public.ST_GeometryType(v_geometry) <> 'ST_LineString'
               OR public.ST_NPoints(v_geometry) NOT BETWEEN 2 AND 10000))
           OR EXISTS (SELECT 1 FROM public.ST_DumpPoints(v_geometry) AS point
               WHERE public.ST_X(point.geom) NOT BETWEEN -180 AND 180
                  OR public.ST_Y(point.geom) NOT BETWEEN -90 AND 90) THEN
            RAISE EXCEPTION 'Некорректная геометрия элемента %', v_id;
        END IF;
        SELECT round(max(public.ST_Distance(point.geom::public.geography,
            public.ST_Force2D(v_layout.centerline)::public.geography)))::integer
        INTO v_distance FROM public.ST_DumpPoints(v_geometry) AS point;
        IF v_distance IS NULL OR v_distance > 2000 THEN
            RAISE EXCEPTION 'Элемент % удалён от контура более чем на 2 км', v_id;
        END IF;
        IF v_callout IS NOT NULL AND v_callout <> 'null'::jsonb THEN
            IF v_type NOT IN ('turn', 'straight')
               OR jsonb_typeof(v_callout) <> 'array'
               OR jsonb_array_length(v_callout) < 2
               OR (v_callout->>0)::double precision NOT BETWEEN -180 AND 180
               OR (v_callout->>1)::double precision NOT BETWEEN -90 AND 90
               OR public.ST_Distance(public.ST_SetSRID(public.ST_MakePoint(
                    (v_callout->>0)::double precision,
                    (v_callout->>1)::double precision), 4326)::public.geography,
                    v_geometry::public.geography) > 1000 THEN
                RAISE EXCEPTION 'Выносная подпись элемента % дальше 1 км', v_id;
            END IF;
        END IF;
        v_by_type := jsonb_set(v_by_type, ARRAY[v_type],
            to_jsonb(coalesce((v_by_type->>v_type)::integer, 0) + 1));
        v_features := v_features || jsonb_build_array(jsonb_build_object(
            'id', v_id, 'annotationType', v_type,
            'label', coalesce(v_properties->>'labelRu', v_properties->>'labelOriginal'),
            'sequence', v_sequence, 'validFromYear', v_from, 'validToYear', v_to,
            'maximumDistanceToTrackM', v_distance, 'geometry', v_feature->'geometry'));
    END LOOP;
    v_preview := jsonb_build_object(
        'token', v_token, 'expiresAt', extract(epoch FROM v_expires) * 1000,
        'circuit', jsonb_build_object('id', v_circuit_id, 'name', v_layout.circuit_name),
        'layout', jsonb_build_object('id', v_layout_id, 'name', v_layout.name),
        'summary', jsonb_build_object('circuitId', v_circuit_id,
            'layoutId', v_layout_id, 'features', v_count, 'byType', v_by_type),
        'features', v_features);
    DELETE FROM atlas.admin_track_annotation_import_previews WHERE expires_at <= now();
    DELETE FROM atlas.admin_track_annotation_import_previews
    WHERE token IN (SELECT token FROM atlas.admin_track_annotation_import_previews
        ORDER BY created_at DESC, token DESC OFFSET 19);
    INSERT INTO atlas.admin_track_annotation_import_previews
        (token, expires_at, package_data, preview)
    VALUES (v_token, v_expires, p_package, v_preview);
    RETURN v_preview;
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_get_track_annotation_preview(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT preview FROM atlas.admin_track_annotation_import_previews
    WHERE token = p_token::uuid AND expires_at > now()
$$;

CREATE OR REPLACE FUNCTION atlas.admin_apply_track_annotation_preview(
    p_token text, p_expected_circuit_id text, p_expected_layout_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_package jsonb;
    v_circuit_id text;
    v_layout_id text;
    v_source_url text;
    v_source_id text;
    v_centerline public.geometry;
    v_feature jsonb;
    v_properties jsonb;
    v_geometry public.geometry;
    v_existing record;
    v_distance integer;
    v_callout jsonb;
    v_imported integer := 0;
BEGIN
    SELECT package_data INTO v_package
    FROM atlas.admin_track_annotation_import_previews
    WHERE token = p_token::uuid AND expires_at > now() FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_circuit_id := v_package->>'circuitId';
    v_layout_id := v_package->>'layoutId';
    v_source_url := v_package->>'sourceUrl';
    IF v_circuit_id IS DISTINCT FROM p_expected_circuit_id
       OR v_layout_id IS DISTINCT FROM p_expected_layout_id THEN
        RAISE EXCEPTION 'Предпросмотр относится к другой конфигурации';
    END IF;
    SELECT centerline INTO v_centerline FROM atlas.track_layouts
    WHERE id = v_layout_id AND circuit_id = v_circuit_id
      AND centerline IS NOT NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Конфигурация или контур изменились'; END IF;
    v_source_id := 'track-annotations-'
        || left(encode(sha256(convert_to(v_source_url, 'UTF8')), 'hex'), 16);
    INSERT INTO atlas.data_sources(id, name, url, retrieved_at, notes)
    VALUES (v_source_id, v_package->>'sourceName', v_source_url, now(),
        'Пакетный импорт разметки трассы')
    ON CONFLICT(id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url,
        retrieved_at = EXCLUDED.retrieved_at;
    FOR v_feature IN SELECT value FROM jsonb_array_elements(v_package->'features') LOOP
        v_properties := v_feature->'properties';
        PERFORM pg_advisory_xact_lock(hashtext(
            'track-annotation:' || (v_properties->>'id')));
        SELECT layout_id, review_status INTO v_existing
        FROM atlas.track_layout_annotations WHERE id = v_properties->>'id' FOR UPDATE;
        IF FOUND AND coalesce((v_package->>'preserveExisting')::boolean, false) THEN
            CONTINUE;
        END IF;
        IF v_existing IS NOT NULL AND v_existing.layout_id <> v_layout_id THEN
            RAISE EXCEPTION 'ID элемента % принадлежит другой конфигурации', v_properties->>'id';
        END IF;
        IF v_existing IS NOT NULL AND v_existing.review_status <> 'candidate' THEN
            RAISE EXCEPTION 'Пакет не может заменить проверенный элемент %', v_properties->>'id';
        END IF;
        v_geometry := public.ST_SetSRID(
            public.ST_GeomFromGeoJSON((v_feature->'geometry')::text), 4326);
        SELECT round(max(public.ST_Distance(point.geom::public.geography,
            public.ST_Force2D(v_centerline)::public.geography)))::integer
        INTO v_distance FROM public.ST_DumpPoints(v_geometry) AS point;
        IF v_distance IS NULL OR v_distance > 2000 THEN
            RAISE EXCEPTION 'Элемент % удалён от контура более чем на 2 км', v_properties->>'id';
        END IF;
        v_callout := v_properties->'calloutPoint';
        IF v_callout IS NOT NULL AND v_callout <> 'null'::jsonb
           AND public.ST_Distance(public.ST_SetSRID(public.ST_MakePoint(
                (v_callout->>0)::double precision,
                (v_callout->>1)::double precision), 4326)::public.geography,
                v_geometry::public.geography) > 1000 THEN
            RAISE EXCEPTION 'Выносная подпись элемента % дальше 1 км', v_properties->>'id';
        END IF;
        INSERT INTO atlas.track_layout_annotations
            (id, layout_id, annotation_type, label_ru, label_original, sequence,
             description_ru, geometry, valid_from_year, valid_to_year,
             source_id, review_status, properties)
        VALUES (v_properties->>'id', v_layout_id, v_properties->>'annotationType',
            nullif(v_properties->>'labelRu', ''), nullif(v_properties->>'labelOriginal', ''),
            nullif(v_properties->>'sequence', '')::integer,
            nullif(v_properties->>'descriptionRu', ''), v_geometry::public.geography,
            nullif(v_properties->>'validFromYear', '')::integer,
            nullif(v_properties->>'validToYear', '')::integer,
            v_source_id, 'candidate',
            CASE WHEN v_callout IS NOT NULL AND v_callout <> 'null'::jsonb
                THEN jsonb_build_object('calloutPoint', v_callout,
                    'importedVia', 'candidate-package')
                ELSE jsonb_build_object('importedVia', 'candidate-package') END)
        ON CONFLICT(id) DO UPDATE SET
            layout_id = EXCLUDED.layout_id,
            annotation_type = EXCLUDED.annotation_type,
            label_ru = EXCLUDED.label_ru,
            label_original = EXCLUDED.label_original,
            sequence = EXCLUDED.sequence,
            description_ru = EXCLUDED.description_ru,
            geometry = EXCLUDED.geometry,
            valid_from_year = EXCLUDED.valid_from_year,
            valid_to_year = EXCLUDED.valid_to_year,
            source_id = EXCLUDED.source_id,
            review_status = 'candidate',
            properties = EXCLUDED.properties,
            updated_at = now()
        WHERE atlas.track_layout_annotations.layout_id = v_layout_id
          AND atlas.track_layout_annotations.review_status = 'candidate'
          AND NOT coalesce((v_package->>'preserveExisting')::boolean, false);
        IF NOT FOUND THEN
            IF coalesce((v_package->>'preserveExisting')::boolean, false) THEN
                CONTINUE;
            END IF;
            RAISE EXCEPTION 'Элемент % изменился во время импорта', v_properties->>'id';
        END IF;
        v_imported := v_imported + 1;
    END LOOP;
    DELETE FROM atlas.admin_track_annotation_import_previews
    WHERE token = p_token::uuid;
    RETURN jsonb_build_object('imported', v_imported,
        'circuitId', v_circuit_id, 'layoutId', v_layout_id);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_create_track_annotation_preview(jsonb)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION atlas.admin_get_track_annotation_preview(text)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION atlas.admin_apply_track_annotation_preview(text, text, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_create_track_annotation_preview(jsonb)
    TO service_role;
GRANT EXECUTE ON FUNCTION atlas.admin_get_track_annotation_preview(text)
    TO service_role;
GRANT EXECUTE ON FUNCTION atlas.admin_apply_track_annotation_preview(text, text, text)
    TO service_role;

COMMIT;
