import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { buildTeamTimelineContextSegments, buildTeamTimelineFamilies, buildTeamTimelineLineages, buildTeamTimelineModel, groupTeamTimelineSeasons, lineageAppliesToSegment } from '../../apps/web/app/data/team-timeline-model.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');

const season = (year, name) => ({ season: year, name });
const team = (id, seasons) => ({ id, name: id, seasons });
const successor = (teamId, validFromYear, overrides = {}) => ({
  direction: 'successor', teamId, teamName: teamId, relationshipType: 'rename',
  validFromYear, validToYear: null, descriptionRu: `${teamId} lineage`, sourceUrl: `https://example.com/${teamId}`,
  ...overrides,
});
const timelineTeam = (id, years, lineages = [], names = {}) => ({
  ...team(id, years.map((year) => season(year, names[year] ?? id))), lineages,
});

test('splits the same team name when a season gap exists', () => {
  const segments = groupTeamTimelineSeasons(team('gap', [season(2000, 'Atlas'), season(2001, 'Atlas'), season(2003, 'Atlas')]));
  assert.deepEqual(segments, [
    { name: 'Atlas', startSeason: 2000, endSeason: 2001, seasons: [2000, 2001] },
    { name: 'Atlas', startSeason: 2003, endSeason: 2003, seasons: [2003] },
  ]);
});

test('splits adjacent seasons when the entered team name changes', () => {
  const segments = groupTeamTimelineSeasons(team('rename', [season(2000, 'Atlas'), season(2001, 'Nova'), season(2002, 'Nova')]));
  assert.deepEqual(segments, [
    { name: 'Atlas', startSeason: 2000, endSeason: 2000, seasons: [2000] },
    { name: 'Nova', startSeason: 2001, endSeason: 2002, seasons: [2001, 2002] },
  ]);
});

test('ignores exact duplicate season rows without extending a segment', () => {
  const segments = groupTeamTimelineSeasons(team('duplicate', [season(2000, 'Atlas'), season(2000, 'Atlas'), season(2001, 'Atlas')]));
  assert.deepEqual(segments, [{ name: 'Atlas', startSeason: 2000, endSeason: 2001, seasons: [2000, 2001] }]);
});

test('uses the minimum and maximum source season rows for the shared range', () => {
  const model = buildTeamTimelineModel([team('early', [season(1950, 'Early')]), team('late', [season(2024, 'Late')])]);
  assert.equal(model.startSeason, 1950);
  assert.equal(model.endSeason, 2024);
  assert.equal(model.yearCount, 75);
  assert.equal(model.years[0], 1950);
  assert.equal(model.years.at(-1), 2024);
  assert.deepEqual(model.rows.map((row) => row.team.id), ['early', 'late']);
});

test('assigns only dated lineage records to a matching segment boundary', () => {
  const segment = { name: 'Atlas', startSeason: 2000, endSeason: 2002, seasons: [2000, 2001, 2002] };
  assert.equal(lineageAppliesToSegment({ direction: 'predecessor', validFromYear: 2000, validToYear: null }, segment), true);
  assert.equal(lineageAppliesToSegment({ direction: 'predecessor', validFromYear: 1999, validToYear: null }, segment), true);
  assert.equal(lineageAppliesToSegment({ direction: 'successor', validFromYear: 2003, validToYear: null }, segment), true);
  assert.equal(lineageAppliesToSegment({ direction: 'successor', validFromYear: null, validToYear: null }, segment), false);
});

test('keeps missing lineage boundaries open across later and earlier segments', () => {
  const segment = { name: 'Atlas', startSeason: 2001, endSeason: 2002, seasons: [2001, 2002] };
  assert.equal(lineageAppliesToSegment({ direction: 'predecessor', validFromYear: 2000, validToYear: null }, segment), true);
  assert.equal(lineageAppliesToSegment({ direction: 'predecessor', validFromYear: null, validToYear: 2005 }, segment), true);
  assert.equal(lineageAppliesToSegment({ direction: 'predecessor', validFromYear: null, validToYear: 2000 }, segment), false);
  assert.equal(lineageAppliesToSegment({ direction: 'predecessor', validFromYear: 2003, validToYear: null }, segment), false);
});

