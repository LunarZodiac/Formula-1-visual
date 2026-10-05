BEGIN;

CREATE OR REPLACE VIEW atlas.admin_constructor_identities
WITH (security_invoker = true)
AS
SELECT constructor.id, constructor.name,
       min(entry.season_year)::integer AS first_season,
       max(entry.season_year)::integer AS latest_season
FROM atlas.constructors AS constructor
LEFT JOIN atlas.constructor_entries AS entry ON entry.constructor_id = constructor.id
GROUP BY constructor.id, constructor.name;

REVOKE ALL ON atlas.admin_constructor_identities FROM PUBLIC, anon, authenticated;
GRANT SELECT ON atlas.admin_constructor_identities TO service_role;

CREATE OR REPLACE VIEW atlas.admin_constructor_directory
WITH (security_invoker = true)
AS
SELECT constructor.id, constructor.name,
       min(entry.season_year)::integer AS first_season,
       max(entry.season_year)::integer AS latest_season,
       count(DISTINCT entry.season_year)::integer AS season_count,
       array_remove(array_agg(DISTINCT entry.display_name), NULL) AS aliases,
       latest.logo_image_url, latest.car_image_url
FROM atlas.constructors AS constructor
LEFT JOIN atlas.constructor_entries AS entry ON entry.constructor_id = constructor.id
LEFT JOIN LATERAL (
    SELECT season_entry.logo_image_url, season_entry.car_image_url
    FROM atlas.constructor_entries AS season_entry
    WHERE season_entry.constructor_id = constructor.id
    ORDER BY season_entry.season_year DESC, season_entry.id DESC
    LIMIT 1
) AS latest ON true
GROUP BY constructor.id, constructor.name, latest.logo_image_url, latest.car_image_url;

REVOKE ALL ON atlas.admin_constructor_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON atlas.admin_constructor_directory TO service_role;

