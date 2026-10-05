BEGIN;

CREATE OR REPLACE VIEW atlas.admin_circuit_directory
WITH (security_invoker = true)
AS
WITH race_summary AS (
    SELECT circuit_id, min(season_year)::integer AS first_season,
           max(season_year)::integer AS last_season, count(*)::integer AS races,
           count(*) FILTER (WHERE layout_id IS NULL)::integer AS unassigned_races
    FROM atlas.races GROUP BY circuit_id
), layout_summary AS (
    SELECT circuit_id, count(*)::integer AS layout_count,
           count(*) FILTER (WHERE review_status IN ('reviewed', 'published'))::integer AS reviewed_layouts,
           count(*) FILTER (WHERE review_status IN ('reviewed', 'published')
               AND centerline IS NOT NULL AND source_id IS NOT NULL
               AND provenance_type <> 'unknown')::integer AS verified_layouts,
           count(*) FILTER (WHERE review_status IN ('candidate', 'rejected')
               OR centerline IS NULL OR source_id IS NULL
               OR provenance_type = 'unknown')::integer AS unresolved_layouts
    FROM atlas.track_layouts GROUP BY circuit_id
), content_summary AS (
    SELECT circuit.id AS circuit_id,
           (SELECT count(*)::integer FROM atlas.circuit_page_stats AS item
            WHERE item.circuit_id = circuit.id) AS stats_count,
           (SELECT count(*)::integer FROM atlas.circuit_history_entries AS item
            WHERE item.circuit_id = circuit.id) AS history_count,
           ((SELECT count(*) FROM atlas.circuit_media_gallery AS item
             WHERE item.circuit_id = circuit.id)
             + (SELECT count(*) FROM atlas.media_assets AS item
                WHERE item.entity_type = 'circuit' AND item.entity_id = circuit.id
                  AND item.media_type = 'image' AND item.usage_role = 'catalog_card'))::integer AS media_count,
           (SELECT count(*)::integer FROM atlas.track_layout_annotations AS item
            JOIN atlas.track_layouts AS item_layout ON item_layout.id = item.layout_id
            WHERE item_layout.circuit_id = circuit.id) AS annotation_count,
           (SELECT count(DISTINCT item.field_name)::integer
            FROM atlas.circuit_page_profile_field_sources AS item
            WHERE item.circuit_id = circuit.id AND item.editorial_status = 'verified'
              AND item.verified_at IS NOT NULL AND item.field_name = ANY(ARRAY[
                'slug', 'geometry_id', 'name_ru', 'city_ru', 'country_ru',
                'summary_ru', 'circuit_type_ru'
              ])) AS verified_profile_fields
    FROM atlas.circuits AS circuit
), base_directory AS (
    SELECT circuit.id, circuit.name, circuit.short_name, circuit.country_code,
           circuit.circuit_type, profile.name_ru, profile.city_ru, profile.country_ru,
           profile.slug, profile.editorial_status,
           race.first_season, race.last_season, coalesce(race.races, 0)::integer AS races,
           coalesce(race.unassigned_races, 0)::integer AS unassigned_races,
           coalesce(layout.layout_count, 0)::integer AS layout_count,
           coalesce(layout.reviewed_layouts, 0)::integer AS reviewed_layouts,
           coalesce(layout.verified_layouts, 0)::integer AS verified_layouts,
           coalesce(layout.unresolved_layouts, 0)::integer AS unresolved_layouts,
           content.stats_count, content.history_count, content.media_count,
           content.annotation_count,
           (profile.circuit_id IS NOT NULL AND profile.slug IS NOT NULL
            AND profile.name_ru IS NOT NULL AND profile.city_ru IS NOT NULL
            AND profile.country_ru IS NOT NULL AND profile.summary_ru IS NOT NULL
            AND profile.circuit_type_ru IS NOT NULL AND profile.source_id IS NOT NULL
            AND content.verified_profile_fields = 7) AS core_ready
    FROM atlas.circuits AS circuit
    LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id
    LEFT JOIN race_summary AS race ON race.circuit_id = circuit.id
    LEFT JOIN layout_summary AS layout ON layout.circuit_id = circuit.id
    JOIN content_summary AS content ON content.circuit_id = circuit.id
)
SELECT base_directory.*,
       round(100.0 * ((core_ready::integer) + (verified_layouts > 0)::integer
           + (unassigned_races = 0)::integer + (stats_count > 0)::integer
           + (history_count > 0)::integer + (media_count > 0)::integer
           + (annotation_count > 0)::integer) / 7)::integer AS completeness_percent,
       array_remove(ARRAY[
           CASE WHEN NOT core_ready THEN 'profile' END,
           CASE WHEN verified_layouts = 0 THEN 'geometry' END,
           CASE WHEN unassigned_races > 0 THEN 'assignments' END,
           CASE WHEN stats_count = 0 THEN 'stats' END,
           CASE WHEN history_count = 0 THEN 'history' END,
           CASE WHEN media_count = 0 THEN 'media' END,
           CASE WHEN annotation_count = 0 THEN 'annotations' END
       ], NULL) AS missing_areas
