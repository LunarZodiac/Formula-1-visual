BEGIN;

CREATE OR REPLACE VIEW atlas.admin_track_annotation_layouts
WITH (security_invoker = true)
AS
SELECT layout.id, layout.circuit_id, layout.name,
       layout.valid_from_year, layout.valid_to_year,
       public.ST_AsGeoJSON(public.ST_Force2D(layout.centerline)) AS centerline_geojson,
       coalesce(profile.name_ru, circuit.short_name, circuit.name) AS circuit_name
FROM atlas.track_layouts AS layout
JOIN atlas.circuits AS circuit ON circuit.id = layout.circuit_id
LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id;

CREATE OR REPLACE VIEW atlas.admin_track_annotation_items
WITH (security_invoker = true)
AS
SELECT annotation.id, annotation.layout_id, annotation.annotation_type,
       annotation.label_ru, annotation.label_original, annotation.sequence,
       annotation.description_ru,
       public.ST_AsGeoJSON(annotation.geometry::public.geometry) AS geometry_geojson,
       annotation.valid_from_year, annotation.valid_to_year,
       annotation.review_status, annotation.verified_at,
       annotation.updated_at::text AS revision,
       annotation.properties->'calloutPoint' AS callout_point,
       source.name AS source_name, source.url AS source_url,
       source.notes AS source_notes
FROM atlas.track_layout_annotations AS annotation
LEFT JOIN atlas.data_sources AS source ON source.id = annotation.source_id;

REVOKE ALL ON atlas.admin_track_annotation_layouts, atlas.admin_track_annotation_items
    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON atlas.admin_track_annotation_layouts, atlas.admin_track_annotation_items
    TO service_role;

