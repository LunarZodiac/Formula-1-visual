BEGIN;

CREATE OR REPLACE FUNCTION atlas.admin_save_event_session(
    p_id text, p_race_id text, p_session_type text, p_name text,
    p_starts_at timestamptz, p_ends_at timestamptz, p_status text,
    p_source_url text, p_source_name text, p_source_verified boolean, p_create boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_source_id text;
BEGIN
    IF p_id IS NULL OR p_id !~ '^[A-Za-z0-9_-]+$'
       OR p_race_id IS NULL OR p_race_id !~ '^[A-Za-z0-9_-]+$' THEN
        RAISE EXCEPTION 'Некорректный ID этапа или сессии';
    END IF;
    IF p_session_type IS NULL OR p_session_type NOT IN (
        'practice_1', 'practice_2', 'practice_3', 'qualifying',
        'sprint_shootout', 'sprint', 'race'
    ) THEN
        RAISE EXCEPTION 'Некорректный тип сессии';
    END IF;
    IF p_name IS NULL OR btrim(p_name) = '' OR length(btrim(p_name)) > 120 THEN
        RAISE EXCEPTION 'Укажите название сессии';
    END IF;
    IF p_status IS NULL OR p_status NOT IN ('scheduled', 'live', 'completed', 'cancelled', 'postponed') THEN
        RAISE EXCEPTION 'Некорректный статус сессии';
    END IF;
    IF p_source_url IS NULL OR p_source_url !~ '^https?://[^/?#@]+([/?#]|$)'
       OR p_source_name IS NULL OR btrim(p_source_name) = '' THEN
        RAISE EXCEPTION 'Некорректный источник сессии';
    END IF;
    IF p_status IN ('live', 'completed') AND p_source_verified IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Для проведённой сессии подтвердите источник';
    END IF;
    IF p_create IS NULL THEN
        RAISE EXCEPTION 'Не указан режим сохранения сессии';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM atlas.races WHERE id = p_race_id) THEN
        RAISE EXCEPTION 'Этап не найден';
    END IF;
    IF p_create THEN
        IF EXISTS (SELECT 1 FROM atlas.sessions WHERE id = p_id) THEN
            RAISE EXCEPTION 'Такая сессия уже существует';
        END IF;
    ELSE
        PERFORM 1 FROM atlas.sessions WHERE id = p_id AND race_id = p_race_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Сессия не найдена';
        END IF;
    END IF;

    v_source_id := 'admin-' || left(encode(sha256(convert_to(p_source_url, 'UTF8')), 'hex'), 16);
    INSERT INTO atlas.data_sources (id, name, url, retrieved_at, notes)
    VALUES (
        v_source_id, p_source_name, p_source_url, now(),
        CASE WHEN p_source_verified THEN 'Источник сессии проверен в админке'
             ELSE 'Источник сессии добавлен в админке' END
    ) ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, url = EXCLUDED.url,
        retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

    IF p_create THEN
        INSERT INTO atlas.sessions (
            id, race_id, session_type, name, starts_at, ends_at, status, source_id, updated_at
        ) VALUES (
            p_id, p_race_id, p_session_type, btrim(p_name), p_starts_at, p_ends_at,
            p_status, v_source_id, now()
        );
    ELSE
        UPDATE atlas.sessions SET
            session_type = p_session_type, name = btrim(p_name),
            starts_at = p_starts_at, ends_at = p_ends_at,
            status = p_status, source_id = v_source_id, updated_at = now()
        WHERE id = p_id AND race_id = p_race_id;
    END IF;
    RETURN jsonb_build_object('id', p_id);
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_save_session_results(
    p_race_id text, p_session_id text, p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_season_year integer;
    v_row jsonb;
    v_input record;
    v_index integer := 0;
    v_seen_drivers text[] := ARRAY[]::text[];
    v_seen_originals text[] := ARRAY[]::text[];
    v_original_ids text[] := ARRAY[]::text[];
    v_preserved_details jsonb[] := ARRAY[]::jsonb[];
    v_details jsonb;
    v_source_id text;
BEGIN
    IF p_race_id IS NULL OR p_race_id !~ '^[A-Za-z0-9_-]+$'
       OR p_session_id IS NULL OR p_session_id !~ '^[A-Za-z0-9_-]+$' THEN
        RAISE EXCEPTION 'Некорректный этап или сессия';
    END IF;
    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
       OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 40 THEN
        RAISE EXCEPTION 'Пакет должен содержать от 1 до 40 результатов';
    END IF;

    SELECT race.season_year INTO v_season_year
    FROM atlas.sessions AS session
    JOIN atlas.races AS race ON race.id = session.race_id
    WHERE session.id = p_session_id AND session.race_id = p_race_id
    FOR UPDATE OF session;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Сессия или этап не найдены';
    END IF;

    -- Validate the whole package before deleting or writing any result row.
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
        IF jsonb_typeof(v_row) <> 'object' THEN
            RAISE EXCEPTION 'Некорректная строка результата';
        END IF;
        SELECT * INTO v_input FROM jsonb_to_record(v_row) AS item (
            driver_id text, original_driver_id text, position_order integer,
            position_text text, constructor_entry_id bigint, grid_position integer,
            laps integer, status text, points numeric, elapsed_ms bigint, gap_ms bigint,
            gap_text text, fastest_lap_rank integer, fastest_lap_number integer,
            fastest_lap_ms integer, q1_ms integer, q2_ms integer, q3_ms integer,
            penalty_note text, source_url text, source_name text, source_verified boolean
        );
        IF v_input.driver_id IS NULL OR v_input.driver_id !~ '^[A-Za-z0-9_-]+$'
           OR (v_input.original_driver_id IS NOT NULL
               AND v_input.original_driver_id !~ '^[A-Za-z0-9_-]+$') THEN
            RAISE EXCEPTION 'Выберите пилота';
        END IF;
        IF v_input.driver_id = ANY(v_seen_drivers)
           OR (v_input.original_driver_id IS NOT NULL
               AND v_input.original_driver_id = ANY(v_seen_originals)) THEN
            RAISE EXCEPTION 'Пилот повторяется в пакете';
        END IF;
        v_seen_drivers := array_append(v_seen_drivers, v_input.driver_id);
        IF v_input.original_driver_id IS NOT NULL THEN
            v_seen_originals := array_append(v_seen_originals, v_input.original_driver_id);
            v_original_ids := array_append(v_original_ids, v_input.original_driver_id);
        END IF;
        IF v_input.position_order IS NULL OR v_input.position_order < 1
           OR v_input.position_text IS NULL OR btrim(v_input.position_text) = ''
           OR length(btrim(v_input.position_text)) > 16 THEN
            RAISE EXCEPTION 'Некорректная позиция результата';
        END IF;
        IF v_input.points IS NULL OR v_input.points < 0 OR v_input.points > 100 THEN
            RAISE EXCEPTION 'Некорректные очки';
        END IF;
        IF (v_input.grid_position IS NOT NULL AND v_input.grid_position < 0)
           OR (v_input.laps IS NOT NULL AND v_input.laps < 0)
           OR (v_input.elapsed_ms IS NOT NULL AND v_input.elapsed_ms < 0)
           OR (v_input.gap_ms IS NOT NULL AND v_input.gap_ms < 0)
           OR (v_input.fastest_lap_rank IS NOT NULL AND v_input.fastest_lap_rank < 1)
           OR (v_input.fastest_lap_number IS NOT NULL AND v_input.fastest_lap_number < 1)
           OR (v_input.fastest_lap_ms IS NOT NULL AND v_input.fastest_lap_ms < 0)
           OR (v_input.q1_ms IS NOT NULL AND v_input.q1_ms < 0)
           OR (v_input.q2_ms IS NOT NULL AND v_input.q2_ms < 0)
           OR (v_input.q3_ms IS NOT NULL AND v_input.q3_ms < 0)
           OR (v_input.penalty_note IS NOT NULL AND length(btrim(v_input.penalty_note)) > 500) THEN
            RAISE EXCEPTION 'Некорректные дополнительные показатели';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM atlas.drivers WHERE id = v_input.driver_id) THEN
            RAISE EXCEPTION 'Пилот не найден: %', v_input.driver_id;
        END IF;
        IF v_input.constructor_entry_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM atlas.constructor_entries
            WHERE id = v_input.constructor_entry_id AND season_year = v_season_year
        ) THEN
            RAISE EXCEPTION 'Команда пилота не относится к сезону';
        END IF;
        IF v_input.source_verified IS DISTINCT FROM true
           OR v_input.source_url IS NULL
           OR v_input.source_url !~ '^https?://[^/?#@]+([/?#]|$)'
           OR v_input.source_name IS NULL OR btrim(v_input.source_name) = '' THEN
            RAISE EXCEPTION 'Подтвердите корректный источник результата';
        END IF;

        SELECT details INTO v_details FROM atlas.session_results
        WHERE session_id = p_session_id
          AND driver_id = coalesce(v_input.original_driver_id, v_input.driver_id);
        v_preserved_details := array_append(v_preserved_details, coalesce(v_details, '{}'::jsonb));
    END LOOP;

    -- A newly selected driver must not overwrite an unrelated existing row.
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
        IF EXISTS (
            SELECT 1 FROM atlas.session_results
            WHERE session_id = p_session_id AND driver_id = v_row->>'driver_id'
        ) AND NOT (v_row->>'driver_id' = ANY(v_original_ids)) THEN
            RAISE EXCEPTION 'У пилота уже есть результат в этой сессии: %', v_row->>'driver_id';
        END IF;
    END LOOP;

    DELETE FROM atlas.session_results
    WHERE session_id = p_session_id AND driver_id = ANY(v_original_ids);

    FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
        v_index := v_index + 1;
        SELECT * INTO v_input FROM jsonb_to_record(v_row) AS item (
            driver_id text, original_driver_id text, position_order integer,
            position_text text, constructor_entry_id bigint, grid_position integer,
            laps integer, status text, points numeric, elapsed_ms bigint, gap_ms bigint,
            gap_text text, fastest_lap_rank integer, fastest_lap_number integer,
            fastest_lap_ms integer, q1_ms integer, q2_ms integer, q3_ms integer,
            penalty_note text, source_url text, source_name text, source_verified boolean
        );
        v_source_id := 'admin-' || left(encode(sha256(convert_to(v_input.source_url, 'UTF8')), 'hex'), 16);
        INSERT INTO atlas.data_sources (id, name, url, retrieved_at, notes)
        VALUES (v_source_id, v_input.source_name, v_input.source_url, now(),
                'Источник результата проверен в админке')
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name, url = EXCLUDED.url,
            retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

        INSERT INTO atlas.session_results (
            session_id, position_order, position_text, driver_id, constructor_entry_id,
            grid_position, laps, status, points, elapsed_ms, gap_ms, gap_text,
            fastest_lap_rank, fastest_lap_number, fastest_lap_ms, details, source_id, updated_at
        ) VALUES (
            p_session_id, v_input.position_order, btrim(v_input.position_text), v_input.driver_id,
            v_input.constructor_entry_id, v_input.grid_position, v_input.laps, v_input.status,
            v_input.points, v_input.elapsed_ms, v_input.gap_ms, v_input.gap_text,
            v_input.fastest_lap_rank, v_input.fastest_lap_number, v_input.fastest_lap_ms,
            (v_preserved_details[v_index] - ARRAY['q1_ms','q2_ms','q3_ms','penalty_note']) ||
              jsonb_strip_nulls(jsonb_build_object(
                  'q1_ms', v_input.q1_ms, 'q2_ms', v_input.q2_ms,
                  'q3_ms', v_input.q3_ms, 'penalty_note', nullif(btrim(v_input.penalty_note), '')
              )),
            v_source_id, now()
        ) ON CONFLICT (session_id, driver_id) DO UPDATE SET
            position_order = EXCLUDED.position_order,
            position_text = EXCLUDED.position_text,
            constructor_entry_id = EXCLUDED.constructor_entry_id,
            grid_position = EXCLUDED.grid_position,
            laps = EXCLUDED.laps, status = EXCLUDED.status,
            points = EXCLUDED.points, elapsed_ms = EXCLUDED.elapsed_ms,
            gap_ms = EXCLUDED.gap_ms, gap_text = EXCLUDED.gap_text,
            fastest_lap_rank = EXCLUDED.fastest_lap_rank,
            fastest_lap_number = EXCLUDED.fastest_lap_number,
            fastest_lap_ms = EXCLUDED.fastest_lap_ms,
            details = EXCLUDED.details,
            source_id = EXCLUDED.source_id, updated_at = now();
    END LOOP;
    RETURN jsonb_build_object('saved', jsonb_array_length(p_rows));
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_delete_session_result(
    p_race_id text, p_session_id text, p_driver_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF p_race_id IS NULL OR p_race_id !~ '^[A-Za-z0-9_-]+$'
       OR p_session_id IS NULL OR p_session_id !~ '^[A-Za-z0-9_-]+$'
       OR p_driver_id IS NULL OR p_driver_id !~ '^[A-Za-z0-9_-]+$' THEN
        RAISE EXCEPTION 'Некорректный результат';
    END IF;
    PERFORM 1 FROM atlas.sessions
    WHERE id = p_session_id AND race_id = p_race_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Сессия или этап не найдены';
    END IF;
    DELETE FROM atlas.session_results
    WHERE session_id = p_session_id AND driver_id = p_driver_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Результат не найден';
    END IF;
    RETURN jsonb_build_object('deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_save_event_session(
    text,text,text,text,timestamptz,timestamptz,text,text,text,boolean,boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_save_event_session(
    text,text,text,text,timestamptz,timestamptz,text,text,text,boolean,boolean
) TO service_role;

REVOKE ALL ON FUNCTION atlas.admin_save_session_results(text,text,jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_save_session_results(text,text,jsonb)
    TO service_role;

REVOKE ALL ON FUNCTION atlas.admin_delete_session_result(text,text,text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_delete_session_result(text,text,text)
    TO service_role;

COMMIT;
