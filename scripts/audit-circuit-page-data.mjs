#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const snapshotDirectory = path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'circuit-pages');
const outputPath = path.join(repositoryRoot, 'data', 'review', 'circuit-page-data-audit.json');

function assertDatabaseEnvironment() {
  const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);
}

async function readSnapshots() {
  const filenames = (await readdir(snapshotDirectory)).filter((name) => name.endsWith('.json'));
  return Promise.all(filenames.map(async (filename) => {
    const value = JSON.parse(await readFile(path.join(snapshotDirectory, filename), 'utf8'));
    return { filename, id: value.id, slug: value.slug };
  }));
}

async function main() {
  assertDatabaseEnvironment();
  const client = new Client({ application_name: 'f1-geovisual-atlas-circuit-page-audit' });
  await client.connect();
  try {
    const snapshots = await readSnapshots();
    const profilesResult = await client.query(
        `SELECT
           profile.circuit_id,
           profile.slug,
           profile.editorial_status,
           profile.source_id,
           profile.geometry_id IS NOT NULL AS has_geometry_id,
           profile.summary_ru IS NOT NULL AS has_summary,
           profile.circuit_type_ru IS NOT NULL AS has_circuit_type,
           count(DISTINCT stat.section || ':' || stat.sort_order)::integer AS stats,
           count(DISTINCT history.id)::integer AS history_entries,
           count(DISTINCT gallery.media_asset_id)::integer AS gallery_items
         FROM atlas.circuit_page_profiles AS profile
         LEFT JOIN atlas.circuit_page_stats AS stat ON stat.circuit_id = profile.circuit_id
         LEFT JOIN atlas.circuit_history_entries AS history ON history.circuit_id = profile.circuit_id
         LEFT JOIN atlas.circuit_media_gallery AS gallery ON gallery.circuit_id = profile.circuit_id
         GROUP BY profile.circuit_id, profile.slug, profile.editorial_status
         ORDER BY profile.circuit_id`,
      );
    const unsourcedStatsResult = await client.query(
        `SELECT circuit_id, section, sort_order, label_ru
         FROM atlas.circuit_page_stats
         WHERE source_id IS NULL
         ORDER BY circuit_id, section, sort_order`,
      );
    const incompleteMediaResult = await client.query(
        `SELECT id, entity_type, entity_id,
                author IS NULL AS missing_author,
                licence IS NULL AS missing_licence,
                source_url IS NULL AS missing_source_url,
                alt_text_ru IS NULL AS missing_alt_text_ru
         FROM atlas.media_assets
         WHERE id IN (
           SELECT media_asset_id FROM atlas.circuit_history_entries
           UNION
           SELECT media_asset_id FROM atlas.circuit_media_gallery
         )
           AND (author IS NULL OR licence IS NULL OR source_url IS NULL OR alt_text_ru IS NULL)
         ORDER BY id`,
      );
    const duplicateMediaResult = await client.query(
        `WITH page_media AS (
           SELECT history.circuit_id, media.url
           FROM atlas.circuit_history_entries AS history
           JOIN atlas.media_assets AS media ON media.id = history.media_asset_id
           UNION ALL
           SELECT gallery.circuit_id, media.url
           FROM atlas.circuit_media_gallery AS gallery
           JOIN atlas.media_assets AS media ON media.id = gallery.media_asset_id
         )
         SELECT circuit_id, url, count(*)::integer AS uses
         FROM page_media
         GROUP BY circuit_id, url
         HAVING count(*) > 1
         ORDER BY circuit_id, url`,
      );
    const incompleteRuntimeSettingsResult = await client.query(
      `SELECT
         profile.circuit_id,
         map.circuit_id IS NULL AS missing_map_settings,
         flags.circuit_id IS NULL AS missing_feature_flags,
         results.circuit_id IS NULL AS missing_result_settings
       FROM atlas.circuit_page_profiles AS profile
       LEFT JOIN atlas.circuit_page_map_settings AS map USING (circuit_id)
       LEFT JOIN atlas.circuit_page_feature_flags AS flags USING (circuit_id)
       LEFT JOIN atlas.circuit_page_result_settings AS results USING (circuit_id)
       WHERE profile.editorial_status = 'published'
         AND (map.circuit_id IS NULL OR flags.circuit_id IS NULL OR results.circuit_id IS NULL)
      ORDER BY profile.circuit_id`,
    );
    const incompleteTravelEditorialResult = await client.query(
      `SELECT profile.circuit_id,
              travel.circuit_id IS NULL AS missing_travel_profile,
              travel.page_intro_ru IS NULL AS missing_page_intro
       FROM atlas.circuit_page_profiles AS profile
       JOIN atlas.circuit_page_feature_flags AS flags USING (circuit_id)
       LEFT JOIN atlas.circuit_travel_profiles AS travel USING (circuit_id)
       WHERE flags.travel_mode
         AND (travel.circuit_id IS NULL OR travel.page_intro_ru IS NULL)
      ORDER BY profile.circuit_id`,
    );
    const circuitBacklogResult = await client.query(
      `SELECT circuit.id, circuit.name, circuit.locality, circuit.country_code,
              circuit.circuit_type, circuit.source_id,
              min(race.season_year)::integer AS first_season,
              max(race.season_year)::integer AS last_season,
              count(DISTINCT race.id)::integer AS race_count,
              count(DISTINCT layout.id)::integer AS layout_count,
              count(DISTINCT layout.id) FILTER (WHERE layout.centerline IS NOT NULL)::integer AS layouts_with_geometry,
              count(DISTINCT layout.id) FILTER (WHERE layout.source_id IS NOT NULL)::integer AS sourced_layouts,
              profile.circuit_id IS NOT NULL AS has_page_profile,
              profile.editorial_status AS page_profile_status
       FROM atlas.circuits AS circuit
       JOIN atlas.races AS race ON race.circuit_id = circuit.id
       LEFT JOIN atlas.track_layouts AS layout ON layout.circuit_id = circuit.id
       LEFT JOIN atlas.circuit_page_profiles AS profile ON profile.circuit_id = circuit.id
       GROUP BY circuit.id, profile.circuit_id
      ORDER BY max(race.season_year) DESC, circuit.name`,
    );
    const incompleteTrackProvenanceResult = await client.query(
      `SELECT profile.circuit_id, profile.geometry_id,
              layout.id IS NULL AS missing_layout,
              layout.source_id IS NULL AS missing_source,
              COALESCE(layout.provenance_type = 'unknown', true) AS missing_provenance,
              layout.review_status
       FROM atlas.circuit_page_profiles AS profile
       LEFT JOIN atlas.track_layouts AS layout
         ON layout.id = profile.geometry_id AND layout.circuit_id = profile.circuit_id
       WHERE profile.editorial_status = 'draft'
         AND profile.geometry_id IS NOT NULL
         AND (layout.id IS NULL OR layout.source_id IS NULL
              OR layout.provenance_type = 'unknown'
              OR layout.review_status NOT IN ('reviewed', 'published'))
       ORDER BY profile.circuit_id`,
    );
    const incompleteProfileFieldSourcesResult = await client.query(
      `WITH populated_fields AS (
         SELECT profile.circuit_id, field.field_name
         FROM atlas.circuit_page_profiles AS profile
         CROSS JOIN LATERAL (VALUES
           ('slug', profile.slug),
           ('geometry_id', profile.geometry_id),
           ('name_ru', profile.name_ru),
           ('city_ru', profile.city_ru),
           ('country_ru', profile.country_ru),
           ('summary_ru', profile.summary_ru),
           ('circuit_type_ru', profile.circuit_type_ru)
         ) AS field(field_name, field_value)
         WHERE profile.editorial_status = 'draft'
           AND field.field_value IS NOT NULL
       )
       SELECT populated.circuit_id, populated.field_name
       FROM populated_fields AS populated
       LEFT JOIN atlas.circuit_page_profile_field_sources AS provenance
         ON provenance.circuit_id = populated.circuit_id
        AND provenance.field_name = populated.field_name
        AND provenance.editorial_status = 'verified'
        AND provenance.verified_at IS NOT NULL
       WHERE provenance.circuit_id IS NULL
       ORDER BY populated.circuit_id, populated.field_name`,
    );

    const profiles = profilesResult.rows.map((row) => ({
      circuitId: row.circuit_id,
      slug: row.slug,
      editorialStatus: row.editorial_status,
      sourceId: row.source_id,
      hasGeometryId: row.has_geometry_id,
      hasSummary: row.has_summary,
      hasCircuitType: row.has_circuit_type,
      stats: Number(row.stats),
      historyEntries: Number(row.history_entries),
      galleryItems: Number(row.gallery_items),
    }));
    const profileIds = new Set(profiles.map((profile) => profile.circuitId));
    const snapshotIds = new Set(snapshots.map((snapshot) => snapshot.id));
    const latestSeason = Math.max(...circuitBacklogResult.rows.map((row) => Number(row.last_season)));
    const circuitBacklog = circuitBacklogResult.rows.map((row) => ({
      circuitId: row.id,
      officialName: row.name,
      locality: row.locality,
      countryCode: row.country_code,
      circuitType: row.circuit_type,
      sourceId: row.source_id,
      firstSeason: Number(row.first_season),
      lastSeason: Number(row.last_season),
      raceCount: Number(row.race_count),
      layoutCount: Number(row.layout_count),
      layoutsWithGeometry: Number(row.layouts_with_geometry),
      sourcedLayouts: Number(row.sourced_layouts),
      hasPageProfile: row.has_page_profile,
      pageProfileStatus: row.page_profile_status,
    }));
    const publishedProfiles = profiles.filter((profile) => profile.editorialStatus === 'published');
    const draftProfiles = profiles.filter((profile) => profile.editorialStatus === 'draft');
    const publishedProfileIds = new Set(publishedProfiles.map((profile) => profile.circuitId));
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        snapshots: snapshots.length,
        databaseProfiles: profiles.length,
        publishedProfiles: publishedProfiles.length,
        draftProfiles: draftProfiles.length,
        snapshotsWithoutProfile: snapshots.filter((snapshot) => !profileIds.has(snapshot.id)).length,
        publishedProfilesWithoutSnapshot: publishedProfiles.filter((profile) => !snapshotIds.has(profile.circuitId)).length,
        unsourcedStats: unsourcedStatsResult.rowCount,
        incompleteMedia: incompleteMediaResult.rowCount,
        duplicateMediaWithinPage: duplicateMediaResult.rowCount,
        incompleteRuntimeSettings: incompleteRuntimeSettingsResult.rowCount,
        incompleteTravelEditorial: incompleteTravelEditorialResult.rowCount,
        circuitsInRaceData: circuitBacklog.length,
        circuitsWithoutPageProfile: circuitBacklog.filter((item) => !item.hasPageProfile).length,
        circuitsWithoutPublishedPageProfile: circuitBacklog.filter((item) => item.pageProfileStatus !== 'published').length,
        latestSeason,
        latestSeasonCircuitsWithoutProfile: circuitBacklog.filter((item) => (
          item.lastSeason === latestSeason && !item.hasPageProfile
        )).length,
        latestSeasonDraftProfiles: circuitBacklog.filter((item) => (
          item.lastSeason === latestSeason && item.pageProfileStatus === 'draft'
        )).length,
        draftProfilesWithGaps: draftProfiles.filter((profile) => (
          !profile.sourceId || !profile.hasGeometryId || !profile.hasSummary || !profile.hasCircuitType
        )).length,
        incompleteTrackProvenance: incompleteTrackProvenanceResult.rowCount,
        incompleteProfileFieldSources: incompleteProfileFieldSourcesResult.rowCount,
      },
      profiles,
      draftProfileGaps: draftProfiles.filter((profile) => (
        !profile.sourceId || !profile.hasGeometryId || !profile.hasSummary || !profile.hasCircuitType
      )).map((profile) => ({
        circuitId: profile.circuitId,
        missing: [
          ...(!profile.sourceId ? ['source'] : []),
          ...(!profile.hasGeometryId ? ['geometry'] : []),
          ...(!profile.hasSummary ? ['summary'] : []),
          ...(!profile.hasCircuitType ? ['circuitType'] : []),
        ],
      })),
      snapshotsWithoutProfile: snapshots.filter((snapshot) => !profileIds.has(snapshot.id)),
      publishedProfilesWithoutSnapshot: profiles.filter((profile) => (
        publishedProfileIds.has(profile.circuitId) && !snapshotIds.has(profile.circuitId)
      )),
      unsourcedStats: unsourcedStatsResult.rows.map((row) => ({
        circuitId: row.circuit_id,
        section: row.section,
        sortOrder: Number(row.sort_order),
        label: row.label_ru,
      })),
      incompleteMedia: incompleteMediaResult.rows,
      duplicateMediaWithinPage: duplicateMediaResult.rows,
      incompleteRuntimeSettings: incompleteRuntimeSettingsResult.rows,
      incompleteTravelEditorial: incompleteTravelEditorialResult.rows,
      incompleteTrackProvenance: incompleteTrackProvenanceResult.rows,
      incompleteProfileFieldSources: incompleteProfileFieldSourcesResult.rows.map((row) => ({
        circuitId: row.circuit_id,
        fieldName: row.field_name,
      })),
      circuitProfileBacklog: circuitBacklog.filter((item) => !item.hasPageProfile),
    };

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report.summary, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Ошибка: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
