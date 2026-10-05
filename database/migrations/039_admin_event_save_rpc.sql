BEGIN;

-- Keep the source row and calendar row in one Data API transaction.
CREATE OR REPLACE FUNCTION atlas.admin_save_event(
    p_id text,
    p_season_year integer,
    p_round integer,
    p_name text,
    p_race_date date,
    p_start_time_utc time,
    p_status text,
    p_circuit_id text,
    p_layout_id text,
    p_source_url text,
    p_source_name text,
    p_source_verified boolean,
    p_create boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_layout atlas.track_layouts%ROWTYPE;
    v_source_id text;
BEGIN
    IF p_id IS NULL OR p_id !~ '^[A-Za-z0-9_-]+$' THEN
        RAISE EXCEPTION 'Некорректный ID этапа';
    END IF;
    IF p_season_year IS NULL OR p_season_year NOT BETWEEN 1950 AND 2100 THEN
        RAISE EXCEPTION 'Некорректный сезон';
    END IF;
    IF p_round IS NULL OR p_round NOT BETWEEN 1 AND 40 THEN
        RAISE EXCEPTION 'Некорректный номер этапа';
    END IF;
    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'Название этапа обязательно';
    END IF;
    IF p_status IS NULL OR p_status NOT IN ('scheduled', 'live', 'completed', 'cancelled', 'postponed') THEN
        RAISE EXCEPTION 'Некорректный статус этапа';
    END IF;
    IF p_circuit_id IS NULL OR p_circuit_id !~ '^[A-Za-z0-9_-]+$'
       OR (p_layout_id IS NOT NULL AND p_layout_id !~ '^[A-Za-z0-9_-]+$') THEN
        RAISE EXCEPTION 'Некорректная трасса или конфигурация';
    END IF;
    IF p_source_url IS NULL OR p_source_url !~ '^https?://[^/?#@]+([/?#]|$)'
       OR p_source_name IS NULL OR btrim(p_source_name) = '' THEN
        RAISE EXCEPTION 'Некорректный источник этапа';
    END IF;
    IF p_status IN ('live', 'completed') AND p_source_verified IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Для идущего или завершённого этапа подтвердите источник';
    END IF;
    IF p_create IS NULL THEN
        RAISE EXCEPTION 'Не указан режим сохранения этапа';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM atlas.seasons WHERE year = p_season_year) THEN
        RAISE EXCEPTION 'Сначала добавьте сезон';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM atlas.circuits WHERE id = p_circuit_id) THEN
        RAISE EXCEPTION 'Трасса не найдена';
    END IF;
    IF p_layout_id IS NOT NULL THEN
        SELECT * INTO v_layout FROM atlas.track_layouts
        WHERE id = p_layout_id AND circuit_id = p_circuit_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Конфигурация не относится к выбранной трассе';
        END IF;
        IF (v_layout.valid_from_year IS NOT NULL AND p_season_year < v_layout.valid_from_year)
           OR (v_layout.valid_to_year IS NOT NULL AND p_season_year > v_layout.valid_to_year) THEN
            RAISE EXCEPTION 'Сезон находится вне периода использования конфигурации';
        END IF;
    END IF;

    IF p_create THEN
        IF EXISTS (SELECT 1 FROM atlas.races WHERE id = p_id) THEN
            RAISE EXCEPTION 'Этап с таким ID уже существует';
        END IF;
    ELSE
        PERFORM 1 FROM atlas.races WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Этап не найден';
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM atlas.races
               WHERE season_year = p_season_year AND round = p_round AND id <> p_id) THEN
        RAISE EXCEPTION 'В этом сезоне уже существует этап с таким номером';
    END IF;

    v_source_id := 'admin-' || left(encode(sha256(convert_to(p_source_url, 'UTF8')), 'hex'), 16);
    INSERT INTO atlas.data_sources (id, name, url, retrieved_at, notes)
    VALUES (
        v_source_id, p_source_name, p_source_url, now(),
        CASE WHEN p_source_verified THEN 'Источник этапа проверен в админке'
             ELSE 'Источник этапа добавлен в админке' END
    )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        url = EXCLUDED.url,
        retrieved_at = EXCLUDED.retrieved_at,
        notes = EXCLUDED.notes;

    IF p_create THEN
        INSERT INTO atlas.races (
            id, season_year, round, circuit_id, layout_id, name,
            race_date, start_time_utc, status, source_id, updated_at
        ) VALUES (
            p_id, p_season_year, p_round, p_circuit_id, p_layout_id, btrim(p_name),
            p_race_date, p_start_time_utc, p_status, v_source_id, now()
        );
    ELSE
        UPDATE atlas.races SET
            season_year = p_season_year,
            round = p_round,
            circuit_id = p_circuit_id,
            layout_id = p_layout_id,
            name = btrim(p_name),
            race_date = p_race_date,
            start_time_utc = p_start_time_utc,
            status = p_status,
            source_id = v_source_id,
            updated_at = now()
        WHERE id = p_id;
    END IF;

    RETURN jsonb_build_object('id', p_id, 'seasonYear', p_season_year);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_save_event(
    text, integer, integer, text, date, time, text, text, text, text, text, boolean, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_save_event(
    text, integer, integer, text, date, time, text, text, text, text, text, boolean, boolean
) TO service_role;

COMMIT;
