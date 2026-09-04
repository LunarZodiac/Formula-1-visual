// Read-model aggregation: only Grand Prix result rows, never qualifying or sprints.
export function summarizeRaces(rows) {
  const sessions = new Set(rows.map((row) => row.session_id));
  const podiums = new Set(rows.filter((row) => Number(row.position_order) <= 3).map((row) => `${row.session_id}:${row.position_order}`));
  const winning = rows.filter((row) => Number(row.position_order) === 1);
  const years = rows.map((row) => Number(row.season_year));
  const lastSeason = years.length ? Math.max(...years) : null;
  return {
    raceEntries: sessions.size,
    wins: new Set(winning.map((row) => row.session_id)).size,
    podiums: podiums.size,
    points: Math.round(rows.reduce((sum, row) => sum + Number(row.points), 0) * 100) / 100,
    circuits: new Set(rows.map((row) => row.circuit_id)).size,
    countries: new Set(rows.map((row) => row.country_code)).size,
    winningCircuits: new Set(winning.map((row) => row.circuit_id)).size,
    firstSeason: years.length ? Math.min(...years) : null,
    lastSeason,
    throughRound: lastSeason === null ? null : Math.max(...rows.filter((row) => Number(row.season_year) === lastSeason).map((row) => Number(row.round))),
  };
}

export function groupRows(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return groups;
}

export function resultGeography(rows) {
  return [...groupRows(rows, 'circuit_id')].map(([id, facts]) => {
    const first = facts[0];
    const { raceEntries, wins, podiums, points } = summarizeRaces(facts);
    return { id, name: first.circuit_name, slug: first.slug, isPublished: first.editorial_status === 'published', countryCode: first.country_code.trim().toLowerCase(), coordinates: [Number(first.longitude), Number(first.latitude)], raceEntries, wins, podiums, points };
  }).sort((a, b) => b.wins - a.wins || b.podiums - a.podiums || a.id.localeCompare(b.id));
}

export function isFinalStanding(status, afterRound, lastRound) {
  return status === 'completed' && lastRound > 0 && afterRound >= lastRound;
}

export function teamHistoryForSeason(rows, year) {
  return [...groupRows(rows.filter((row) => Number(row.season_year) === year && row.constructor_id), 'constructor_id')].map(([id, facts]) => {
    const { raceEntries, points } = summarizeRaces(facts);
    return { id, name: facts[0].team_name, raceEntries, points };
  }).sort((a, b) => b.raceEntries - a.raceEntries || a.id.localeCompare(b.id));
}
