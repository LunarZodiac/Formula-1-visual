#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const catalogPath = path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'catalogs', 'teams-all.json');
const reportPath = path.join(repositoryRoot, 'data', 'review', 'team-catalog-audit.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const teams = Array.isArray(catalog.teams) ? catalog.teams : [];
const errors = [];
const warnings = [];

const ids = teams.map((team) => String(team.id));
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) errors.push(`Повторяющиеся ID: ${[...new Set(duplicateIds)].join(', ')}`);

const client = new pg.Client({ application_name: 'f1-geovisual-atlas-team-catalog-audit' });
await client.connect();
try {
  const [participantsResult, lineageResult] = await Promise.all([
    client.query(`SELECT DISTINCT entry.constructor_id
      FROM atlas.constructor_entries AS entry
      JOIN atlas.session_results AS result ON result.constructor_entry_id=entry.id
      JOIN atlas.sessions AS session ON session.id=result.session_id AND session.session_type='race'
      ORDER BY entry.constructor_id`),
    client.query(`SELECT predecessor_constructor_id,successor_constructor_id,review_status
      FROM atlas.constructor_lineage_links ORDER BY id`),
  ]);
  const expectedIds = participantsResult.rows.map((row) => String(row.constructor_id));
  const expected = new Set(expectedIds);
  const actual = new Set(ids);
  const missingFromCatalog = expectedIds.filter((id) => !actual.has(id));
  const unexpectedInCatalog = ids.filter((id) => !expected.has(id));
  if (missingFromCatalog.length) errors.push(`Нет карточек участников гонок: ${missingFromCatalog.join(', ')}`);
  if (unexpectedInCatalog.length) errors.push(`Лишние карточки без результатов гонок: ${unexpectedInCatalog.join(', ')}`);

  const invalidTeams = teams.filter((team) => !team.name || !Number.isInteger(team.firstSeason)
    || !Number.isInteger(team.latestSeason) || team.firstSeason > team.latestSeason
    || !Array.isArray(team.seasons) || !team.seasons.length || !Array.isArray(team.lineages)).map((team) => team.id);
  if (invalidTeams.length) errors.push(`Некорректная идентичность или периоды: ${invalidTeams.join(', ')}`);
  const invalidLineages = teams.flatMap((team) => team.lineages
    .filter((link) => !actual.has(link.teamId) || !['predecessor', 'successor'].includes(link.direction) || !link.sourceUrl)
    .map((link) => `${team.id}→${link.teamId}`));
  if (invalidLineages.length) errors.push(`Некорректные публичные связи: ${invalidLineages.join(', ')}`);

  const withoutLogo = teams.filter((team) => !team.logoUrl).map((team) => team.id);
  const withoutCar = teams.filter((team) => !team.carImageUrl).map((team) => team.id);
  const withoutNationality = teams.filter((team) => !team.nationality).map((team) => team.id);
  if (withoutLogo.length) warnings.push(`Без логотипа: ${withoutLogo.length}`);
  if (withoutCar.length) warnings.push(`Без изображения болида: ${withoutCar.length}`);
  if (withoutNationality.length) warnings.push(`Без страны: ${withoutNationality.length}`);

  const report = {
    generatedAt: new Date().toISOString(), teamCount: teams.length, databaseParticipantCount: expectedIds.length,
    lineageCount: lineageResult.rows.length,
    publishedLineageCount: lineageResult.rows.filter((row) => row.review_status === 'published').length,
    errors, warnings,
    editorialDebt: { withoutLogo, withoutCar, withoutNationality },
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ teamCount: report.teamCount, lineageCount: report.lineageCount,
    errors: errors.length, withoutLogo: withoutLogo.length, withoutCar: withoutCar.length,
    reportPath: path.relative(repositoryRoot, reportPath) }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await client.end();
}