test('anchors old Honda and Mercedes identities only to their modern participation eras', () => {
  const teams = [
    timelineTeam('bar', [2004, 2005], [successor('honda', 2006, { relationshipType: 'factory_takeover' })]),
    timelineTeam('honda', [1964, 1965, 1966, 1967, 1968, 2006, 2007, 2008], [successor('brawn', 2009)]),
    timelineTeam('brawn', [2009], [successor('mercedes', 2010, { relationshipType: 'ownership_change' })]),
    timelineTeam('mercedes', [1954, 1955, 2010, 2011]),
  ];

  assert.deepEqual(buildTeamTimelineLineages(teams).map(({ predecessor, successor }) => ({
    predecessor, successor,
  })), [
    {
      predecessor: { teamId: 'bar', startSeason: 2004, endSeason: 2005 },
      successor: { teamId: 'honda', startSeason: 2006, endSeason: 2008 },
    },
    {
      predecessor: { teamId: 'honda', startSeason: 2006, endSeason: 2008 },
      successor: { teamId: 'brawn', startSeason: 2009, endSeason: 2009 },
    },
    {
      predecessor: { teamId: 'brawn', startSeason: 2009, endSeason: 2009 },
      successor: { teamId: 'mercedes', startSeason: 2010, endSeason: 2011 },
    },
  ]);
});

test('keeps repeated Renault IDs as distinct era endpoints without making an era cycle', () => {
  const teams = [
    timelineTeam('benetton', [2000, 2001], [successor('renault', 2002)]),
    timelineTeam('renault', [1977, 1978, 1985, 2002, 2003, 2010, 2011, 2016, 2017], [successor('lotus_f1', 2012)]),
    timelineTeam('lotus_f1', [2012, 2013, 2014, 2015], [successor('renault', 2016)]),
  ];
  const lineages = buildTeamTimelineLineages(teams);

  assert.deepEqual(lineages.map((lineage) => [lineage.predecessor, lineage.successor]), [
    [{ teamId: 'benetton', startSeason: 2000, endSeason: 2001 }, { teamId: 'renault', startSeason: 2002, endSeason: 2003 }],
    [{ teamId: 'renault', startSeason: 2010, endSeason: 2011 }, { teamId: 'lotus_f1', startSeason: 2012, endSeason: 2015 }],
    [{ teamId: 'lotus_f1', startSeason: 2012, endSeason: 2015 }, { teamId: 'renault', startSeason: 2016, endSeason: 2017 }],
  ]);
  assert.notDeepEqual(lineages[0].successor, lineages[2].successor);
});

test('uses continuous participation rather than display-name segments for lineage eras', () => {
  const lineages = buildTeamTimelineLineages([
    timelineTeam('alpha', [2020, 2021, 2022], [successor('beta', 2023)], { 2020: 'Alpha', 2021: 'Alpha Works', 2022: 'Alpha' }),
    timelineTeam('beta', [2023, 2024], [], { 2023: 'Beta', 2024: 'Beta Racing' }),
  ]);

  assert.deepEqual(lineages[0].predecessor, { teamId: 'alpha', startSeason: 2020, endSeason: 2022 });
  assert.deepEqual(lineages[0].successor, { teamId: 'beta', startSeason: 2023, endSeason: 2024 });
});

