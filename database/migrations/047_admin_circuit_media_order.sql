BEGIN;

CREATE OR REPLACE VIEW atlas.admin_circuit_media_history
WITH (security_invoker = true)
AS
SELECT entry.circuit_id, entry.id, entry.sort_order, entry.year_label,
       entry.title_ru, entry.description_ru, media.id AS media_asset_id,
       media.url, media.alt_text_ru, media.rights_status, media.review_status
FROM atlas.circuit_history_entries AS entry
LEFT JOIN atlas.media_assets AS media ON media.id = entry.media_asset_id;

CREATE OR REPLACE VIEW atlas.admin_circuit_media_gallery
WITH (security_invoker = true)
AS
SELECT gallery.circuit_id, gallery.media_asset_id AS id,
       gallery.sort_order, NULL::text AS year_label,
       gallery.title_ru, gallery.description_ru,
       NULL::text AS media_asset_id, media.url, media.alt_text_ru,
       media.rights_status, media.review_status
FROM atlas.circuit_media_gallery AS gallery
JOIN atlas.media_assets AS media ON media.id = gallery.media_asset_id;

REVOKE ALL ON atlas.admin_circuit_media_history, atlas.admin_circuit_media_gallery
    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON atlas.admin_circuit_media_history, atlas.admin_circuit_media_gallery
    TO service_role;

CREATE OR REPLACE FUNCTION atlas.admin_reorder_circuit_media(
    p_circuit_id text, p_section text, p_ordered_ids text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_table text;
    v_column text;
    v_existing text[];
    v_maximum integer;
    v_base integer;
    v_slug text;
BEGIN
    IF p_circuit_id IS NULL OR p_circuit_id !~ '^[A-Za-z0-9_-]+$'
       OR p_section IS NULL OR p_section NOT IN ('history', 'gallery')
       OR p_ordered_ids IS NULL OR cardinality(p_ordered_ids) = 0
       OR EXISTS (SELECT 1 FROM unnest(p_ordered_ids) AS id
                  WHERE id IS NULL OR btrim(id) = '')
       OR (SELECT count(DISTINCT id) FROM unnest(p_ordered_ids) AS id)
          <> cardinality(p_ordered_ids) THEN
        RAISE EXCEPTION 'Некорректный порядок материалов трассы';
    END IF;
    IF p_section = 'history' THEN
        v_table := 'atlas.circuit_history_entries';
        v_column := 'id';
    ELSE
        v_table := 'atlas.circuit_media_gallery';
        v_column := 'media_asset_id';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('circuit-media:' || p_section || ':' || p_circuit_id));
    EXECUTE format('WITH locked AS (SELECT %I::text AS id FROM %s WHERE circuit_id = $1 FOR UPDATE)
        SELECT array_agg(id), count(*) FROM locked', v_column, v_table)
    INTO v_existing, v_maximum USING p_circuit_id;
    IF coalesce(cardinality(v_existing), 0) <> cardinality(p_ordered_ids)
       OR EXISTS (SELECT 1 FROM unnest(v_existing) AS id
                  WHERE id <> ALL(p_ordered_ids)) THEN
        RAISE EXCEPTION 'Набор материалов изменился. Обновите страницу';
    END IF;
    EXECUTE format('SELECT coalesce(max(sort_order), 0)::integer FROM %s', v_table)
    INTO v_maximum;
    v_base := v_maximum + cardinality(p_ordered_ids) + 1;
    IF v_base + cardinality(p_ordered_ids) > 32767 THEN
        RAISE EXCEPTION 'Не удалось выделить временный диапазон сортировки';
    END IF;
    EXECUTE format('UPDATE %s SET sort_order = $3 + array_position($2, %I::text)
        WHERE circuit_id = $1 AND %I::text = ANY($2)', v_table, v_column, v_column)
    USING p_circuit_id, p_ordered_ids, v_base;
    EXECUTE format('UPDATE %s SET sort_order = array_position($2, %I::text) - 1
        WHERE circuit_id = $1 AND %I::text = ANY($2)', v_table, v_column, v_column)
    USING p_circuit_id, p_ordered_ids;
    SELECT slug INTO v_slug FROM atlas.circuit_page_profiles WHERE circuit_id = p_circuit_id;
    RETURN jsonb_build_object('section', p_section,
        'slug', coalesce(v_slug, p_circuit_id), 'publicDataSynced', false);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_reorder_circuit_media(text, text, text[])
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_reorder_circuit_media(text, text, text[])
    TO service_role;

COMMIT;
