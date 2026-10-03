#!/usr/bin/env node

import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { serializePublicTrackAnnotation } from './lib/public-track-annotation.mjs';

const { Client } = pg;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const outputDirectory = path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'circuit-pages');

function readOptions(argv) {
  const inlineCircuit = argv.find((value) => value.startsWith('--circuit='));
  const circuitIndex = argv.indexOf('--circuit');
  return {
    circuitId: inlineCircuit?.slice('--circuit='.length)
      ?? (circuitIndex >= 0 ? argv[circuitIndex + 1] : null),
    checkOnly: argv.includes('--check'),
  };
}

function assertDatabaseEnvironment() {
  const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function semanticJson(value) {
  return JSON.stringify(canonicalize(value));
}

async function readPageData(client, circuitId) {
  const profileResult = await client.query(
      `SELECT
         profile.circuit_id,
         profile.slug,
         profile.geometry_id,
         profile.name_ru,
         profile.city_ru,
         profile.country_ru,
         profile.summary_ru,
         profile.circuit_type_ru,
         circuit.name AS official_name,
         lower(circuit.country_code) AS country_code,
         ST_X(circuit.location::geometry) AS longitude,
         ST_Y(circuit.location::geometry) AS latitude
       FROM atlas.circuit_page_profiles AS profile
       JOIN atlas.circuits AS circuit ON circuit.id = profile.circuit_id
       WHERE profile.circuit_id = $1
         AND profile.editorial_status = 'published'`,
      [circuitId],
    );
  const statsResult = await client.query(
      `SELECT section, label_ru, value_ru, note_ru, icon
       FROM atlas.circuit_page_stats
       WHERE circuit_id = $1
       ORDER BY section, sort_order`,
      [circuitId],
    );
  const historyResult = await client.query(
      `SELECT
         entry.year_label,
         entry.title_ru,
         entry.description_ru,
         media.url,
         media.alt_text_ru,
         media.author,
         media.licence,
         media.source_url,
         (SELECT url FROM atlas.media_asset_derivatives WHERE media_asset_id = media.id AND variant = '640w') AS image_640,
         (SELECT url FROM atlas.media_asset_derivatives WHERE media_asset_id = media.id AND variant = '1280w') AS image_1280,
         (SELECT url FROM atlas.media_asset_derivatives WHERE media_asset_id = media.id AND variant = '1920w') AS image_1920
       FROM atlas.circuit_history_entries AS entry
       LEFT JOIN atlas.media_assets AS media ON media.id = entry.media_asset_id
       WHERE entry.circuit_id = $1
       ORDER BY entry.sort_order`,
      [circuitId],
    );
  const galleryResult = await client.query(
      `SELECT
         gallery.title_ru,
         gallery.description_ru,
         media.url,
         media.author,
         media.licence,
         media.source_url,
         (SELECT url FROM atlas.media_asset_derivatives WHERE media_asset_id = media.id AND variant = '640w') AS image_640,
         (SELECT url FROM atlas.media_asset_derivatives WHERE media_asset_id = media.id AND variant = '1280w') AS image_1280,
         (SELECT url FROM atlas.media_asset_derivatives WHERE media_asset_id = media.id AND variant = '1920w') AS image_1920
       FROM atlas.circuit_media_gallery AS gallery
       JOIN atlas.media_assets AS media ON media.id = gallery.media_asset_id
       WHERE gallery.circuit_id = $1
       ORDER BY gallery.sort_order`,
      [circuitId],
    );
  const runtimeSettingsResult = await client.query(
    `SELECT
       map.track_max_zoom,
       map.track_pitch,
       map.track_bearing,
       map.track_padding,
       ST_XMin(Box3D(map.travel_bounds)) AS travel_west,
       ST_YMin(Box3D(map.travel_bounds)) AS travel_south,
       ST_XMax(Box3D(map.travel_bounds)) AS travel_east,
       ST_YMax(Box3D(map.travel_bounds)) AS travel_north,
       map.travel_zoom,
       flags.technical_overlay,
       flags.travel_mode,
       flags.local_3d_model,
       flags.buildings_3d,
       results.default_season
     FROM atlas.circuit_page_map_settings AS map
     JOIN atlas.circuit_page_feature_flags AS flags USING (circuit_id)
     JOIN atlas.circuit_page_result_settings AS results USING (circuit_id)
     WHERE map.circuit_id = $1`,
    [circuitId],
  );
  const resultSeasonsResult = await client.query(
    `SELECT DISTINCT season_year
     FROM atlas.races
     WHERE circuit_id = $1
     ORDER BY season_year DESC`,
    [circuitId],
  );
  const trackLayoutsResult = await client.query(
    `SELECT layout.id, layout.name, layout.valid_from_year, layout.valid_to_year,
            ST_AsGeoJSON(ST_Force2D(layout.centerline))::json AS centerline
     FROM atlas.track_layouts AS layout
     WHERE layout.circuit_id = $1
       AND layout.centerline IS NOT NULL
       AND layout.review_status IN ('reviewed', 'published')
     ORDER BY layout.valid_from_year NULLS FIRST, layout.id`,
    [circuitId],
  );
  const trackAnnotationsResult = await client.query(
    `SELECT annotation.id, annotation.layout_id, annotation.annotation_type,
            annotation.label_ru, annotation.label_original, annotation.sequence,
            annotation.description_ru, annotation.valid_from_year, annotation.valid_to_year,
            annotation.properties->'calloutPoint' AS callout_point,
            ST_AsGeoJSON(annotation.geometry::geometry)::json AS geometry,
            source.name AS source_name, source.url AS source_url
     FROM atlas.track_layout_annotations AS annotation
     JOIN atlas.track_layouts AS layout ON layout.id = annotation.layout_id
     JOIN atlas.data_sources AS source ON source.id = annotation.source_id
     WHERE layout.circuit_id = $1
       AND layout.review_status IN ('reviewed', 'published')
       AND annotation.review_status = 'published'
     ORDER BY annotation.layout_id, annotation.annotation_type, annotation.sequence NULLS LAST, annotation.id`,
    [circuitId],
  );
  const seasonLayoutsResult = await client.query(
    `SELECT DISTINCT ON (race.season_year) race.season_year, race.layout_id
     FROM atlas.races AS race
     JOIN atlas.track_layouts AS layout
       ON layout.id = race.layout_id AND layout.circuit_id = race.circuit_id
     WHERE race.circuit_id = $1
       AND layout.centerline IS NOT NULL
       AND layout.review_status IN ('reviewed', 'published')
     ORDER BY race.season_year, race.round`,
    [circuitId],
  );
  const travelProfileResult = await client.query(
    `SELECT page_intro_ru, source_note_ru, route_note_ru
     FROM atlas.circuit_travel_profiles
     WHERE circuit_id = $1`,
    [circuitId],
  );
  const travelStatsResult = await client.query(
    `SELECT value_ru, label_ru
     FROM atlas.circuit_travel_story_stats
     WHERE circuit_id = $1
     ORDER BY sort_order`,
    [circuitId],
  );
  const travelChaptersResult = await client.query(
    `SELECT chapter.id, chapter.display_index, chapter.eyebrow_ru, chapter.title_ru,
            chapter.description_ru,
            COALESCE(array_agg(feature.feature_id ORDER BY feature.sort_order)
              FILTER (WHERE feature.feature_id IS NOT NULL), ARRAY[]::text[]) AS feature_ids
     FROM atlas.circuit_travel_story_chapters AS chapter
     LEFT JOIN atlas.circuit_travel_story_chapter_features AS feature
       ON feature.chapter_id = chapter.id
     WHERE chapter.circuit_id = $1
     GROUP BY chapter.id, chapter.sort_order
     ORDER BY chapter.sort_order`,
    [circuitId],
  );
  const travelPlannerResult = await client.query(
    `SELECT label_ru, value_ru, detail_ru
     FROM atlas.circuit_travel_planner_items
     WHERE circuit_id = $1
     ORDER BY sort_order`,
    [circuitId],
  );
  const travelZonesResult = await client.query(
    `SELECT zone.id, zone.name_ru, zone.best_for, presentation.character_ru,
            presentation.travel_time_ru, presentation.tone
     FROM atlas.travel_zones AS zone
     JOIN atlas.circuit_travel_zone_presentations AS presentation ON presentation.zone_id = zone.id
     WHERE zone.circuit_id = $1
       AND zone.review_status IN ('reviewed', 'published')
     ORDER BY presentation.sort_order`,
    [circuitId],
  );
  const travelRoutesResult = await client.query(
    `SELECT route.id,route.route_type,route.name_ru,route.summary_ru,route.distance_m,route.duration_minutes,
            route.route_variant_kind,route.display_priority,route.geometry_mode,
            presentation.rationale_ru,presentation.highlights_ru,presentation.practical_notes_ru,
            COALESCE(array_agg(COALESCE(stop.name_ru,poi.name_ru,poi.name) ORDER BY stop.sequence)
              FILTER (WHERE stop.sequence IS NOT NULL),ARRAY[]::text[]) AS stops
     FROM atlas.travel_routes AS route
     JOIN atlas.travel_route_presentations AS presentation ON presentation.route_id=route.id
     LEFT JOIN atlas.travel_route_stops AS stop ON stop.route_id=route.id
     LEFT JOIN atlas.tourism_pois AS poi ON poi.id=stop.poi_id
     WHERE route.circuit_id=$1 AND route.review_status='published' AND route.lifecycle='active'
     GROUP BY route.id,presentation.rationale_ru,presentation.highlights_ru,presentation.practical_notes_ru,presentation.sort_order
     ORDER BY route.display_priority DESC,presentation.sort_order`,[circuitId]);
  const travelCategoriesResult = await client.query(
    `SELECT id, name_ru
     FROM atlas.travel_category_groups
     WHERE id IN ('transport', 'stay', 'explore')
     ORDER BY sort_order`,
  );
  const travelPointsResult = await client.query(
    `SELECT * FROM (
       SELECT 'circuit'::text AS id, profile.name_ru, 'Трасса'::text AS kind_ru,
              profile.summary_ru AS description_ru,
              ST_X(circuit.location::geometry) AS longitude,
              ST_Y(circuit.location::geometry) AS latitude,
              'circuit'::text AS role, 1000::integer AS priority,
              NULL::text AS image_url, NULL::text AS image_alt_ru
       FROM atlas.circuit_page_profiles AS profile
       JOIN atlas.circuits AS circuit ON circuit.id = profile.circuit_id
       WHERE profile.circuit_id = $1
       UNION ALL
       SELECT poi.id, COALESCE(poi.name_ru, poi.name), category.name_ru,
              COALESCE(poi.description_ru, travel.editorial_note_ru, category.name_ru),
              ST_X(poi.location::geometry), ST_Y(poi.location::geometry),
              travel.role, travel.priority, photo.image_url, photo.image_alt_ru
       FROM atlas.circuit_travel_pois AS travel
       JOIN atlas.tourism_pois AS poi ON poi.id = travel.poi_id
       JOIN atlas.poi_categories AS category ON category.id = poi.category_id
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(
             (SELECT derivative.url
              FROM atlas.media_asset_derivatives AS derivative
              WHERE derivative.media_asset_id = media.id
              ORDER BY CASE derivative.variant WHEN '640w' THEN 0 WHEN '1280w' THEN 1 ELSE 2 END
              LIMIT 1),
             media.url
           ) AS image_url,
           media.alt_text_ru AS image_alt_ru
         FROM atlas.media_assets AS media
         WHERE media.entity_type = 'tourism_poi'
           AND media.entity_id = poi.id
           AND media.media_type = 'image'
           AND media.rights_status = 'verified'
           AND media.review_status = 'published'
         ORDER BY media.is_primary DESC,
                  CASE media.usage_role WHEN 'card' THEN 0 WHEN 'gallery' THEN 1 ELSE 2 END,
                  media.id
         LIMIT 1
       ) AS photo ON true
       WHERE travel.circuit_id = $1
         AND travel.role <> 'circuit'
         AND travel.is_featured
         AND poi.source_id IS NOT NULL
         AND poi.review_status IN ('reviewed', 'published')
     ) AS points
     ORDER BY priority DESC, id`,
    [circuitId],
  );

  if (profileResult.rowCount !== 1) {
    throw new Error(`Опубликованный профиль страницы трассы ${circuitId} не найден`);
  }
  if (runtimeSettingsResult.rowCount !== 1) {
    throw new Error(`Настройки карты, результатов или функций ${circuitId} заполнены не полностью`);
  }
  const runtimeSettings = runtimeSettingsResult.rows[0];
  const resultSeasons = resultSeasonsResult.rows.map((row) => Number(row.season_year));
  if (!resultSeasons.includes(Number(runtimeSettings.default_season))) {
    throw new Error(`Сезон по умолчанию ${runtimeSettings.default_season} отсутствует у трассы ${circuitId}`);
  }
  const mediaUrls = [
    ...historyResult.rows.map((item) => item.url),
    ...galleryResult.rows.map((item) => item.url),
  ].filter(Boolean);
  const duplicatedMediaUrls = mediaUrls.filter((url, index) => mediaUrls.indexOf(url) !== index);
  if (duplicatedMediaUrls.length > 0) {
    throw new Error(`На странице ${circuitId} повторяются медиа: ${[...new Set(duplicatedMediaUrls)].join(', ')}`);
  }
  const profile = profileResult.rows[0];
  const stats = statsResult.rows;
  return {
    profile,
    runtimeSettings,
    resultSeasons,
    trackLayouts: trackLayoutsResult.rows,
    trackAnnotations: trackAnnotationsResult.rows,
    seasonLayouts: seasonLayoutsResult.rows,
    highlights: stats.filter((item) => item.section === 'highlight').map((item) => item.label_ru),
    metrics: stats.filter((item) => item.section === 'metric').map((item) => ({
      label: item.label_ru,
      value: item.value_ru,
    })),
    statBar: stats.filter((item) => item.section === 'stat_bar').map((item) => ({
      label: item.label_ru,
      value: item.value_ru,
      ...(item.note_ru ? { note: item.note_ru } : {}),
      ...(item.icon ? { icon: item.icon } : {}),
    })),
    history: historyResult.rows.map((item) => ({
      year: item.year_label,
      title: item.title_ru,
      description: item.description_ru,
      ...(item.url ? { image: item.url } : {}),
      ...(item.image_640 && item.image_1280 && item.image_1920 ? {
        imageSrcSet: `${item.image_640} 640w, ${item.image_1280} 1280w, ${item.image_1920} 1920w`,
      } : {}),
      ...(item.alt_text_ru ? { imageAlt: item.alt_text_ru } : {}),
      ...(item.author ? { credit: item.author } : {}),
      ...(item.licence ? { license: item.licence } : {}),
      ...(item.source_url ? { sourceUrl: item.source_url } : {}),
    })),
    gallery: galleryResult.rows.map((item) => ({
      src: item.url,
      ...(item.image_640 && item.image_1280 && item.image_1920 ? {
        srcSet: `${item.image_640} 640w, ${item.image_1280} 1280w, ${item.image_1920} 1920w`,
        fullSrc: item.image_1920,
      } : {}),
      title: item.title_ru,
      description: item.description_ru,
      ...(item.author ? { credit: item.author } : {}),
      ...(item.licence ? { license: item.licence } : {}),
      ...(item.source_url ? { sourceUrl: item.source_url } : {}),
    })),
    travel: {
      profile: travelProfileResult.rows[0] ?? null,
      stats: travelStatsResult.rows,
      chapters: travelChaptersResult.rows,
      planner: travelPlannerResult.rows,
      zones: travelZonesResult.rows,
      routes: travelRoutesResult.rows,
      categories: travelCategoriesResult.rows,
      points: travelPointsResult.rows,
    },
  };
}

function buildReadModel(existing, databasePage) {
  const {
    profile, runtimeSettings, resultSeasons, trackLayouts, trackAnnotations, seasonLayouts,
    highlights, metrics, statBar, history, gallery, travel,
  } = databasePage;
  if (gallery.length > 0 && !existing.travel?.story) {
    throw new Error(`Для медиатеки ${profile.slug} в snapshot отсутствует travel.story`);
  }
  const readModel = {
    ...existing,
    schemaVersion: 1,
    id: profile.circuit_id,
    slug: profile.slug,
    geometryId: profile.geometry_id,
    nameRu: profile.name_ru,
    officialName: profile.official_name,
    location: {
      cityRu: profile.city_ru,
      countryRu: profile.country_ru,
      countryCode: profile.country_code,
      coordinates: [Number(profile.longitude), Number(profile.latitude)],
    },
    summary: {
      description: profile.summary_ru,
      typeRu: profile.circuit_type_ru,
      highlights,
      statBar,
      metrics,
    },
    map: {
      trackCamera: {
        maxZoom: Number(runtimeSettings.track_max_zoom),
        pitch: Number(runtimeSettings.track_pitch),
        bearing: Number(runtimeSettings.track_bearing),
        padding: Number(runtimeSettings.track_padding),
      },
      travelBounds: [
        [Number(runtimeSettings.travel_west), Number(runtimeSettings.travel_south)],
        [Number(runtimeSettings.travel_east), Number(runtimeSettings.travel_north)],
      ],
      travelZoom: Number(runtimeSettings.travel_zoom),
    },
    results: {
      seasons: resultSeasons,
      defaultSeason: Number(runtimeSettings.default_season),
    },
    features: {
      technicalOverlay: runtimeSettings.technical_overlay,
      travelMode: runtimeSettings.travel_mode,
      local3dModel: runtimeSettings.local_3d_model,
      buildings3d: runtimeSettings.buildings_3d,
    },
    trackPresentation: {
      seasonLayoutIds: Object.fromEntries(
        seasonLayouts.map((item) => [String(item.season_year), item.layout_id]),
      ),
      layouts: trackLayouts.map((layout) => ({
        id: layout.id,
        name: layout.name,
        ...(layout.valid_from_year ? { validFromYear: Number(layout.valid_from_year) } : {}),
        ...(layout.valid_to_year ? { validToYear: Number(layout.valid_to_year) } : {}),
        centerline: { type: 'Feature', properties: { layoutId: layout.id }, geometry: layout.centerline },
        annotations: trackAnnotations
          .filter((annotation) => annotation.layout_id === layout.id)
          .map(serializePublicTrackAnnotation),
      })),
    },
    history,
  };
  if (existing.travel?.story) {
    const existingChapters = new Map(existing.travel.story.chapters.map((item) => [item.id, item]));
    const existingZones = new Map(existing.travel.story.zones.map((item) => [item.id, item]));
    const existingRoutes = new Map(existing.travel.story.routes.map((item) => [item.id, item]));
    const { markers: _legacyMarkers, ...existingStory } = existing.travel.story;
    readModel.travel = {
      ...existing.travel,
      categories: travel.categories.map((item) => ({ id: item.id, label: item.name_ru })),
      points: travel.points.map((item) => ({
        id: item.id,
        name: item.name_ru,
        kindRu: item.kind_ru,
        descriptionRu: item.description_ru,
        coordinates: [Number(item.longitude), Number(item.latitude)],
        role: item.role,
        ...(item.image_url ? { imageUrl: item.image_url } : {}),
        ...(item.image_alt_ru ? { imageAltRu: item.image_alt_ru } : {}),
      })),
      ...(travel.profile?.page_intro_ru ? { intro: travel.profile.page_intro_ru } : {}),
      planner: {
        useful: travel.planner.map((item) => ({
          label: item.label_ru,
          value: item.value_ru,
          detail: item.detail_ru,
        })),
        ...(travel.profile?.source_note_ru ? { sourceNote: travel.profile.source_note_ru } : {}),
        ...(travel.profile?.route_note_ru ? { routeNote: travel.profile.route_note_ru } : {}),
      },
      story: {
        ...existingStory,
        stats: travel.stats.map((item) => ({ value: item.value_ru, label: item.label_ru })),
        chapters: travel.chapters.map((item) => {
          const id = item.id.startsWith(`${profile.circuit_id}-`)
            ? item.id.slice(profile.circuit_id.length + 1)
            : item.id;
          const previous = existingChapters.get(id);
          return {
            id,
            index: item.display_index,
            eyebrow: item.eyebrow_ru,
            title: item.title_ru,
            description: item.description_ru,
            mapFeatureIds: item.feature_ids,
            ...(previous?.image ? { image: previous.image } : {}),
          };
        }),
        zones: travel.zones.map((item) => {
          const id = item.id.startsWith(`${profile.circuit_id}-stay-`)
            ? item.id.slice(`${profile.circuit_id}-stay-`.length)
            : item.id;
          const previous = existingZones.get(id);
          return {
            id,
            mapFeatureId: item.id,
            name: item.name_ru,
            character: item.character_ru,
            travelTime: item.travel_time_ru,
            bestFor: item.best_for.join(', '),
            tone: item.tone,
            ...(previous?.image ? { image: previous.image } : {}),
          };
        }),
        routes: travel.routes.map((item) => {
          const previous = existingRoutes.get(item.id);
          const typeLabels = { arrival: 'Прибытие', race_day: 'Гоночный день', event_shuttle: 'Трансфер', park_and_ride: 'P+R', tourist_half_day: 'Полдня', tourist_full_day: 'Полный день', walking: 'Пешком', scenic_drive: 'Обзорная поездка' };
          return { id:item.id,type:typeLabels[item.route_type] ?? item.route_type,title:item.name_ru,
            variantKind:item.route_variant_kind,displayPriority:Number(item.display_priority),geometryMode:item.geometry_mode,
            distance:`${(Number(item.distance_m)/1000).toLocaleString('ru-RU',{maximumFractionDigits:1})} км`,duration:`${item.duration_minutes} мин`,
            stops:item.stops,description:item.summary_ru ?? item.rationale_ru ?? '',
            ...(item.rationale_ru?{rationale:item.rationale_ru}:{}),...(item.highlights_ru?.length?{highlights:item.highlights_ru}:{}),
            ...(item.practical_notes_ru?{practicalNotes:item.practical_notes_ru}:{}),...(previous?.image?{image:previous.image}:{}) };
        }),
        gallery,
      },
    };
  } else if (travel.profile?.page_intro_ru && existing.travel) {
    readModel.travel = {
      ...existing.travel,
      intro: travel.profile.page_intro_ru,
      categories: travel.categories.map((item) => ({ id: item.id, label: item.name_ru })),
      points: travel.points.map((item) => ({
        id: item.id,
        name: item.name_ru,
        kindRu: item.kind_ru,
        descriptionRu: item.description_ru,
        coordinates: [Number(item.longitude), Number(item.latitude)],
        role: item.role,
        ...(item.image_url ? { imageUrl: item.image_url } : {}),
        ...(item.image_alt_ru ? { imageAltRu: item.image_alt_ru } : {}),
      })),
    };
  }
  return readModel;
}

async function main() {
  assertDatabaseEnvironment();
  const options = readOptions(process.argv.slice(2));
  const client = new Client({ application_name: 'f1-geovisual-atlas-circuit-page-exporter' });
  await client.connect();
  try {
    const profilesResult = await client.query(
      `SELECT circuit_id FROM atlas.circuit_page_profiles
       WHERE editorial_status = 'published'
         AND ($1::text IS NULL OR circuit_id = $1)
       ORDER BY circuit_id`,
      [options.circuitId],
    );
    if (profilesResult.rowCount === 0) {
      throw new Error(options.circuitId
        ? `Опубликованный профиль ${options.circuitId} отсутствует`
        : 'Нет опубликованных профилей страниц трасс');
    }

    let changedFiles = 0;
    for (const { circuit_id: circuitId } of profilesResult.rows) {
      const databasePage = await readPageData(client, circuitId);
      const filePath = path.join(outputDirectory, `${databasePage.profile.slug}.json`);
      const existing = JSON.parse(await readFile(filePath, 'utf8'));
      const readModel = buildReadModel(existing, databasePage);
      const changed = semanticJson(existing) !== semanticJson(readModel);
      if (changed) {
        changedFiles += 1;
        if (!options.checkOnly) await writeJsonAtomic(filePath, readModel);
      }
      console.log(`${databasePage.profile.slug}: ${changed ? 'требуется обновление' : 'актуален'}`);
    }

    if (options.checkOnly && changedFiles > 0) process.exitCode = 1;
    console.log(options.checkOnly
      ? `Проверка страниц трасс: ${changedFiles === 0 ? 'актуальны' : `устарело ${changedFiles}`}`
      : `Обновлено страниц трасс: ${changedFiles}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Ошибка: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