CREATE OR REPLACE FUNCTION atlas.admin_save_track_annotation(
    p_circuit_id text, p_layout_id text, p_annotation_id text, p_input jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_type text := p_input->>'annotationType';
    v_status text := coalesce(p_input->>'reviewStatus', 'candidate');
    v_label_ru text := nullif(btrim(p_input->>'labelRu'), '');
    v_label_original text := nullif(btrim(p_input->>'labelOriginal'), '');
    v_sequence integer := nullif(p_input->>'sequence', '')::integer;
    v_description text := nullif(btrim(p_input->>'descriptionRu'), '');
    v_from integer := nullif(p_input->>'validFromYear', '')::integer;
    v_to integer := nullif(p_input->>'validToYear', '')::integer;
    v_geometry_json jsonb := p_input->'geometryGeoJson';
    v_geometry public.geometry;
    v_callout jsonb := p_input->'calloutPoint';
    v_source_url text := nullif(btrim(p_input->>'sourceUrl'), '');
    v_source_name text := nullif(btrim(p_input->>'sourceName'), '');
    v_source_notes text := nullif(btrim(p_input->>'sourceNotes'), '');
    v_verified boolean := coalesce((p_input->>'sourceVerified')::boolean, false);
    v_source_id text;
    v_centerline public.geometry;
    v_existing record;
    v_distance integer;
    v_properties jsonb;
    v_public_affected boolean;
BEGIN
    IF p_circuit_id IS NULL OR p_circuit_id !~ '^[A-Za-z0-9_-]+$'
       OR p_layout_id IS NULL OR p_layout_id !~ '^[A-Za-z0-9_-]+$'
       OR p_annotation_id IS NULL OR p_annotation_id !~ '^[A-Za-z0-9_-]+$'
       OR v_type IS NULL OR v_type NOT IN ('sector', 'turn', 'straight',
           'timing_line', 'drs_zone', 'drs_detection', 'straight_mode_zone',
           'straight_mode_activation', 'straight_mode_low_grip_activation',
           'overtake_detection', 'overtake_activation')
       OR v_status IS NULL OR v_status NOT IN ('candidate', 'reviewed', 'published', 'hidden')
       OR (v_label_ru IS NULL AND v_label_original IS NULL AND v_sequence IS NULL)
       OR (v_sequence IS NOT NULL AND v_sequence NOT BETWEEN 1 AND 999)
       OR (v_from IS NOT NULL AND v_from NOT BETWEEN 1900 AND 2100)
       OR (v_to IS NOT NULL AND v_to NOT BETWEEN 1900 AND 2100)
       OR (v_from IS NOT NULL AND v_to IS NOT NULL AND v_to < v_from)
       OR (v_type IN ('straight_mode_zone', 'straight_mode_activation',
           'straight_mode_low_grip_activation', 'overtake_detection', 'overtake_activation')
           AND coalesce(v_from, 0) < 2026)
       OR v_source_url IS NULL OR v_source_url !~ '^https?://[^/?#@]+([/?#]|$)'
       OR length(v_source_url) > 2000 OR v_source_name IS NULL
       OR (v_status IN ('reviewed', 'published') AND NOT v_verified) THEN
        RAISE EXCEPTION 'Некорректная разметка или источник';
    END IF;
    IF v_geometry_json IS NULL OR v_geometry_json->>'type' IS NULL THEN
        RAISE EXCEPTION 'Укажите геометрию разметки';
    END IF;
    v_geometry := public.ST_SetSRID(public.ST_GeomFromGeoJSON(v_geometry_json::text), 4326);
    IF (v_type IN ('turn', 'timing_line', 'drs_detection', 'straight_mode_activation',
         'straight_mode_low_grip_activation', 'overtake_detection', 'overtake_activation')
         AND public.ST_GeometryType(v_geometry) <> 'ST_Point')
       OR (v_type IN ('sector', 'straight', 'drs_zone', 'straight_mode_zone')
         AND (public.ST_GeometryType(v_geometry) <> 'ST_LineString'
           OR public.ST_NPoints(v_geometry) NOT BETWEEN 2 AND 10000)) THEN
        RAISE EXCEPTION 'Геометрия не соответствует типу разметки';
    END IF;
    IF EXISTS (SELECT 1 FROM public.ST_DumpPoints(v_geometry) AS point
        WHERE public.ST_X(point.geom) NOT BETWEEN -180 AND 180
           OR public.ST_Y(point.geom) NOT BETWEEN -90 AND 90) THEN
        RAISE EXCEPTION 'Координаты разметки выходят за допустимые границы';
    END IF;
    SELECT centerline INTO v_centerline FROM atlas.track_layouts
    WHERE id = p_layout_id AND circuit_id = p_circuit_id FOR SHARE;
    IF NOT FOUND OR v_centerline IS NULL THEN
        RAISE EXCEPTION 'Сначала загрузите контур конфигурации';
    END IF;
    SELECT round(max(public.ST_Distance(point.geom::public.geography,
        public.ST_Force2D(v_centerline)::public.geography)))::integer
    INTO v_distance FROM public.ST_DumpPoints(v_geometry) AS point;
    IF v_distance IS NULL OR v_distance > 2000 THEN
        RAISE EXCEPTION 'Разметка удалена от контура более чем на 2 км';
    END IF;
    IF v_callout IS NOT NULL AND v_callout <> 'null'::jsonb THEN
        IF v_type NOT IN ('turn', 'straight')
           OR jsonb_typeof(v_callout) <> 'array' OR jsonb_array_length(v_callout) <> 2
           OR (v_callout->>0)::double precision NOT BETWEEN -180 AND 180
           OR (v_callout->>1)::double precision NOT BETWEEN -90 AND 90
           OR public.ST_Distance(public.ST_SetSRID(public.ST_MakePoint(
                (v_callout->>0)::double precision,
                (v_callout->>1)::double precision), 4326)::public.geography,
                v_geometry::public.geography) > 1000 THEN
            RAISE EXCEPTION 'Выносная подпись дальше 1 км от элемента';
        END IF;
    ELSE
        v_callout := NULL;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('track-annotation:' || p_annotation_id));
    SELECT layout_id, annotation_type, review_status, updated_at::text AS revision
    INTO v_existing FROM atlas.track_layout_annotations
    WHERE id = p_annotation_id FOR UPDATE;
    IF FOUND THEN
        IF v_existing.layout_id <> p_layout_id THEN
            RAISE EXCEPTION 'ID разметки принадлежит другой конфигурации';
        END IF;
        IF v_existing.revision IS DISTINCT FROM p_input->>'revision' THEN
            RAISE EXCEPTION 'Разметка уже изменена. Обновите страницу';
        END IF;
    ELSIF nullif(p_input->>'revision', '') IS NOT NULL THEN
        RAISE EXCEPTION 'Разметка уже удалена. Обновите страницу';
    END IF;
    IF p_annotation_id = p_layout_id || '-start-finish'
       AND (v_type <> 'timing_line'
         OR (v_existing IS NOT NULL AND v_existing.annotation_type <> 'timing_line')) THEN
        RAISE EXCEPTION 'ID старта/финиша занят другим типом разметки';
    END IF;
    v_public_affected := v_status = 'published'
        OR coalesce(v_existing.review_status = 'published', false);
    v_source_id := 'track-markup-' || left(encode(sha256(convert_to(v_source_url, 'UTF8')), 'hex'), 16);
    INSERT INTO atlas.data_sources(id, name, url, retrieved_at, notes)
    VALUES (v_source_id, v_source_name, v_source_url, now(), v_source_notes)
    ON CONFLICT(id) DO UPDATE SET
        name = EXCLUDED.name, url = EXCLUDED.url, retrieved_at = EXCLUDED.retrieved_at,
        notes = CASE WHEN p_input ? 'sourceNotes' THEN EXCLUDED.notes ELSE atlas.data_sources.notes END;
    v_properties := jsonb_build_object('maximumDistanceToTrackM', v_distance,
        'editedVia', 'admin-track-markup-v2');
    IF v_callout IS NOT NULL THEN
        v_properties := v_properties || jsonb_build_object('calloutPoint', v_callout);
    END IF;
    INSERT INTO atlas.track_layout_annotations
        (id, layout_id, annotation_type, label_ru, label_original, sequence,
         description_ru, geometry, valid_from_year, valid_to_year,
         source_id, review_status, properties, verified_at, updated_at)
    VALUES (p_annotation_id, p_layout_id, v_type, v_label_ru, v_label_original,
        v_sequence, v_description, v_geometry::public.geography, v_from, v_to,
        v_source_id, v_status, v_properties,
        CASE WHEN v_status IN ('reviewed', 'published') THEN now() ELSE NULL END,
        now())
    ON CONFLICT(id) DO UPDATE SET
        annotation_type = EXCLUDED.annotation_type, label_ru = EXCLUDED.label_ru,
        label_original = EXCLUDED.label_original, sequence = EXCLUDED.sequence,
        description_ru = EXCLUDED.description_ru, geometry = EXCLUDED.geometry,
        valid_from_year = EXCLUDED.valid_from_year,
        valid_to_year = EXCLUDED.valid_to_year, source_id = EXCLUDED.source_id,
        review_status = EXCLUDED.review_status, properties = EXCLUDED.properties,
        verified_at = EXCLUDED.verified_at, updated_at = EXCLUDED.updated_at
    WHERE p_input->>'revision' IS NOT NULL
      AND atlas.track_layout_annotations.updated_at::text = p_input->>'revision';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Разметка уже изменена. Обновите страницу';
    END IF;
    RETURN jsonb_build_object('id', p_annotation_id, 'circuitId', p_circuit_id,
        'layoutId', p_layout_id,
        'publicDataSynced', NOT (v_public_affected AND p_circuit_id IN ('spa', 'bahrain')));
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_delete_track_annotation(
    p_circuit_id text, p_layout_id text, p_annotation_id text, p_revision text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_status text;
BEGIN
    IF p_revision IS NULL OR p_revision = '' THEN
        RAISE EXCEPTION 'Обновите страницу перед удалением разметки';
    END IF;
    DELETE FROM atlas.track_layout_annotations AS annotation
    USING atlas.track_layouts AS layout
    WHERE annotation.id = p_annotation_id AND annotation.layout_id = p_layout_id
      AND layout.id = annotation.layout_id AND layout.circuit_id = p_circuit_id
      AND annotation.updated_at::text = p_revision
    RETURNING annotation.review_status INTO v_status;
    IF NOT FOUND THEN
        IF EXISTS (SELECT 1 FROM atlas.track_layout_annotations
            WHERE id = p_annotation_id AND layout_id = p_layout_id) THEN
            RAISE EXCEPTION 'Разметка уже изменена. Обновите страницу';
        END IF;
        RETURN NULL;
    END IF;
    RETURN jsonb_build_object('id', p_annotation_id, 'circuitId', p_circuit_id,
        'layoutId', p_layout_id,
        'publicDataSynced', NOT (v_status = 'published'
            AND p_circuit_id IN ('spa', 'bahrain')));
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_save_track_annotation(text, text, text, jsonb)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION atlas.admin_delete_track_annotation(text, text, text, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_save_track_annotation(text, text, text, jsonb)
    TO service_role;
GRANT EXECUTE ON FUNCTION atlas.admin_delete_track_annotation(text, text, text, text)
    TO service_role;

COMMIT;
