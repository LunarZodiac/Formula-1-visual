BEGIN;

CREATE OR REPLACE FUNCTION atlas.admin_travel_directory(
  p_query text DEFAULT '', p_page integer DEFAULT 1, p_limit integer DEFAULT 30
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_query text := left(btrim(coalesce(p_query, '')), 120);
  v_count integer;
  v_rows jsonb;
  v_summary jsonb;
  v_categories jsonb;
  v_imports jsonb;
BEGIN
  IF p_page IS NULL OR p_page < 1 OR p_page > 100000
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Некорректные параметры туристического реестра';
  END IF;
  SELECT count(*)::integer INTO v_count FROM atlas.circuits c
  LEFT JOIN atlas.circuit_page_profiles page ON page.circuit_id = c.id
  WHERE v_query = '' OR c.id ILIKE '%' || v_query || '%'
    OR c.name ILIKE '%' || v_query || '%'
    OR coalesce(page.name_ru, '') ILIKE '%' || v_query || '%';

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', row.id, 'name', row.name, 'slug', row.slug,
    'editorialStatus', row.editorial_status,
    'pointCount', row.point_count, 'publishedPointCount', row.published_point_count,
    'candidatePointCount', row.candidate_point_count, 'stayPointCount', row.stay_point_count,
    'zoneCount', row.zone_count, 'routeCount', row.route_count,
    'publishedRouteCount', row.published_route_count
  ) ORDER BY pg_catalog.lower(row.name), row.id), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT c.id, coalesce(page.name_ru, c.short_name, c.name) AS name, page.slug,
      travel.editorial_status,
      coalesce(points.total, 0) AS point_count,
      coalesce(points.published, 0) AS published_point_count,
      coalesce(points.candidates, 0) AS candidate_point_count,
      coalesce(points.stays, 0) AS stay_point_count,
      coalesce(zones.total, 0) AS zone_count,
      coalesce(routes.total, 0) AS route_count,
      coalesce(routes.published, 0) AS published_route_count
    FROM atlas.circuits c
    LEFT JOIN atlas.circuit_page_profiles page ON page.circuit_id = c.id
    LEFT JOIN atlas.circuit_travel_profiles travel ON travel.circuit_id = c.id
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS total,
        count(*) FILTER (WHERE poi.review_status = 'published')::integer AS published,
        count(*) FILTER (WHERE poi.review_status = 'candidate')::integer AS candidates,
        count(*) FILTER (WHERE category.group_id = 'stay')::integer AS stays
      FROM atlas.circuit_travel_pois link
      JOIN atlas.tourism_pois poi ON poi.id = link.poi_id
      JOIN atlas.poi_categories category ON category.id = poi.category_id
      WHERE link.circuit_id = c.id
    ) points ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS total FROM atlas.travel_zones z
      WHERE z.circuit_id = c.id AND z.review_status <> 'hidden'
    ) zones ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS total,
        count(*) FILTER (WHERE r.review_status = 'published')::integer AS published
      FROM atlas.travel_routes r
      WHERE r.circuit_id = c.id AND r.review_status <> 'hidden'
    ) routes ON true
    WHERE v_query = '' OR c.id ILIKE '%' || v_query || '%'
      OR c.name ILIKE '%' || v_query || '%'
      OR coalesce(page.name_ru, '') ILIKE '%' || v_query || '%'
    ORDER BY pg_catalog.lower(coalesce(page.name_ru, c.short_name, c.name)), c.id
    LIMIT p_limit OFFSET (p_page - 1) * p_limit
  ) row;

  SELECT pg_catalog.jsonb_build_object(
    'circuits', (SELECT count(*) FROM atlas.circuits),
    'points', (SELECT count(*) FROM atlas.tourism_pois WHERE review_status <> 'hidden'),
    'publishedPoints', (SELECT count(*) FROM atlas.tourism_pois WHERE review_status = 'published'),
    'zones', (SELECT count(*) FROM atlas.travel_zones WHERE review_status <> 'hidden'),
    'routes', (SELECT count(*) FROM atlas.travel_routes WHERE review_status <> 'hidden')
  ) INTO v_summary;

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', g.id, 'name', g.name_ru, 'colour', g.marker_colour,
    'categories', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', category.id, 'name', category.name_ru, 'icon', category.icon,
      'minZoom', category.min_zoom, 'clustered', category.is_clustered
    ) ORDER BY category.default_priority DESC, category.name_ru)
    FROM atlas.poi_categories category WHERE category.group_id = g.id), '[]'::jsonb)
  ) ORDER BY g.sort_order), '[]'::jsonb) INTO v_categories
  FROM atlas.travel_category_groups g;

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', run.id, 'circuitId', run.circuit_id,
    'circuitName', coalesce(profile.name_ru, circuit.short_name, circuit.name),
    'provider', run.provider, 'status', run.status,
    'discoveredCount', run.discovered_count, 'importedCount', run.imported_count,
    'failedGroups', run.failed_groups, 'createdAt', run.created_at,
    'expiresAt', run.expires_at, 'appliedAt', run.applied_at,
    'errorMessage', run.error_message
  ) ORDER BY run.created_at DESC), '[]'::jsonb) INTO v_imports
  FROM (SELECT * FROM atlas.travel_import_runs ORDER BY created_at DESC LIMIT 10) run
  JOIN atlas.circuits circuit ON circuit.id = run.circuit_id
  LEFT JOIN atlas.circuit_page_profiles profile ON profile.circuit_id = circuit.id;

  RETURN pg_catalog.jsonb_build_object('rows', v_rows, 'filteredCount', v_count,
    'page', p_page, 'limit', p_limit, 'summary', v_summary,
    'categoryGroups', v_categories, 'recentImports', v_imports);
END;
$$;

CREATE OR REPLACE FUNCTION atlas.admin_save_travel_category_icon(p_id text, p_icon text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_row atlas.poi_categories%ROWTYPE;
BEGIN
  IF p_icon IS NULL OR (p_icon !~ '^[a-z][a-z0-9-]{0,39}$'
    AND p_icon !~ '^https://[^/?#@]+/storage/v1/object/public/[^?#]+\.webp$') THEN
    RAISE EXCEPTION 'Некорректный значок категории';
  END IF;
  UPDATE atlas.poi_categories SET icon = p_icon WHERE id = p_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Категория не найдена'; END IF;
  RETURN pg_catalog.jsonb_build_object('id', v_row.id,
    'name', v_row.name_ru, 'icon', v_row.icon);
END;
$$;

REVOKE ALL ON FUNCTION atlas.admin_travel_directory(text, integer, integer),
  atlas.admin_save_travel_category_icon(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atlas.admin_travel_directory(text, integer, integer),
  atlas.admin_save_travel_category_icon(text, text) TO service_role;

COMMIT;
