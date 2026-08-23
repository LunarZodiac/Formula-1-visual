import drivers from './catalogs/drivers.json';
import teams from './catalogs/teams.json';
import standings2024 from './seasons/standings-2024.json';

function requireRecord<T extends { id: string }>(records: T[], id: string, entity: string) {
  const record = records.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`Не найден ${entity} с идентификатором ${id}`);
  return record;
}

export const season2024Summary = {
  season: standings2024.season,
  drivers: standings2024.drivers.map((standing) => ({
    ...standing,
    driver: requireRecord(drivers, standing.driverId, 'пилот'),
    team: requireRecord(teams, standing.teamId, 'команда'),
    teamLabel: 'teamLabel' in standing ? standing.teamLabel : undefined,
  })),
  teams: standings2024.teams.map((standing) => ({
    ...standing,
    team: requireRecord(teams, standing.teamId, 'команда'),
  })),
};
