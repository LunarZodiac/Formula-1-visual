import type { Circuit } from './season-2024';

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

export type SeasonSnapshot = {
  exportedAt: string;
  season: number;
  calendar: Array<{
    id: string;
    round: number;
    name: string;
    date: string | null;
    status: string;
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
};

const countryNames = new Intl.DisplayNames(['ru'], { type: 'region' });

const circuitTypes: Record<SeasonSnapshot['calendar'][number]['circuit']['type'], string> = {
  permanent: 'Стационарная трасса',
  street: 'Городская трасса',
  hybrid: 'Смешанная трасса',
  temporary: 'Временная трасса',
};

export function snapshotToCircuits(snapshot: SeasonSnapshot): Circuit[] {
  return snapshot.calendar.map((race) => ({
    id: race.circuit.id,
    geometryId: race.circuit.id,
    order: race.round,
    raceName: race.name,
    name: race.circuit.shortName ?? race.circuit.name,
    officialName: race.circuit.name,
    city: race.circuit.locality ?? 'Не указано',
    country: countryNames.of(race.circuit.countryCode) ?? race.circuit.countryCode,
    date: race.date ?? '',
    type: circuitTypes[race.circuit.type],
    coordinates: race.circuit.coordinates,
  }));
}
