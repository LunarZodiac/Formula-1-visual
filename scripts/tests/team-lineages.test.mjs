import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
const registry = JSON.parse(await readFile(path.join(repositoryRoot, 'data', 'editorial', 'team-lineages.json'), 'utf8'));
const catalog = JSON.parse(await readFile(path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'catalogs', 'teams-all.json'), 'utf8'));

test('team lineage registry contains sourced links between known distinct teams', () => {
  assert.equal(registry.schemaVersion, 1);
  const sources = new Map(registry.sources.map((source) => [source.id, source]));
  const teamIds = new Set(catalog.teams.map((team) => team.id));
  const identities = new Set();

  for (const lineage of registry.lineages) {
    const identity = `${lineage.predecessorId}:${lineage.successorId}:${lineage.relationshipType}:${lineage.validFromYear}`;
    assert.ok(!identities.has(identity), `Повторяющаяся связь ${identity}`);
    identities.add(identity);
    assert.notEqual(lineage.predecessorId, lineage.successorId);
    assert.ok(teamIds.has(lineage.predecessorId), `Неизвестная команда ${lineage.predecessorId}`);
    assert.ok(teamIds.has(lineage.successorId), `Неизвестная команда ${lineage.successorId}`);
    assert.ok(sources.has(lineage.sourceId), `Неизвестный источник ${lineage.sourceId}`);
    assert.ok(lineage.descriptionRu?.trim());
  }
});

test('published catalog lineage names remain navigable team identities', () => {
  const teamIds = new Set(catalog.teams.map((team) => team.id));
  for (const team of catalog.teams) {
    for (const lineage of team.lineages ?? []) {
      assert.ok(teamIds.has(lineage.teamId), `Ссылка ${team.id} ведёт на неизвестную команду ${lineage.teamId}`);
      assert.ok(lineage.teamName?.trim());
      assert.match(lineage.sourceUrl ?? '', /^https:\/\//);
    }
  }
});
