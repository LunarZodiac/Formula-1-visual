import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
const localizationRegistry = JSON.parse(await readFile(
  path.join(repositoryRoot, 'data', 'editorial', 'team-localizations.json'),
  'utf8',
));
const teamCatalog = JSON.parse(await readFile(
  path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'catalogs', 'teams-all.json'),
  'utf8',
));

test('team localizations are unique, sourced and mapped to catalog teams', () => {
  assert.equal(localizationRegistry.schemaVersion, 1);
  assert.ok(Array.isArray(localizationRegistry.localizations));

  const ids = localizationRegistry.localizations.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'IDs локализаций команд должны быть уникальными');

  const teamsById = new Map(teamCatalog.teams.map((team) => [team.id, team]));
  for (const localization of localizationRegistry.localizations) {
    const team = teamsById.get(localization.id);
    assert.ok(team, `Команда ${localization.id} отсутствует в общем каталоге`);
    assert.ok(localization.officialName?.trim(), `У ${localization.id} отсутствует официальное имя`);
    assert.ok(localization.nameRu?.trim(), `У ${localization.id} отсутствует русская подпись`);
    assert.match(localization.sourceUrl ?? '', /^https:\/\//, `У ${localization.id} отсутствует URL источника`);
    assert.match(localization.accessedAt ?? '', /^\d{4}-\d{2}-\d{2}$/, `У ${localization.id} некорректная дата доступа`);
    assert.ok(['high', 'medium', 'low'].includes(localization.confidence), `У ${localization.id} некорректная уверенность`);
  }
});

test('official team names remain primary and Russian names stay secondary', () => {
  const localizationById = new Map(
    localizationRegistry.localizations.map((localization) => [localization.id, localization]),
  );

  for (const team of teamCatalog.teams) {
    const localization = localizationById.get(team.id);
    if (!localization) {
      assert.equal(team.nameRu, undefined, `У ${team.id} появилась русская подпись вне реестра`);
      continue;
    }

    const officialNames = new Set([
      ...(team.aliases ?? []),
      ...(team.seasons ?? []).map((season) => season.name),
    ]);
    assert.ok(officialNames.has(team.name), `Основное имя ${team.id} не относится к официальным названиям`);
    assert.ok(
      officialNames.has(localization.officialName),
      `Официальное имя из реестра не найдено в истории ${team.id}`,
    );
    assert.equal(team.nameRu, localization.nameRu, `Русская подпись ${team.id} потеряна или подменена`);
    if (localization.officialName !== localization.nameRu) {
      assert.notEqual(team.name, team.nameRu, `Русская подпись ${team.id} не должна заменять основное имя`);
    }
  }
});
