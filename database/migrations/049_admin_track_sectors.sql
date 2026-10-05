BEGIN;

CREATE OR REPLACE FUNCTION atlas.admin_create_track_sectors(
    p_circuit_id text, p_layout_id text, p_input jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_boundaries jsonb := p_input->'boundaries';
    v_point jsonb;
    v_coordinates double precision[] := ARRAY[]::double precision[];
    v_from integer := nullif(p_input->>'validFromYear', '')::integer;
    v_to integer := nullif(p_input->>'validToYear', '')::integer;
    v_source_url text := nullif(btrim(p_input->>'sourceUrl'), '');
    v_source_name text := nullif(btrim(p_input->>'sourceName'), '');
    v_source_notes text := nullif(btrim(p_input->>'sourceNotes'), '');
    v_source_id text;
    v_segment record;
    v_sector jsonb;
    v_period_key text;
    v_index integer;
BEGIN
    IF p_circuit_id IS NULL OR p_circuit_id !~ '^[A-Za-z0-9_-]+$'
       OR p_layout_id IS NULL OR p_layout_id !~ '^[A-Za-z0-9_-]+$'
       OR v_boundaries IS NULL OR jsonb_typeof(v_boundaries) <> 'array'
       OR jsonb_array_length(v_boundaries) <> 3
       OR (v_from IS NOT NULL AND v_from NOT BETWEEN 1900 AND 2100)
       OR (v_to IS NOT NULL AND v_to NOT BETWEEN 1900 AND 2100)
       OR (v_from IS NOT NULL AND v_to IS NOT NULL AND v_to < v_from)
       OR v_source_url IS NULL OR v_source_url !~ '^https?://[^/?#@]+([/?#]|$)'
       OR length(v_source_url) > 2000 OR v_source_name IS NULL THEN
        RAISE EXCEPTION 'Некорректные границы секторов или источник';
    END IF;
    FOR v_point IN SELECT value FROM jsonb_array_elements(v_boundaries) LOOP
        IF jsonb_typeof(v_point) <> 'array' OR jsonb_array_length(v_point) <> 2
           OR jsonb_typeof(v_point->0) <> 'number'
           OR jsonb_typeof(v_point->1) <> 'number'
           OR (v_point->>0)::double precision NOT BETWEEN -180 AND 180
           OR (v_point->>1)::double precision NOT BETWEEN -90 AND 90 THEN
            RAISE EXCEPTION 'Укажите старт и две границы секторов на оси трассы';
        END IF;
        v_coordinates := array_append(v_coordinates, (v_point->>0)::double precision);
        v_coordinates := array_append(v_coordinates, (v_point->>1)::double precision);
    END LOOP;
    PERFORM pg_advisory_xact_lock(hashtext('track-sectors:' || p_layout_id));
    PERFORM 1 FROM atlas.track_layouts WHERE id = p_layout_id
        AND circuit_id = p_circuit_id AND centerline IS NOT NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Конфигурация не найдена или не имеет контура'; END IF;
    WITH line AS (
        SELECT public.ST_Force2D(centerline) AS original
        FROM atlas.track_layouts WHERE id = p_layout_id
    ), anchors AS (
        SELECT original,
            public.ST_SetSRID(public.ST_MakePoint(v_coordinates[1], v_coordinates[2]), 4326) AS start_point,
            public.ST_SetSRID(public.ST_MakePoint(v_coordinates[3], v_coordinates[4]), 4326) AS a,
            public.ST_SetSRID(public.ST_MakePoint(v_coordinates[5], v_coordinates[6]), 4326) AS b
        FROM line
    ), start_location AS (
        SELECT original, start_point, a, b,
            public.ST_LineLocatePoint(original, start_point) AS start_fraction,
            public.ST_Distance(start_point::public.geography,
                public.ST_ClosestPoint(original, start_point)::public.geography) AS start_distance
        FROM anchors
    ), rotated AS (
        SELECT CASE WHEN start_fraction < 0.000001 OR start_fraction > 0.999999
            THEN original ELSE public.ST_MakeLine(
                public.ST_LineSubstring(original, start_fraction, 1),
                public.ST_LineSubstring(original, 0, start_fraction)) END AS g,
            start_distance, a, b FROM start_location
    ), located AS (
        SELECT g, public.ST_IsClosed(g) AS closed, start_distance,
            public.ST_LineLocatePoint(g, a) AS f1,
            public.ST_LineLocatePoint(g, b) AS f2,
            public.ST_Distance(a::public.geography,
                public.ST_ClosestPoint(g, a)::public.geography) AS d1,
            public.ST_Distance(b::public.geography,
                public.ST_ClosestPoint(g, b)::public.geography) AS d2
        FROM rotated
    )
    SELECT closed, start_distance, f1, f2, d1, d2,
        public.ST_AsGeoJSON(public.ST_LineSubstring(g, 0, f1))::jsonb AS s1,
        public.ST_AsGeoJSON(public.ST_LineSubstring(g, f1, f2))::jsonb AS s2,
        public.ST_AsGeoJSON(public.ST_LineSubstring(g, f2, 1))::jsonb AS s3
    INTO v_segment FROM located;
    IF NOT coalesce(v_segment.closed, false)
       OR v_segment.start_distance > 50 OR v_segment.d1 > 50 OR v_segment.d2 > 50 THEN
        RAISE EXCEPTION 'Старт и границы должны быть рядом с замкнутой осью трассы';
    END IF;
    IF v_segment.f1 IS NULL OR v_segment.f2 IS NULL
       OR v_segment.f1 <= 0.001 OR v_segment.f2 >= 0.999
       OR v_segment.f2 - v_segment.f1 <= 0.001 OR v_segment.f1 >= v_segment.f2 THEN
        RAISE EXCEPTION 'Границы должны делить круг на три ненулевых сектора по направлению оси';
    END IF;
    IF EXISTS (SELECT 1 FROM (VALUES (v_segment.s1), (v_segment.s2), (v_segment.s3)) AS part(geometry)
        WHERE part.geometry->>'type' <> 'LineString'
           OR jsonb_array_length(part.geometry->'coordinates') < 2) THEN
        RAISE EXCEPTION 'Не удалось построить три полных сектора';
    END IF;
    IF EXISTS (SELECT 1 FROM atlas.track_layout_annotations
        WHERE layout_id = p_layout_id AND annotation_type = 'sector'
          AND review_status <> 'hidden'
          AND coalesce(valid_from_year, 1900) <= coalesce(v_to, 2100)
          AND coalesce(valid_to_year, 2100) >= coalesce(v_from, 1900)) THEN
        RAISE EXCEPTION 'Для этого периода уже есть сектора';
    END IF;
    v_source_id := 'track-markup-' || left(encode(sha256(convert_to(v_source_url, 'UTF8')), 'hex'), 16);
    INSERT INTO atlas.data_sources(id, name, url, retrieved_at, notes)
    VALUES (v_source_id, v_source_name, v_source_url, now(), v_source_notes)
    ON CONFLICT(id) DO UPDATE SET
        name = CASE WHEN p_input ? 'sourceName' THEN EXCLUDED.name ELSE atlas.data_sources.name END,
        url = EXCLUDED.url, retrieved_at = EXCLUDED.retrieved_at,
        notes = CASE WHEN p_input ? 'sourceNotes' THEN EXCLUDED.notes ELSE atlas.data_sources.notes END;
    v_period_key := coalesce(v_from::text, 'all') || '-' || coalesce(v_to::text, 'all')
        || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
    FOR v_index IN 1..3 LOOP
        v_sector := CASE v_index WHEN 1 THEN v_segment.s1
            WHEN 2 THEN v_segment.s2 ELSE v_segment.s3 END;
        INSERT INTO atlas.track_layout_annotations
            (id, layout_id, annotation_type, label_ru, sequence, geometry,
             valid_from_year, valid_to_year, source_id, review_status, properties)
        VALUES (p_layout_id || '-sector-' || v_period_key || '-' || v_index,
            p_layout_id, 'sector', 'Сектор ' || v_index, v_index,
            public.ST_SetSRID(public.ST_GeomFromGeoJSON(v_sector::text), 4326)::public.geography,
            v_from, v_to, v_source_id, 'candidate',
            jsonb_build_object('digitizedVia', 'admin-sector-tool-v1',
                'boundaryFractions', jsonb_build_array(v_segment.f1, v_segment.f2)));
    END LOOP;
    RETURN jsonb_build_object('circuitId', p_circuit_id, 'layoutId', p_layout_id,
        'created', 3);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_create_track_sectors(text, text, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_create_track_sectors(text, text, jsonb)
    TO service_role;

COMMIT;
