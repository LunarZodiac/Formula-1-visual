import allDriversJson from './catalogs/drivers-all.json';
import allTeamsJson from './catalogs/teams-all.json';
import circuitCatalogJson from './catalogs/circuits.json';
import type { AllTeamCatalogData, DriverCatalogData, DriverListItem, TeamCatalogData } from './competitor-contract';
import { resolveTeamSecondaryName } from './team-secondary-name';

const driverCatalogModules = import.meta.glob('./catalogs/drivers-*.json', { import: 'default' }) as Record<string, () => Promise<DriverCatalogData>>;
const teamCatalogModules = import.meta.glob('./catalogs/teams-*.json', { import: 'default' }) as Record<string, () => Promise<TeamCatalogData>>;
const allDrivers = allDriversJson as { schemaVersion: number; generatedAt: string; drivers: DriverListItem[] };
const allTeams = allTeamsJson as AllTeamCatalogData;
const circuitPages = new Map((circuitCatalogJson.circuits as { id: string; nameRu: string; slug: string }[]).map((circuit) => [circuit.id, circuit]));

function withCircuitPage<T extends { id: string; name: string; slug: string | null; isPublished: boolean }>(circuit: T): T {
  const page = circuitPages.get(circuit.id);
  return {
    ...circuit,
    name: page?.nameRu ?? circuit.name,
    slug: page?.slug ?? circuit.slug,
    // Каждый элемент локального каталога имеет базовый динамический профиль.
    // Редакционный статус источника отвечает только за глубину материала.
    isPublished: Boolean(page?.slug),
  };
}

function localizeDriverCatalog(catalog: DriverCatalogData): DriverCatalogData {
  return { ...catalog, drivers: catalog.drivers.map((driver) => ({
    ...driver,
    resultGeography: driver.resultGeography.map(withCircuitPage),
    successfulCircuits: driver.successfulCircuits.map(withCircuitPage),
  })) };
}

function localizeTeamCatalog(catalog: TeamCatalogData): TeamCatalogData {
  return { ...catalog, teams: catalog.teams.map((team) => ({
    ...team,
    nameRu: resolveTeamSecondaryName(team, catalog.season, allTeams.teams),
    resultGeography: team.resultGeography.map(withCircuitPage),
    successfulCircuits: team.successfulCircuits.map(withCircuitPage),
  })) };
}

function seasonKey(kind: 'drivers' | 'teams', season: number) {
  return `./catalogs/${kind}-${season}.json`;
}

export async function getDriverCatalog(season: number): Promise<DriverCatalogData> {
  const loader = driverCatalogModules[seasonKey('drivers', season)] ?? driverCatalogModules[seasonKey('drivers', 2026)];
  return localizeDriverCatalog(await loader());
}

export function getAllDriverCatalog() {
  return allDrivers;
}

export function getAllTeamCatalog() {
  return allTeams;
}

export async function getTeamCatalog(season: number): Promise<TeamCatalogData> {
  const loader = teamCatalogModules[seasonKey('teams', season)] ?? teamCatalogModules[seasonKey('teams', 2026)];
  return localizeTeamCatalog(await loader());
}
