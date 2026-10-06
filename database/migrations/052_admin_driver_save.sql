BEGIN;

-- Driver edits use updated_at as an optimistic concurrency token. The generic
-- trigger assigns transaction start time, which can repeat across updates.
CREATE OR REPLACE FUNCTION atlas.touch_driver_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = greatest(clock_timestamp(), OLD.updated_at + interval '1 microsecond');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_updated_at ON atlas.drivers;
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON atlas.drivers
    FOR EACH ROW EXECUTE FUNCTION atlas.touch_driver_revision();

CREATE OR REPLACE FUNCTION atlas.admin_save_driver_profile(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_id text := p_input->>'id';
    v_name_ru text := nullif(btrim(p_input->>'nameRu'), '');
    v_birth_date date := nullif(p_input->>'birthDate', '')::date;
    v_birth_place text := nullif(btrim(p_input->>'birthPlaceRu'), '');
    v_death_date date := nullif(p_input->>'deathDate', '')::date;
    v_height numeric := nullif(p_input->>'heightCm', '')::numeric;
    v_weight numeric := nullif(p_input->>'weightKg', '')::numeric;
    v_biography text := nullif(btrim(p_input->>'biographyRu'), '');
    v_url text := nullif(btrim(p_input->>'sourceUrl'), '');
    v_expected_revision timestamptz := nullif(p_input->>'expectedRevision', '')::timestamptz;
    v_source_id text;
    v_current record;
    v_fields text[] := ARRAY[]::text[];
    v_field text;
BEGIN
    IF v_id IS NULL OR v_id !~ '^[A-Za-z0-9_-]+$'
       OR v_name_ru IS NULL OR length(v_name_ru) > 300
       OR v_url IS NULL OR length(v_url) > 2000 OR v_expected_revision IS NULL
       OR v_url !~ '^https?://[^/?#@]+([/?#]|$)'
       OR (v_birth_date IS NOT NULL AND v_death_date IS NOT NULL AND v_death_date < v_birth_date)
       OR (v_height IS NOT NULL AND v_height NOT BETWEEN 120 AND 230)
       OR (v_weight IS NOT NULL AND v_weight NOT BETWEEN 35 AND 200) THEN
        RAISE EXCEPTION 'Некорректные сведения о пилоте или источнике';
    END IF;
    SELECT driver.updated_at, driver.date_of_birth, profile.name_ru, profile.birth_place_ru,
           profile.death_date, profile.height_cm, profile.weight_kg, profile.biography_ru
    INTO v_current
    FROM atlas.drivers AS driver
    LEFT JOIN atlas.driver_profiles AS profile ON profile.driver_id = driver.id
    WHERE driver.id = v_id FOR UPDATE OF driver;
    IF NOT FOUND THEN RAISE EXCEPTION 'Пилот не найден'; END IF;
    IF v_current.updated_at IS DISTINCT FROM v_expected_revision THEN
        RAISE EXCEPTION 'Профиль изменился. Обновите страницу перед сохранением';
    END IF;

    IF v_current.date_of_birth IS DISTINCT FROM v_birth_date THEN v_fields := array_append(v_fields, 'birth_date'); END IF;
    IF v_current.name_ru IS DISTINCT FROM v_name_ru THEN v_fields := array_append(v_fields, 'name_ru'); END IF;
    IF v_current.birth_place_ru IS DISTINCT FROM v_birth_place THEN v_fields := array_append(v_fields, 'birth_place_ru'); END IF;
    IF v_current.death_date IS DISTINCT FROM v_death_date THEN v_fields := array_append(v_fields, 'death_date'); END IF;
    IF v_current.height_cm IS DISTINCT FROM v_height THEN v_fields := array_append(v_fields, 'height_cm'); END IF;
    IF v_current.weight_kg IS DISTINCT FROM v_weight THEN v_fields := array_append(v_fields, 'weight_kg'); END IF;
    IF v_current.biography_ru IS DISTINCT FROM v_biography THEN v_fields := array_append(v_fields, 'biography_ru'); END IF;
    IF cardinality(v_fields) = 0 THEN
        RETURN jsonb_build_object('fields', to_jsonb(v_fields), 'publicDataSynced', true);
    END IF;

    v_source_id := 'admin-' || left(encode(sha256(convert_to(v_url, 'UTF8')), 'hex'), 16);
    INSERT INTO atlas.data_sources (id, name, url, retrieved_at, notes)
    VALUES (v_source_id, split_part(split_part(v_url, '://', 2), '/', 1),
            v_url, now(), 'Редакционная правка профиля пилота')
    ON CONFLICT (id) DO UPDATE SET retrieved_at = EXCLUDED.retrieved_at;

    FOREACH v_field IN ARRAY v_fields LOOP
        INSERT INTO atlas.driver_profile_field_sources
            (driver_id, field_name, source_id, source_url, retrieved_at, review_status, notes)
        VALUES (v_id, v_field, v_source_id, v_url, now(), 'reviewed', 'Ручная редакционная правка')
        ON CONFLICT (driver_id, field_name, source_id) DO UPDATE SET
            source_url = EXCLUDED.source_url, retrieved_at = EXCLUDED.retrieved_at,
            review_status = EXCLUDED.review_status, notes = EXCLUDED.notes;
    END LOOP;
    UPDATE atlas.drivers SET
        date_of_birth = CASE WHEN 'birth_date' = ANY(v_fields) THEN v_birth_date ELSE date_of_birth END,
        updated_at = greatest(clock_timestamp(), v_current.updated_at + interval '1 microsecond')
    WHERE id = v_id;
    IF EXISTS (SELECT 1 FROM unnest(v_fields) AS field WHERE field <> 'birth_date') THEN
        INSERT INTO atlas.driver_profiles
            (driver_id, name_ru, birth_place_ru, death_date, height_cm, weight_kg,
             biography_ru, source_id, review_status, updated_at)
        VALUES (v_id, v_name_ru, v_birth_place, v_death_date, v_height, v_weight,
                v_biography, v_source_id, 'reviewed', now())
        ON CONFLICT (driver_id) DO UPDATE SET
            name_ru = EXCLUDED.name_ru, birth_place_ru = EXCLUDED.birth_place_ru,
            death_date = EXCLUDED.death_date, height_cm = EXCLUDED.height_cm,
            weight_kg = EXCLUDED.weight_kg, biography_ru = EXCLUDED.biography_ru,
            source_id = EXCLUDED.source_id, review_status = EXCLUDED.review_status,
            updated_at = EXCLUDED.updated_at;
    END IF;
    RETURN jsonb_build_object('fields', to_jsonb(v_fields), 'publicDataSynced', false);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_save_driver_profile(jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_save_driver_profile(jsonb) TO service_role;

COMMIT;
