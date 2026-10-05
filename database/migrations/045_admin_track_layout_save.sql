BEGIN;

CREATE OR REPLACE FUNCTION atlas.admin_save_track_layout(p_input jsonb, p_create boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_id text := p_input->>'id';
    v_circuit_id text := p_input->>'circuitId';
    v_name text := nullif(btrim(p_input->>'name'), '');
    v_from integer := nullif(p_input->>'validFromYear', '')::integer;
    v_to integer := nullif(p_input->>'validToYear', '')::integer;
    v_length integer := nullif(p_input->>'lengthM', '')::integer;
    v_turns integer := nullif(p_input->>'turns', '')::integer;
    v_direction text := nullif(p_input->>'direction', '');
    v_elevation_min numeric := nullif(p_input->>'elevationMinM', '')::numeric;
    v_elevation_max numeric := nullif(p_input->>'elevationMaxM', '')::numeric;
    v_provenance text := p_input->>'provenanceType';
    v_status text := p_input->>'reviewStatus';
    v_source_url text := nullif(btrim(p_input->>'sourceUrl'), '');
    v_source_name text := nullif(btrim(p_input->>'sourceName'), '');
    v_source_notes text := nullif(btrim(p_input->>'sourceNotes'), '');
    v_verified boolean := coalesce((p_input->>'sourceVerified')::boolean, false);
    v_source_id text;
    v_existing record;
BEGIN
    IF p_create IS NULL OR v_id IS NULL OR v_id !~ '^[A-Za-z0-9_-]+$'
       OR v_circuit_id IS NULL OR v_circuit_id !~ '^[A-Za-z0-9_-]+$'
       OR v_name IS NULL
       OR (v_from IS NOT NULL AND v_from NOT BETWEEN 1950 AND 2100)
       OR (v_to IS NOT NULL AND v_to NOT BETWEEN 1950 AND 2100)
       OR (v_from IS NOT NULL AND v_to IS NOT NULL AND v_to < v_from)
       OR (v_length IS NOT NULL AND v_length NOT BETWEEN 1 AND 100000)
       OR (v_turns IS NOT NULL AND v_turns NOT BETWEEN 1 AND 200)
       OR (v_direction IS NOT NULL AND v_direction NOT IN ('clockwise', 'counterclockwise'))
       OR (v_elevation_min IS NOT NULL AND v_elevation_min NOT BETWEEN -500 AND 6000)
       OR (v_elevation_max IS NOT NULL AND v_elevation_max NOT BETWEEN -500 AND 6000)
       OR (v_elevation_min IS NOT NULL AND v_elevation_max IS NOT NULL
           AND v_elevation_max < v_elevation_min)
       OR v_provenance IS NULL OR v_provenance NOT IN ('unknown', 'official', 'open_data', 'user_digitized')
       OR v_status IS NULL OR v_status NOT IN ('candidate', 'reviewed', 'published', 'rejected')
       OR v_source_url IS NULL OR v_source_url !~ '^https?://[^/?#@]+([/?#]|$)'
       OR length(v_source_url) > 2000 OR v_source_name IS NULL THEN
        RAISE EXCEPTION 'Некорректные сведения о конфигурации';
    END IF;
    PERFORM 1 FROM atlas.circuits WHERE id = v_circuit_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Трасса не найдена'; END IF;
    SELECT id, circuit_id, centerline IS NOT NULL AS has_geometry INTO v_existing
    FROM atlas.track_layouts WHERE id = v_id FOR UPDATE;
    IF p_create AND FOUND THEN RAISE EXCEPTION 'Конфигурация с таким ID уже существует'; END IF;
    IF NOT p_create AND (NOT FOUND OR v_existing.circuit_id <> v_circuit_id) THEN
        RAISE EXCEPTION 'Конфигурация не найдена у этой трассы';
    END IF;
    IF p_create AND v_status <> 'candidate' THEN
        RAISE EXCEPTION 'Новая конфигурация создаётся только кандидатом';
    END IF;
    IF v_status IN ('reviewed', 'published') AND
       (NOT coalesce(v_existing.has_geometry, false)
        OR v_provenance = 'unknown' OR NOT v_verified) THEN
        RAISE EXCEPTION 'Для подтверждения конфигурации нужны геометрия, происхождение и проверенный источник';
    END IF;
    IF NOT p_create AND v_status NOT IN ('reviewed', 'published')
       AND EXISTS (SELECT 1 FROM atlas.circuit_page_profiles
           WHERE circuit_id = v_circuit_id AND geometry_id = v_id
             AND editorial_status = 'published') THEN
        RAISE EXCEPTION 'Конфигурация используется опубликованной страницей трассы';
    END IF;

    v_source_id := 'admin-' || left(encode(sha256(convert_to(v_source_url, 'UTF8')), 'hex'), 16);
    INSERT INTO atlas.data_sources (id, name, url, retrieved_at, notes)
    VALUES (v_source_id, v_source_name, v_source_url, now(), v_source_notes)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url,
        retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;
    IF p_create THEN
        INSERT INTO atlas.track_layouts
            (id, circuit_id, name, valid_from_year, valid_to_year, length_m,
             turns, direction, elevation_min_m, elevation_max_m, source_id,
             provenance_type, review_status, verified_at, updated_at)
        VALUES (v_id, v_circuit_id, v_name, v_from, v_to, v_length,
                v_turns, v_direction, v_elevation_min, v_elevation_max,
                v_source_id, v_provenance, 'candidate', NULL, now());
    ELSE
        UPDATE atlas.track_layouts SET
            name = v_name, valid_from_year = v_from, valid_to_year = v_to,
            length_m = v_length, turns = v_turns, direction = v_direction,
            elevation_min_m = v_elevation_min, elevation_max_m = v_elevation_max,
            provenance_type = v_provenance, review_status = v_status,
            verified_at = CASE WHEN v_status IN ('reviewed', 'published') THEN now() ELSE NULL END,
            source_id = v_source_id, updated_at = now()
        WHERE id = v_id AND circuit_id = v_circuit_id;
    END IF;
    RETURN jsonb_build_object('id', v_id, 'circuitId', v_circuit_id,
        'publicDataSynced', false);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_save_track_layout(jsonb, boolean)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_save_track_layout(jsonb, boolean) TO service_role;

COMMIT;
