import { season2024, type Circuit } from './season-2024';

export type SeasonIndexItem = {
  year: number;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  roundsPlanned: number | null;
  racesAvailable: number;
};

export type SeasonIndex = {
  exportedAt: string;
  seasons: SeasonIndexItem[];
};

export type SnapshotDriverStanding = {
  position: number;
  driverId: string;
  givenName: string;
  familyName: string;
  code: string | null;
  points: number;
  wins: number;
  constructorId: string | null;
  constructorName: string | null;
  teamColor: string | null;
};

export type SnapshotConstructorStanding = {
  position: number;
  constructorId: string;
  name: string;
  engineName: string | null;
  points: number;
  wins: number;
  teamColor: string | null;
  carModel: string | null;
  carImageUrl: string | null;
};

export type SnapshotRaceResult = {
  position: number;
  positionText: string;
  driverId: string;
  givenName: string;
  familyName: string;
  code: string | null;
  constructorId: string | null;
  constructorName: string | null;
  teamColor: string | null;
  points: number;
  laps: number | null;
  status: string | null;
  elapsedMs: number | null;
  gapMs: number | null;
  gapText: string | null;
  fastestLapRank: number | null;
  fastestLapNumber: number | null;
  fastestLapMs: number | null;
};

export type SeasonSnapshot = {
  exportedAt: string;
  season: number;
  calendar: Array<{
    id: string;
    round: number;
    name: string;
    date: string | null;
    status: 'scheduled' | 'live' | 'completed' | 'cancelled' | 'postponed';
    circuit: {
      id: string;
      name: string;
      shortName: string | null;
      locality: string | null;
      countryCode: string;
      type: 'permanent' | 'street' | 'hybrid' | 'temporary';
      coordinates: [number, number];
    };
  }>;
  standings: {
    drivers: SnapshotDriverStanding[];
    constructors: SnapshotConstructorStanding[];
  };
  raceResults?: Record<string, SnapshotRaceResult[]>;
};

const countryNames = new Intl.DisplayNames(['ru'], { type: 'region' });
const localizedCircuits = new Map(season2024.map((circuit) => [circuit.id, circuit]));

const circuitTypes: Record<SeasonSnapshot['calendar'][number]['circuit']['type'], string> = {
  permanent: 'Стационарная трасса',
  street: 'Городская трасса',
  hybrid: 'Смешанная трасса',
  temporary: 'Временная трасса',
};

export function snapshotToCircuits(snapshot: SeasonSnapshot): Circuit[] {
  return snapshot.calendar.map((race) => {
    const localized = localizedCircuits.get(race.circuit.id);
    return {
      id: race.circuit.id,
      geometryId: localized?.geometryId ?? race.circuit.id,
      order: race.round,
      raceName: race.name,
      name: localized?.name ?? race.circuit.shortName ?? race.circuit.name,
      officialName: localized?.officialName ?? race.circuit.name,
      city: localized?.city ?? race.circuit.locality ?? 'Не указано',
      country: localized?.country
        ?? countryNames.of(race.circuit.countryCode)
        ?? race.circuit.countryCode,
      date: race.date ?? '',
      type: localized?.type ?? circuitTypes[race.circuit.type],
      status: race.status,
      coordinates: race.circuit.coordinates,
    };
  });
}