CREATE OR REPLACE FUNCTION atlas.admin_save_constructor_entry(
    p_season_year integer,
    p_constructor_id text,
    p_display_name text,
    p_engine_name text,
    p_team_colour text,
    p_car_model text,
    p_source_url text,
    p_source_name text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_current atlas.constructor_entries%ROWTYPE;
    v_source_id text;
    v_fields text[] := ARRAY[]::text[];
BEGIN
    IF p_season_year IS NULL OR p_season_year NOT BETWEEN 1950 AND 2100
       OR p_constructor_id IS NULL OR p_constructor_id !~ '^[A-Za-z0-9_-]+$' THEN
        RAISE EXCEPTION 'Некорректная сезонная запись команды';
    END IF;
    IF p_display_name IS NULL OR btrim(p_display_name) = '' OR length(btrim(p_display_name)) > 250
       OR (p_engine_name IS NOT NULL AND length(btrim(p_engine_name)) > 250)
       OR (p_car_model IS NOT NULL AND length(btrim(p_car_model)) > 250)
       OR (p_team_colour IS NOT NULL AND p_team_colour !~ '^#[0-9A-Fa-f]{6}$') THEN
        RAISE EXCEPTION 'Некорректные сведения о команде';
    END IF;
    IF p_source_url IS NULL OR p_source_url !~ '^https?://[^/?#@]+([/?#]|$)'
       OR length(p_source_url) > 2000 OR p_source_name IS NULL OR btrim(p_source_name) = '' THEN
        RAISE EXCEPTION 'Некорректный URL источника';
    END IF;

    SELECT * INTO v_current FROM atlas.constructor_entries
    WHERE season_year = p_season_year AND constructor_id = p_constructor_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Команда не найдена'; END IF;

    IF v_current.display_name IS DISTINCT FROM btrim(p_display_name) THEN
        v_fields := array_append(v_fields, 'display_name');
    END IF;
    IF v_current.engine_name IS DISTINCT FROM nullif(btrim(p_engine_name), '') THEN
        v_fields := array_append(v_fields, 'engine_name');
    END IF;
    IF v_current.team_colour IS DISTINCT FROM p_team_colour THEN
        v_fields := array_append(v_fields, 'team_colour');
    END IF;
    IF v_current.car_model IS DISTINCT FROM nullif(btrim(p_car_model), '') THEN
        v_fields := array_append(v_fields, 'car_model');
    END IF;
    -- The editor has one source field. A source-only save corrects provenance
    -- for the displayed season entry without changing its values.
    IF cardinality(v_fields) = 0 THEN
        v_fields := ARRAY['display_name', 'engine_name', 'team_colour', 'car_model'];
    END IF;

    v_source_id := 'editorial-' || left(encode(sha256(convert_to(p_source_url, 'UTF8')), 'hex'), 16);
    INSERT INTO atlas.data_sources (id, name, url, retrieved_at, notes)
    VALUES (v_source_id, p_source_name, p_source_url, now(), 'Источник редакционной правки сезонной записи команды')
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, url = EXCLUDED.url, retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

    UPDATE atlas.constructor_entries SET
        display_name = btrim(p_display_name),
        engine_name = nullif(btrim(p_engine_name), ''),
        team_colour = p_team_colour,
        car_model = nullif(btrim(p_car_model), ''),
        updated_at = now()
    WHERE season_year = p_season_year AND constructor_id = p_constructor_id;

    INSERT INTO atlas.constructor_entry_field_sources (
        season_year, constructor_id, field_name, source_id, source_url, retrieved_at, review_status, notes
    )
    SELECT p_season_year, p_constructor_id, field_name, v_source_id, p_source_url,
           now(), 'reviewed', 'Ручная редакционная правка'
    FROM unnest(v_fields) AS field_name
    ON CONFLICT (season_year, constructor_id, field_name, source_id) DO UPDATE SET
        source_url = EXCLUDED.source_url, retrieved_at = EXCLUDED.retrieved_at,
        review_status = EXCLUDED.review_status, notes = EXCLUDED.notes;

    RETURN jsonb_build_object('fields', to_jsonb(v_fields));
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_save_constructor_lineage(
    p_id bigint,
    p_predecessor_id text,
    p_successor_id text,
    p_relationship_type text,
    p_valid_from_year integer,
    p_valid_to_year integer,
    p_description_ru text,
    p_review_status text,
    p_source_url text,
    p_source_name text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_id bigint;
    v_source_id text;
BEGIN
    IF p_predecessor_id IS NULL OR p_predecessor_id !~ '^[A-Za-z0-9_-]+$'
       OR p_successor_id IS NULL OR p_successor_id !~ '^[A-Za-z0-9_-]+$'
       OR p_predecessor_id = p_successor_id THEN
        RAISE EXCEPTION 'Выберите две разные команды';
    END IF;
    IF p_relationship_type IS NULL OR p_relationship_type NOT IN (
        'rename', 'ownership_change', 'factory_takeover', 'licence_transfer', 'continuation', 'other'
    ) OR p_review_status IS NULL OR p_review_status NOT IN (
        'candidate', 'reviewed', 'published', 'rejected'
    ) THEN
        RAISE EXCEPTION 'Некорректный тип или статус связи';
    END IF;
    IF (p_valid_from_year IS NOT NULL AND p_valid_from_year NOT BETWEEN 1950 AND 2100)
       OR (p_valid_to_year IS NOT NULL AND p_valid_to_year NOT BETWEEN 1950 AND 2100)
       OR (p_valid_from_year IS NOT NULL AND p_valid_to_year IS NOT NULL
           AND p_valid_to_year < p_valid_from_year) THEN
        RAISE EXCEPTION 'Некорректный период связи';
    END IF;
    IF p_source_url IS NULL OR p_source_url !~ '^https?://[^/?#@]+([/?#]|$)'
       OR length(p_source_url) > 2000
       OR p_source_name IS NULL OR btrim(p_source_name) = '' THEN
        RAISE EXCEPTION 'Некорректный источник связи';
    END IF;
    IF (SELECT count(*) FROM atlas.constructors
        WHERE id IN (p_predecessor_id, p_successor_id)) <> 2 THEN
        RAISE EXCEPTION 'Команда не найдена';
    END IF;

    IF p_id IS NOT NULL THEN
        PERFORM 1 FROM atlas.constructor_lineage_links WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Связь не найдена'; END IF;
    END IF;

    v_source_id := 'constructor-lineage-' || left(encode(sha256(convert_to(p_source_url, 'UTF8')), 'hex'), 24);
    INSERT INTO atlas.data_sources (id, name, url, retrieved_at, notes)
    VALUES (v_source_id, p_source_name, p_source_url, now(), 'Источник связи преемственности команды')
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, url = EXCLUDED.url, retrieved_at = EXCLUDED.retrieved_at;

    IF p_id IS NULL THEN
        INSERT INTO atlas.constructor_lineage_links (
            predecessor_constructor_id, successor_constructor_id, relationship_type,
            valid_from_year, valid_to_year, description_ru, source_id, review_status, verified_at
        ) VALUES (
            p_predecessor_id, p_successor_id, p_relationship_type,
            p_valid_from_year, p_valid_to_year, nullif(btrim(p_description_ru), ''),
            v_source_id, p_review_status, CASE WHEN p_review_status = 'candidate' THEN NULL ELSE now() END
        ) RETURNING id INTO v_id;
    ELSE
        UPDATE atlas.constructor_lineage_links SET
            predecessor_constructor_id = p_predecessor_id,
            successor_constructor_id = p_successor_id,
            relationship_type = p_relationship_type,
            valid_from_year = p_valid_from_year,
            valid_to_year = p_valid_to_year,
            description_ru = nullif(btrim(p_description_ru), ''),
            source_id = v_source_id,
            review_status = p_review_status,
            verified_at = CASE WHEN p_review_status = 'candidate' THEN NULL ELSE now() END,
            updated_at = now()
        WHERE id = p_id RETURNING id INTO v_id;
    END IF;

    RETURN jsonb_build_object('id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_delete_constructor_lineage(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_id bigint;
BEGIN
    DELETE FROM atlas.constructor_lineage_links WHERE id = p_id RETURNING id INTO v_id;
    RETURN jsonb_build_object('id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_save_constructor_entry(integer, text, text, text, text, text, text, text)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION atlas.admin_save_constructor_lineage(bigint, text, text, text, integer, integer, text, text, text, text)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION atlas.admin_delete_constructor_lineage(bigint)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_save_constructor_entry(integer, text, text, text, text, text, text, text)
    TO service_role;
GRANT EXECUTE ON FUNCTION atlas.admin_save_constructor_lineage(bigint, text, text, text, integer, integer, text, text, text, text)
    TO service_role;
GRANT EXECUTE ON FUNCTION atlas.admin_delete_constructor_lineage(bigint)
    TO service_role;

COMMIT;