FROM base_directory;

CREATE OR REPLACE VIEW atlas.admin_circuit_details
WITH (security_invoker = true)
AS
SELECT circuit.id, circuit.name, circuit.short_name, circuit.locality,
       circuit.country_code, circuit.circuit_type,
       ST_X(circuit.location::geometry) AS longitude,
       ST_Y(circuit.location::geometry) AS latitude,
       circuit.opened_year, circuit.website_url, circuit.source_id AS circuit_source_id,
       circuit.updated_at, profile.slug, profile.geometry_id, profile.name_ru,
       profile.city_ru, profile.country_ru, profile.summary_ru, profile.circuit_type_ru,
       profile.editorial_status, profile.source_id AS profile_source_id,
       source.url AS profile_source_url
FROM atlas.circuits AS circuit
LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id
LEFT JOIN atlas.data_sources AS source ON source.id = profile.source_id;

CREATE OR REPLACE VIEW atlas.admin_circuit_layouts
WITH (security_invoker = true)
AS
SELECT layout.id, layout.circuit_id, layout.name, layout.valid_from_year,
       layout.valid_to_year, layout.length_m, layout.turns, layout.direction,
       layout.elevation_min_m, layout.elevation_max_m, layout.provenance_type,
       layout.centerline IS NOT NULL AS has_geometry,
       ST_AsGeoJSON(layout.centerline) AS centerline_geojson,
       layout.review_status, layout.verified_at, source.url AS source_url,
       (SELECT count(*)::integer FROM atlas.races AS race
        WHERE race.layout_id = layout.id AND race.circuit_id = layout.circuit_id) AS race_count
FROM atlas.track_layouts AS layout
LEFT JOIN atlas.data_sources AS source ON source.id = layout.source_id;

CREATE OR REPLACE VIEW atlas.admin_circuit_card_media
WITH (security_invoker = true)
AS
SELECT asset.entity_id AS circuit_id, asset.id,
       coalesce(card.url, asset.url) AS url, asset.alt_text_ru,
       asset.author, asset.licence, asset.source_url, asset.rights_status,
       asset.review_status, asset.is_primary, asset.verified_at
FROM atlas.media_assets AS asset
LEFT JOIN atlas.media_asset_derivatives AS card
    ON card.media_asset_id = asset.id AND card.variant = 'card'
WHERE asset.entity_type = 'circuit' AND asset.media_type = 'image'
  AND asset.usage_role = 'catalog_card';

REVOKE ALL ON atlas.admin_circuit_directory, atlas.admin_circuit_details,
    atlas.admin_circuit_layouts, atlas.admin_circuit_card_media
    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON atlas.admin_circuit_directory, atlas.admin_circuit_details,
    atlas.admin_circuit_layouts, atlas.admin_circuit_card_media TO service_role;

COMMIT;
