BEGIN;

CREATE OR REPLACE FUNCTION atlas.admin_save_driver_editorial(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_id text := p_input->>'id';
    v_nicknames jsonb := coalesce(p_input->'nicknames', '[]'::jsonb);
    v_quotes jsonb := coalesce(p_input->'quotes', '[]'::jsonb);
    v_expected_revision timestamptz := nullif(p_input->>'expectedRevision', '')::timestamptz;
    v_current_revision timestamptz;
    v_row jsonb;
    v_url text;
    v_source_id text;
    v_sort integer;
    v_quote_date date;
BEGIN
    IF v_id IS NULL OR v_id !~ '^[A-Za-z0-9_-]+$'
       OR v_expected_revision IS NULL
       OR jsonb_typeof(v_nicknames) <> 'array'
       OR jsonb_typeof(v_quotes) <> 'array' THEN
        RAISE EXCEPTION 'Некорректные редакционные сведения о пилоте';
    END IF;
    IF jsonb_array_length(v_nicknames) > 20 OR jsonb_array_length(v_quotes) > 20 THEN
        RAISE EXCEPTION 'Слишком много прозвищ или цитат';
    END IF;
    SELECT updated_at INTO v_current_revision
    FROM atlas.drivers WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Пилот не найден'; END IF;
    IF v_current_revision IS DISTINCT FROM v_expected_revision THEN
        RAISE EXCEPTION 'Редакционные данные изменились. Обновите страницу перед сохранением';
    END IF;

    -- All changes run in one RPC transaction. Any invalid row rolls back the deletes.
    DELETE FROM atlas.driver_nicknames WHERE driver_id = v_id;
    DELETE FROM atlas.driver_quotes WHERE driver_id = v_id;
    v_sort := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(v_nicknames) LOOP
        v_url := nullif(btrim(v_row->>'sourceUrl'), '');
        IF jsonb_typeof(v_row) <> 'object'
           OR nullif(btrim(v_row->>'nameRu'), '') IS NULL
           OR length(v_row->>'nameRu') > 120
           OR v_url IS NULL OR length(v_url) > 2000
           OR v_url !~ '^https?://[^/?#@]+([/?#]|$)' THEN
            RAISE EXCEPTION 'Некорректное прозвище или источник';
        END IF;
        v_source_id := 'admin-' || left(encode(sha256(convert_to(v_url, 'UTF8')), 'hex'), 16);
        INSERT INTO atlas.data_sources (id, name, url, retrieved_at, notes)
        VALUES (v_source_id, split_part(split_part(v_url, '://', 2), '/', 1),
                v_url, now(), 'Источник редакционного материала пилота')
        ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, retrieved_at = EXCLUDED.retrieved_at;
        INSERT INTO atlas.driver_nicknames
            (driver_id, name_ru, name_original, context_ru, sort_order, source_id, source_url, review_status)
        VALUES (v_id, btrim(v_row->>'nameRu'), nullif(btrim(v_row->>'nameOriginal'), ''),
                nullif(btrim(v_row->>'contextRu'), ''), v_sort, v_source_id, v_url, 'reviewed');
        v_sort := v_sort + 1;
    END LOOP;
    v_sort := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(v_quotes) LOOP
        v_url := nullif(btrim(v_row->>'sourceUrl'), '');
        IF jsonb_typeof(v_row) <> 'object'
           OR nullif(btrim(v_row->>'quoteRu'), '') IS NULL
           OR nullif(btrim(v_row->>'attributionRu'), '') IS NULL
           OR v_url IS NULL OR length(v_url) > 2000
           OR v_url !~ '^https?://[^/?#@]+([/?#]|$)' THEN
            RAISE EXCEPTION 'Некорректная цитата или источник';
        END IF;
        v_quote_date := nullif(v_row->>'quoteDate', '')::date;
        v_source_id := 'admin-' || left(encode(sha256(convert_to(v_url, 'UTF8')), 'hex'), 16);
        INSERT INTO atlas.data_sources (id, name, url, retrieved_at, notes)
        VALUES (v_source_id, split_part(split_part(v_url, '://', 2), '/', 1),
                v_url, now(), 'Источник редакционного материала пилота')
        ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, retrieved_at = EXCLUDED.retrieved_at;
        INSERT INTO atlas.driver_quotes
            (driver_id, quote_ru, quote_original, attribution_ru, context_ru,
             quote_date, sort_order, source_id, source_url, review_status)
        VALUES (v_id, btrim(v_row->>'quoteRu'), nullif(btrim(v_row->>'quoteOriginal'), ''),
                btrim(v_row->>'attributionRu'), nullif(btrim(v_row->>'contextRu'), ''),
                v_quote_date, v_sort, v_source_id, v_url, 'reviewed');
        v_sort := v_sort + 1;
    END LOOP;
    UPDATE atlas.drivers
    SET updated_at = greatest(clock_timestamp(), v_current_revision + interval '1 microsecond')
    WHERE id = v_id;
    RETURN jsonb_build_object('nicknames', jsonb_array_length(v_nicknames),
                              'quotes', jsonb_array_length(v_quotes),
                              'publicDataSynced', false);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_save_driver_editorial(jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_save_driver_editorial(jsonb) TO service_role;

COMMIT;
