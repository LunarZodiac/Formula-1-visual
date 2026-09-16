#!/usr/bin/env node

import { mkdir, rename, writeFile } from 'node:fs/promises';
import pg from 'pg';

const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missingEnvironment = required.filter((name) => !process.env[name]);
if (missingEnvironment.length) throw new Error(`Не заданы параметры базы: ${missingEnvironment.join(', ')}`);

const client = new pg.Client({ application_name: 'f1-atlas-driver-biography-audit' });
await client.connect();
try {
  const result = await client.query(`
    SELECT driver.id,
           concat_ws(' ', driver.given_name, driver.family_name) AS name_en,
           driver.date_of_birth,
           profile.death_date,
           profile.name_ru,
           profile.birth_place_ru,
           profile.height_cm,
           profile.weight_kg,
           profile.biography_ru,
           profile.review_status,
           count(DISTINCT field_source.field_name)::integer AS sourced_profile_fields,
           count(DISTINCT relationship.id)::integer AS relationship_claims
    FROM atlas.drivers AS driver
    JOIN atlas.session_results AS result ON result.driver_id = driver.id
    JOIN atlas.sessions AS session ON session.id = result.session_id AND session.session_type = 'race'
    LEFT JOIN atlas.driver_profiles AS profile ON profile.driver_id = driver.id
    LEFT JOIN atlas.driver_profile_field_sources AS field_source ON field_source.driver_id = driver.id
    LEFT JOIN atlas.driver_relationships AS relationship ON relationship.driver_id = driver.id
    GROUP BY driver.id, profile.driver_id
    ORDER BY driver.family_name, driver.given_name
  `);

  const rows = result.rows.map((row) => ({
    id: row.id,
    nameEn: row.name_en,
    nameRu: row.name_ru,
    reviewStatus: row.review_status,
    deathDate: row.death_date,
    missing: [
      !row.name_ru && 'nameRu',
      !row.date_of_birth && 'birthDate',
      !row.birth_place_ru && 'birthPlace',
      row.height_cm === null && 'heightCm',
      row.weight_kg === null && 'weightKg',
      !row.biography_ru && 'biographyRu',
    ].filter(Boolean),
    sourcedProfileFields: row.sourced_profile_fields,
    relationshipClaims: row.relationship_claims,
  }));
  const countWith = (field) => rows.filter((row) => !row.missing.includes(field)).length;
  const report = {
    generatedAt: new Date().toISOString(),
    scope: { driversWithRaceResults: rows.length },
    completeness: {
      nameRu: countWith('nameRu'),
      birthDate: countWith('birthDate'),
      birthPlace: countWith('birthPlace'),
      deathDateKnown: rows.filter((row) => row.deathDate).length,
      heightCm: countWith('heightCm'),
      weightKg: countWith('weightKg'),
      biographyRu: countWith('biographyRu'),
      withFieldSources: rows.filter((row) => row.sourcedProfileFields > 0).length,
      withRelationshipClaims: rows.filter((row) => row.relationshipClaims > 0).length,
    },
    reviewStatuses: Object.fromEntries(['candidate', 'reviewed', 'verified', 'published', 'rejected'].map((status) => [
      status,
      rows.filter((row) => row.reviewStatus === status).length,
    ])),
    drivers: rows,
  };

  await mkdir('data/review', { recursive: true });
  const outputPath = 'data/review/driver-biography-audit.json';
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, outputPath);
  console.log(JSON.stringify({
    drivers: rows.length,
    ...report.completeness,
    reviewStatuses: report.reviewStatuses,
  }, null, 2));
} finally {
  await client.end();
}