test('rejects gaps, missing identities, missing anchors, null dates and reciprocal-only records', () => {
  const teams = [
    timelineTeam('gap', [2000, 2002], [successor('target', 2002)]),
    timelineTeam('target', [2002]),
    timelineTeam('missing-target', [2000], [successor('unknown', 2001)]),
    timelineTeam('missing-successor-season', [2000], [successor('late', 2001)]),
    timelineTeam('late', [2002]),
    timelineTeam('undated', [2000], [successor('target', null)]),
    timelineTeam('incoming-only', [2001], [{ ...successor('target', 2001), direction: 'predecessor' }]),
  ];

  assert.deepEqual(buildTeamTimelineLineages(teams), []);
});

test('deduplicates outgoing records and returns complete sourced metadata deterministically', () => {
  const link = successor('next', 2001, { descriptionRu: 'Переход', sourceUrl: 'https://example.com/source' });
  const teams = [
    timelineTeam('later', [2001], []),
    timelineTeam('previous', [2000], [link, { ...link }]),
    timelineTeam('next', [2001]),
    timelineTeam('early', [1999, 2000], [successor('later', 2001, { relationshipType: 'continuation' })]),
  ];

  assert.deepEqual(buildTeamTimelineLineages(teams), [
    {
      relationshipType: 'continuation',
      descriptionRu: 'later lineage', sourceUrl: 'https://example.com/later', transitionYear: 2001,
      predecessor: { teamId: 'early', startSeason: 1999, endSeason: 2000 },
      successor: { teamId: 'later', startSeason: 2001, endSeason: 2001 },
    },
    {
      relationshipType: 'rename',
      descriptionRu: 'Переход', sourceUrl: 'https://example.com/source', transitionYear: 2001,
      predecessor: { teamId: 'previous', startSeason: 2000, endSeason: 2000 },
      successor: { teamId: 'next', startSeason: 2001, endSeason: 2001 },
    },
  ]);
});

test('resolves every published outgoing lineage against actual catalog seasons', async () => {
  const catalog = JSON.parse(await readFile(path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'catalogs', 'teams-all.json'), 'utf8'));
  const outgoingCount = catalog.teams.reduce((count, entry) => (
    count + entry.lineages.filter((lineage) => lineage.direction === 'successor').length
  ), 0);
  const lineages = buildTeamTimelineLineages(catalog.teams);
  const teamsById = new Map(catalog.teams.map((entry) => [entry.id, entry]));

  assert.equal(outgoingCount, 20);
  assert.equal(lineages.length, outgoingCount);
  for (const lineage of lineages) {
    const predecessorYears = new Set(teamsById.get(lineage.predecessor.teamId).seasons.map((entry) => entry.season));
    const successorYears = new Set(teamsById.get(lineage.successor.teamId).seasons.map((entry) => entry.season));
    assert.ok(predecessorYears.has(lineage.transitionYear - 1), `${lineage.predecessor.teamId} lacks predecessor anchor`);
    assert.ok(successorYears.has(lineage.transitionYear), `${lineage.successor.teamId} lacks successor anchor`);
    assert.ok(predecessorYears.has(lineage.predecessor.startSeason));
    assert.ok(predecessorYears.has(lineage.predecessor.endSeason));
    assert.ok(successorYears.has(lineage.successor.startSeason));
    assert.ok(successorYears.has(lineage.successor.endSeason));
  }

  const sauberAudi = lineages.find((lineage) => (
    lineage.predecessor.teamId === 'sauber' && lineage.successor.teamId === 'audi'
  ));
  assert.deepEqual(sauberAudi?.predecessor, { teamId: 'sauber', startSeason: 2024, endSeason: 2025 });
  assert.deepEqual(sauberAudi?.successor, { teamId: 'audi', startSeason: 2026, endSeason: 2026 });
});

test('returns the same non-conflicting lineages when team input order is reversed', () => {
  const teams = [
    timelineTeam('alpha', [1999, 2000], [successor('beta', 2001)]),
    timelineTeam('beta', [2001, 2002]),
    timelineTeam('gamma', [2004], [successor('delta', 2005, { relationshipType: 'continuation' })]),
    timelineTeam('delta', [2005, 2006]),
  ];

  assert.deepEqual(buildTeamTimelineLineages([...teams].reverse()), buildTeamTimelineLineages(teams));
});

