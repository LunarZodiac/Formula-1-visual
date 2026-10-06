BEGIN;

CREATE OR REPLACE VIEW atlas.admin_driver_detail
WITH (security_invoker = true)
AS
SELECT driver.id, driver.given_name, driver.family_name,
       driver.abbreviation, driver.permanent_number, driver.nationality,
       driver.source_id AS driver_source_id, driver.updated_at AS driver_updated_at,
       driver.date_of_birth AS birth_date,
       profile.name_ru, profile.birth_place_ru, profile.death_date,
       profile.height_cm, profile.weight_kg, profile.biography_ru,
       coalesce(profile.review_status, 'candidate') AS review_status,
       profile.source_id AS profile_source_id, profile.updated_at AS profile_updated_at,
       name_source.review_status AS name_ru_review_status,
       name_source.source_id AS name_ru_source_id,
       name_source.source_url AS name_ru_source_url,
       name_source.notes AS name_ru_source_note,
       photo.url AS photo_url, photo.alt_text_ru AS photo_alt_text_ru,
       photo.author AS photo_author, photo.licence AS photo_licence,
       photo.source_url AS photo_source_url, photo.rights_status AS photo_rights_status,
       photo.review_status AS photo_review_status,
       coalesce(nicknames.items, '[]'::jsonb) AS nicknames,
       coalesce(quotes.items, '[]'::jsonb) AS quotes
FROM atlas.drivers AS driver
LEFT JOIN atlas.driver_profiles AS profile ON profile.driver_id = driver.id
LEFT JOIN LATERAL (
    SELECT item.review_status, item.source_id, item.source_url, item.notes
    FROM atlas.driver_profile_field_sources AS item
    WHERE item.driver_id = driver.id AND item.field_name = 'name_ru'
    ORDER BY item.retrieved_at DESC,
      CASE item.review_status
        WHEN 'verified' THEN 1 WHEN 'reviewed' THEN 2 WHEN 'candidate' THEN 3 ELSE 4 END,
      item.source_id
    LIMIT 1
) AS name_source ON true
LEFT JOIN LATERAL (
    SELECT asset.url, asset.alt_text_ru, asset.author, asset.licence,
           asset.source_url, asset.rights_status, asset.review_status
    FROM atlas.media_assets AS asset
    WHERE asset.entity_type = 'driver' AND asset.entity_id = driver.id
      AND asset.media_type = 'image' AND asset.usage_role = 'portrait' AND asset.is_primary
    ORDER BY asset.verified_at DESC NULLS LAST, asset.id
    LIMIT 1
) AS photo ON true
LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id', item.id::text, 'nameRu', item.name_ru, 'nameOriginal', item.name_original,
      'contextRu', item.context_ru, 'sourceUrl', item.source_url,
      'reviewStatus', item.review_status
    ) ORDER BY item.sort_order, item.id) AS items
    FROM atlas.driver_nicknames AS item WHERE item.driver_id = driver.id
) AS nicknames ON true
LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id', item.id::text, 'quoteRu', item.quote_ru, 'quoteOriginal', item.quote_original,
      'attributionRu', item.attribution_ru, 'contextRu', item.context_ru,
      'quoteDate', item.quote_date, 'sourceUrl', item.source_url,
      'reviewStatus', item.review_status
    ) ORDER BY item.sort_order, item.id) AS items
    FROM atlas.driver_quotes AS item WHERE item.driver_id = driver.id
) AS quotes ON true;

REVOKE ALL ON atlas.admin_driver_detail FROM PUBLIC, anon, authenticated;
GRANT SELECT ON atlas.admin_driver_detail TO service_role;

COMMIT;
