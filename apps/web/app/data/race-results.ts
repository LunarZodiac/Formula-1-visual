import drivers from './catalogs/drivers.json';
import teams from './catalogs/teams.json';
import results2024 from './seasons/results-2024.json';

function requireRecord<T extends { id: string }>(records: T[], id: string, entity: string) {
  const record = records.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`Не найден ${entity} с идентификатором ${id}`);
  return record;
}

const bahrainRound = results2024.rounds.find((round) => round.circuitId === 'bahrain');

if (!bahrainRound) {
  throw new Error('В данных сезона 2024 отсутствует этап Бахрейна');
}

export const bahrain2024Result = {
  ...bahrainRound,
  podium: bahrainRound.podium.map((result) => ({
    ...result,
    driver: requireRecord(drivers, result.driverId, 'пилот'),
    team: requireRecord(teams, result.teamId, 'команда'),
  })),
  fastestLap: {
    ...bahrainRound.fastestLap,
    driver: requireRecord(drivers, bahrainRound.fastestLap.driverId, 'пилот'),
  },
};