test('groups a modern lineage while keeping an old identity era separate', () => {
  const teams = [
    timelineTeam('bar', [2004, 2005], [successor('honda', 2006)]),
    timelineTeam('honda', [1964, 1965, 2006, 2007, 2008], [successor('brawn', 2009)]),
    timelineTeam('brawn', [2009], [successor('mercedes', 2010)]),
    timelineTeam('mercedes', [1954, 1955, 2010, 2011]),
  ];
  const families = buildTeamTimelineFamilies(teams);

  assert.deepEqual(families.map((family) => family.members.map(({ era }) => era)), [
    [{ teamId: 'mercedes', startSeason: 1954, endSeason: 1955 }],
    [{ teamId: 'honda', startSeason: 1964, endSeason: 1965 }],
    [
      { teamId: 'bar', startSeason: 2004, endSeason: 2005 },
      { teamId: 'honda', startSeason: 2006, endSeason: 2008 },
      { teamId: 'brawn', startSeason: 2009, endSeason: 2009 },
      { teamId: 'mercedes', startSeason: 2010, endSeason: 2011 },
    ],
  ]);
  assert.equal(families[2].members[0].team, teams[0]);
});

test('keeps repeated team IDs in independent lineage families and preserves name segments', () => {
  const teams = [
    timelineTeam('benetton', [2000, 2001], [successor('renault', 2002)]),
    timelineTeam('renault', [1977, 1978, 2002, 2003, 2010, 2011, 2016, 2017], [successor('lotus', 2012)], { 2002: 'Renault', 2003: 'Renault F1' }),
    timelineTeam('lotus', [2012, 2013, 2014, 2015], [successor('renault', 2016)]),
  ];
  const families = buildTeamTimelineFamilies(teams);

  assert.deepEqual(families.map((family) => family.members.map(({ era }) => `${era.teamId}:${era.startSeason}-${era.endSeason}`)), [
    ['renault:1977-1978'],
    ['benetton:2000-2001', 'renault:2002-2003'],
    ['renault:2010-2011', 'lotus:2012-2015', 'renault:2016-2017'],
  ]);
  assert.deepEqual(families[1].members[1].segments.map(({ name }) => name), ['Renault', 'Renault F1']);
});

test('does not connect visible families through a filtered-out identity', () => {
  const allTeams = [
    timelineTeam('alpha', [2000], [successor('hidden', 2001)]),
    timelineTeam('hidden', [2001], [successor('omega', 2002)]),
    timelineTeam('omega', [2002]),
  ];
  const visibleTeams = [allTeams[0], allTeams[2]];

  assert.deepEqual(buildTeamTimelineFamilies(visibleTeams, allTeams).map((family) => (
    family.members.map(({ team: entry }) => entry.id)
  )), [['alpha'], ['omega']]);
});

test('falls back to singleton era rows for branching or overlapping lineage components', () => {
  const branching = [
    timelineTeam('alpha', [2000], [successor('beta', 2001), successor('gamma', 2001)]),
    timelineTeam('beta', [2001]),
    timelineTeam('gamma', [2001]),
  ];

  assert.deepEqual(buildTeamTimelineFamilies(branching).map((family) => family.members.length), [1, 1, 1]);
});

