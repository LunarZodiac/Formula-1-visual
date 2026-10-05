BEGIN;

CREATE OR REPLACE FUNCTION atlas.admin_save_circuit_profile(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_id text := p_input->>'id';
    v_name text := nullif(btrim(p_input->>'officialName'), '');
    v_short_name text := nullif(btrim(p_input->>'shortName'), '');
    v_locality text := nullif(btrim(p_input->>'locality'), '');
    v_country_code text := lower(nullif(btrim(p_input->>'countryCode'), ''));
    v_type text := p_input->>'circuitType';
    v_longitude double precision := (p_input->>'longitude')::double precision;
    v_latitude double precision := (p_input->>'latitude')::double precision;
    v_opened_year integer := nullif(p_input->>'openedYear', '')::integer;
    v_website_url text := nullif(btrim(p_input->>'websiteUrl'), '');
    v_slug text := nullif(btrim(p_input->>'slug'), '');
    v_geometry_id text := nullif(btrim(p_input->>'geometryId'), '');
    v_name_ru text := nullif(btrim(p_input->>'nameRu'), '');
    v_city_ru text := nullif(btrim(p_input->>'cityRu'), '');
    v_country_ru text := nullif(btrim(p_input->>'countryRu'), '');
    v_summary_ru text := nullif(btrim(p_input->>'summaryRu'), '');
    v_type_ru text := nullif(btrim(p_input->>'circuitTypeRu'), '');
    v_status text := p_input->>'editorialStatus';
    v_source_url text := nullif(btrim(p_input->>'sourceUrl'), '');
    v_source_name text := nullif(btrim(p_input->>'sourceName'), '');
    v_source_notes text := nullif(btrim(p_input->>'sourceNotes'), '');
    v_verified boolean := coalesce((p_input->>'sourceVerified')::boolean, false);
    v_source_id text;
    v_previous record;
    v_core_changed boolean;
    v_changed text[] := ARRAY[]::text[];
    v_field text;
    v_verified_fields integer;
BEGIN
    IF v_id IS NULL OR v_id !~ '^[A-Za-z0-9_-]+$'
       OR v_name IS NULL OR v_country_code !~ '^[a-z]{2}$'
       OR v_type IS NULL OR v_type NOT IN ('permanent', 'street', 'hybrid', 'temporary')
       OR v_longitude IS NULL OR v_longitude NOT BETWEEN -180 AND 180
       OR v_latitude IS NULL OR v_latitude NOT BETWEEN -90 AND 90
       OR (v_opened_year IS NOT NULL AND v_opened_year NOT BETWEEN 1800 AND extract(year FROM now())::integer)
       OR v_slug IS NULL OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       OR v_name_ru IS NULL OR v_city_ru IS NULL OR v_country_ru IS NULL
       OR v_status IS NULL OR v_status NOT IN ('draft', 'review', 'published')
       OR v_source_url IS NULL OR v_source_url !~ '^https?://[^/?#@]+([/?#]|$)'
       OR length(v_source_url) > 2000 OR v_source_name IS NULL THEN
        RAISE EXCEPTION 'Некорректные сведения о трассе или источнике';
    END IF;
    IF v_website_url IS NOT NULL AND
       (v_website_url !~ '^https?://[^/?#@]+([/?#]|$)' OR length(v_website_url) > 2000) THEN
        RAISE EXCEPTION 'Некорректный адрес сайта трассы';
    END IF;
    IF v_status = 'published' AND
       (v_id NOT IN ('spa', 'bahrain') OR v_geometry_id IS NULL
        OR v_summary_ru IS NULL OR v_type_ru IS NULL) THEN
        RAISE EXCEPTION 'Публичный профиль этой трассы не готов к публикации';
    END IF;

    SELECT circuit.name, circuit.short_name, circuit.locality,
           lower(circuit.country_code) AS country_code, circuit.circuit_type,
           public.ST_X(circuit.location::public.geometry) AS longitude,
           public.ST_Y(circuit.location::public.geometry) AS latitude,
           circuit.opened_year, circuit.website_url, profile.slug,
           profile.geometry_id, profile.name_ru, profile.city_ru,
           profile.country_ru, profile.summary_ru, profile.circuit_type_ru,
           profile.editorial_status
    INTO v_previous
    FROM atlas.circuits AS circuit
    LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id
    WHERE circuit.id = v_id FOR UPDATE OF circuit;
    IF NOT FOUND THEN RAISE EXCEPTION 'Трасса не найдена'; END IF;
    IF v_previous.slug IS NOT NULL AND v_slug <> v_previous.slug THEN
        RAISE EXCEPTION 'Адрес существующей публичной страницы нельзя менять';
    END IF;
    IF v_previous.editorial_status = 'published' AND v_status <> 'published' THEN
        RAISE EXCEPTION 'Снятие публичной страницы с публикации пока недоступно';
    END IF;

    v_core_changed := v_previous.name IS DISTINCT FROM v_name
        OR v_previous.short_name IS DISTINCT FROM v_short_name
        OR v_previous.locality IS DISTINCT FROM v_locality
        OR v_previous.country_code IS DISTINCT FROM v_country_code
        OR v_previous.circuit_type IS DISTINCT FROM v_type
        OR v_previous.longitude IS DISTINCT FROM v_longitude
        OR v_previous.latitude IS DISTINCT FROM v_latitude
        OR v_previous.opened_year IS DISTINCT FROM v_opened_year
        OR v_previous.website_url IS DISTINCT FROM v_website_url;
    IF v_previous.slug IS DISTINCT FROM v_slug THEN v_changed := array_append(v_changed, 'slug'); END IF;
    IF v_previous.geometry_id IS DISTINCT FROM v_geometry_id THEN v_changed := array_append(v_changed, 'geometry_id'); END IF;
    IF v_previous.name_ru IS DISTINCT FROM v_name_ru THEN v_changed := array_append(v_changed, 'name_ru'); END IF;
    IF v_previous.city_ru IS DISTINCT FROM v_city_ru THEN v_changed := array_append(v_changed, 'city_ru'); END IF;
    IF v_previous.country_ru IS DISTINCT FROM v_country_ru THEN v_changed := array_append(v_changed, 'country_ru'); END IF;
    IF v_previous.summary_ru IS DISTINCT FROM v_summary_ru THEN v_changed := array_append(v_changed, 'summary_ru'); END IF;
    IF v_previous.circuit_type_ru IS DISTINCT FROM v_type_ru THEN v_changed := array_append(v_changed, 'circuit_type_ru'); END IF;
    IF v_status = 'published' AND (v_core_changed OR cardinality(v_changed) > 0) AND NOT v_verified THEN
        RAISE EXCEPTION 'Изменения опубликованной страницы требуют подтверждения источника';
    END IF;
    IF v_status = 'published' AND NOT EXISTS (
        SELECT 1 FROM atlas.track_layouts
        WHERE id = v_geometry_id AND circuit_id = v_id AND centerline IS NOT NULL
          AND review_status IN ('reviewed', 'published')
    ) THEN
        RAISE EXCEPTION 'Для публикации нужна проверенная конфигурация с геометрией';
    END IF;

    v_source_id := 'admin-' || left(encode(sha256(convert_to(v_source_url, 'UTF8')), 'hex'), 16);
    INSERT INTO atlas.data_sources (id, name, url, retrieved_at, notes)
    VALUES (v_source_id, v_source_name, v_source_url, now(), v_source_notes)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url,
        retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

    UPDATE atlas.circuits SET
        name = v_name, short_name = v_short_name, locality = v_locality,
        country_code = upper(v_country_code), circuit_type = v_type,
        location = public.ST_SetSRID(public.ST_MakePoint(v_longitude, v_latitude), 4326)::public.geography,
        opened_year = v_opened_year, website_url = v_website_url,
        source_id = CASE WHEN v_core_changed THEN v_source_id ELSE source_id END,
        updated_at = now()
    WHERE id = v_id;
    INSERT INTO atlas.circuit_page_profiles
        (circuit_id, slug, geometry_id, name_ru, city_ru, country_ru,
         summary_ru, circuit_type_ru, editorial_status, source_id, updated_at)
    VALUES (v_id, v_slug, v_geometry_id, v_name_ru, v_city_ru, v_country_ru,
            v_summary_ru, v_type_ru, v_status, v_source_id, now())
    ON CONFLICT (circuit_id) DO UPDATE SET
        slug = EXCLUDED.slug, geometry_id = EXCLUDED.geometry_id,
        name_ru = EXCLUDED.name_ru, city_ru = EXCLUDED.city_ru,
        country_ru = EXCLUDED.country_ru, summary_ru = EXCLUDED.summary_ru,
        circuit_type_ru = EXCLUDED.circuit_type_ru,
        editorial_status = EXCLUDED.editorial_status,
        source_id = CASE WHEN cardinality(v_changed) > 0
            THEN EXCLUDED.source_id ELSE atlas.circuit_page_profiles.source_id END,
        updated_at = EXCLUDED.updated_at;
    FOREACH v_field IN ARRAY v_changed LOOP
        INSERT INTO atlas.circuit_page_profile_field_sources
            (circuit_id, field_name, source_id, editorial_status, verified_at, notes)
        VALUES (v_id, v_field, v_source_id,
            CASE WHEN v_verified THEN 'verified' ELSE 'candidate' END,
            CASE WHEN v_verified THEN now() ELSE NULL END, v_source_notes)
        ON CONFLICT (circuit_id, field_name) DO UPDATE SET
            source_id = EXCLUDED.source_id, editorial_status = EXCLUDED.editorial_status,
            verified_at = EXCLUDED.verified_at, notes = EXCLUDED.notes;
    END LOOP;
    IF v_status = 'published' THEN
        SELECT count(DISTINCT field_name) INTO v_verified_fields
        FROM atlas.circuit_page_profile_field_sources
        WHERE circuit_id = v_id AND editorial_status = 'verified'
          AND field_name = ANY(ARRAY['slug', 'geometry_id', 'name_ru', 'city_ru',
            'country_ru', 'summary_ru', 'circuit_type_ru']);
        IF v_verified_fields <> 7 THEN
            RAISE EXCEPTION 'Для публикации все поля требуют проверенных источников';
        END IF;
    END IF;
    RETURN jsonb_build_object('id', v_id, 'publicDataSynced', false);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_save_circuit_profile(jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_save_circuit_profile(jsonb) TO service_role;

COMMIT;
