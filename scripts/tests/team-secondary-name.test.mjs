import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { distinctTeamSecondaryName, resolveTeamSecondaryName } from '../../apps/web/app/data/team-secondary-name.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
const source = (overrides = {}) => ({
  id: 'atlas', nameRu: 'Атлас', firstSeason: 2000, latestSeason: 2001,
  seasons: [{ season: 2000, name: 'Atlas Racing' }, { season: 2001, name: 'Atlas Works' }],
  ...overrides,
});

test('returns a distinct secondary name for the matching id, season and official identity', () => {
  assert.equal(resolveTeamSecondaryName({ id: 'atlas', name: 'Atlas Works' }, 2001, [source()]), 'Атлас');
});

test('does not move a secondary name across a different official identity or era', () => {
  assert.equal(resolveTeamSecondaryName({ id: 'atlas', name: 'Unknown Atlas Entry' }, 2001, [source()]), undefined);
  assert.equal(resolveTeamSecondaryName({ id: 'atlas', name: 'Atlas Racing' }, 2001, [source()]), undefined);
  assert.equal(resolveTeamSecondaryName({ id: 'atlas', name: 'Atlas Racing' }, 1999, [source()]), undefined);
  assert.equal(resolveTeamSecondaryName({ id: 'other', name: 'Atlas Racing' }, 2000, [source()]), undefined);
  assert.equal(resolveTeamSecondaryName({ id: 'atlas', name: 'Atlas Racing' }, 2001, [source({
    latestSeason: 2002,
    seasons: [{ season: 2000, name: 'Atlas Racing' }, { season: 2002, name: 'Atlas Works' }],
  })]), undefined);
});

test('rejects ambiguous duplicate ids and duplicate display strings', () => {
  assert.equal(resolveTeamSecondaryName({ id: 'atlas', name: 'Atlas Racing' }, 2000, [source(), source()]), undefined);
  assert.equal(distinctTeamSecondaryName('Ferrari', '  ferrari  '), undefined);
  assert.equal(distinctTeamSecondaryName('Atlas Racing', '  Атлас   Рейсинг  '), 'Атлас Рейсинг');
});

test('keeps the ambiguous rb id without a fabricated secondary name', async () => {
  const catalog = JSON.parse(await readFile(path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'catalogs', 'teams-all.json'), 'utf8'));
  const rb = catalog.teams.find((team) => team.id === 'rb');
  assert.ok(rb);
  assert.equal(resolveTeamSecondaryName({ id: 'rb', name: 'RB F1 Team' }, 2026, catalog.teams), undefined);
});

test('keeps BMW Sauber and Sauber secondary names separated by verified id and season', async () => {
  const catalog = JSON.parse(await readFile(path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'catalogs', 'teams-all.json'), 'utf8'));
  const bmwSauberName = resolveTeamSecondaryName({ id: 'bmw_sauber', name: 'BMW Sauber' }, 2008, catalog.teams);
  const sauberName = resolveTeamSecondaryName({ id: 'sauber', name: 'Sauber' }, 1993, catalog.teams);

  assert.equal(bmwSauberName, 'БМВ-Заубер');
  assert.equal(sauberName, 'Заубер');
  assert.notEqual(bmwSauberName, sauberName);
});

test('resolves the early-1990s verified batch without adding the deferred Fondmetal name', async () => {
  const catalog = JSON.parse(await readFile(path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'catalogs', 'teams-all.json'), 'utf8'));
  const expected = { pacific: 'Пасифик', simtek: 'Симтек', lola: 'Лола', moda: 'Андреа Мода', dallara: 'Даллара' };
  for (const [id, nameRu] of Object.entries(expected)) {
    const team = catalog.teams.find((item) => item.id === id);
    assert.ok(team);
    const row = team.seasons[0];
    assert.ok(row);
    assert.equal(resolveTeamSecondaryName({ id, name: row.name }, row.season, catalog.teams), nameRu);
  }
  const deferred = catalog.teams.find((item) => item.id === 'fondmetal');
  assert.ok(deferred);
  const row = deferred.seasons[0];
  assert.equal(resolveTeamSecondaryName({ id: deferred.id, name: row.name }, row.season, catalog.teams), undefined);
});

test('resolves verified late-1980s names without inventing a Rial spelling', async () => {
  const catalog = JSON.parse(await readFile(path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'catalogs', 'teams-all.json'), 'utf8'));
  const expected = { leyton: 'Лейтон Хаус', eurobrun: 'ЕвроБрун', onyx: 'Оникс', coloni: 'Колони', zakspeed: 'Цакспид' };
  for (const [id, nameRu] of Object.entries(expected)) {
    const team = catalog.teams.find((item) => item.id === id);
    assert.ok(team);
    const row = team.seasons[0];
    assert.ok(row);
    assert.equal(resolveTeamSecondaryName({ id, name: row.name }, row.season, catalog.teams), nameRu);
  }
  const rial = catalog.teams.find((item) => item.id === 'rial');
  assert.ok(rial);
  assert.equal(resolveTeamSecondaryName({ id: rial.id, name: rial.seasons[0].name }, rial.seasons[0].season, catalog.teams), undefined);
});

test('resolves early-1980s names without merging neighboring team identities', async () => {
  const catalog = JSON.parse(await readFile(path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'catalogs', 'teams-all.json'), 'utf8'));
  const expected = { spirit: 'Спирит', toleman: 'Тоулмен', theodore: 'Теодор', ensign: 'Энсайн', shadow: 'Шэдоу' };
  for (const [id, nameRu] of Object.entries(expected)) {
    const team = catalog.teams.find((item) => item.id === id);
    assert.ok(team);
    const row = team.seasons[0];
    assert.ok(row);
    assert.equal(resolveTeamSecondaryName({ id, name: row.name }, row.season, catalog.teams), nameRu);
  }
  for (const id of ['shadow-ford', 'shadow-matra']) {
    const team = catalog.teams.find((item) => item.id === id);
    assert.ok(team);
    const row = team.seasons[0];
    assert.equal(resolveTeamSecondaryName({ id, name: row.name }, row.season, catalog.teams), undefined);
  }
});

test('resolves sourced 1970s team labels only for their catalog identities', async () => {
  const catalog = JSON.parse(await readFile(path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'catalogs', 'teams-all.json'), 'utf8'));
  const expected = { merzario: 'Мерцарио', wolf: 'Вольф', hesketh: 'Хескет', penske: 'Пенске', parnelli: 'Парнелли' };
  for (const [id, nameRu] of Object.entries(expected)) {
    const team = catalog.teams.find((item) => item.id === id);
    assert.ok(team);
    const row = team.seasons[0];
    assert.ok(row);
    assert.equal(resolveTeamSecondaryName({ id, name: row.name }, row.season, catalog.teams), nameRu);
    assert.equal(resolveTeamSecondaryName({ id: 'unrelated', name: row.name }, row.season, catalog.teams), undefined);
  }
});