test('groups every published lineage without losing a catalog participation era', async () => {
  const catalog = JSON.parse(await readFile(path.join(repositoryRoot, 'apps', 'web', 'app', 'data', 'catalogs', 'teams-all.json'), 'utf8'));
  const lineages = buildTeamTimelineLineages(catalog.teams);
  const families = buildTeamTimelineFamilies(catalog.teams);
  const familyByEra = new Map();

  for (const family of families) {
    for (const { era } of family.members) familyByEra.set(`${era.teamId}:${era.startSeason}-${era.endSeason}`, family.key);
  }

  assert.equal(lineages.length, 20);
  for (const lineage of lineages) {
    const predecessorKey = `${lineage.predecessor.teamId}:${lineage.predecessor.startSeason}-${lineage.predecessor.endSeason}`;
    const successorKey = `${lineage.successor.teamId}:${lineage.successor.startSeason}-${lineage.successor.endSeason}`;
    assert.equal(familyByEra.get(predecessorKey), familyByEra.get(successorKey));
  }
  const expectedEraCount = catalog.teams.reduce((count, entry) => {
    const years = [...new Set(entry.seasons.map(({ season: year }) => year))].sort((a, b) => a - b);
    return count + years.reduce((eras, year, index) => eras + (index === 0 || years[index - 1] + 1 !== year ? 1 : 0), 0);
  }, 0);
  assert.equal(families.reduce((count, family) => count + family.members.length, 0), expectedEraCount);
});

test('shows each disconnected Williams era as context for the other family row', () => {
  const williams = timelineTeam('williams', [1975, 1976, 1978, 1979, 1980], [], {
    1975: 'Williams', 1976: 'Williams', 1978: 'Williams Grand Prix', 1979: 'Williams Grand Prix', 1980: 'Williams Racing',
  });
  const model = buildTeamTimelineModel([williams]);
  const families = buildTeamTimelineFamilies([williams]);

  assert.deepEqual(buildTeamTimelineContextSegments(families[0], model.rows).map(({ segment }) => segment), [
    { name: 'Williams Grand Prix', startSeason: 1978, endSeason: 1979, seasons: [1978, 1979] },
    { name: 'Williams Racing', startSeason: 1980, endSeason: 1980, seasons: [1980] },
  ]);
  assert.deepEqual(buildTeamTimelineContextSegments(families[1], model.rows).map(({ segment }) => segment), [
    { name: 'Williams', startSeason: 1975, endSeason: 1976, seasons: [1975, 1976] },
  ]);
});

test('context uses displayed identities only and never overlays a real family segment', () => {
  const teams = [
    timelineTeam('alpha', [1990, 2000], [successor('beta', 2001)], { 1990: 'Alpha Historic', 2000: 'Alpha' }),
    timelineTeam('beta', [1990, 2001], [], { 1990: 'Beta Historic', 2001: 'Beta' }),
    timelineTeam('hidden', [1980]),
  ];
  const model = buildTeamTimelineModel(teams);
  const modernFamily = buildTeamTimelineFamilies(teams).find((family) => family.members.length === 2);
  assert.ok(modernFamily);

  const context = buildTeamTimelineContextSegments(modernFamily, model.rows);
  assert.deepEqual(context.map(({ team: entry, segment }) => [entry.id, segment.name]), [
    ['alpha', 'Alpha Historic'],
  ]);
  assert.ok(context.every(({ team: entry }) => entry.id !== 'hidden'));
});

test('context retains repeated names in separate segments and deduplicates overlapping candidates', () => {
  const alpha = timelineTeam('alpha', [1980, 1982, 1984], [successor('beta', 1985)], {
    1980: 'Same', 1982: 'Same', 1984: 'Alpha',
  });
  const beta = timelineTeam('beta', [1980, 1985], [], { 1980: 'Beta Historic', 1985: 'Beta' });
  const model = buildTeamTimelineModel([alpha, beta]);
  const modernFamily = buildTeamTimelineFamilies([alpha, beta]).find((family) => family.members.length === 2);
  assert.ok(modernFamily);

  assert.deepEqual(buildTeamTimelineContextSegments(modernFamily, model.rows).map(({ team: entry, segment }) => (
    `${entry.id}:${segment.name}:${segment.startSeason}`
  )), ['alpha:Same:1980', 'alpha:Same:1982']);
});
