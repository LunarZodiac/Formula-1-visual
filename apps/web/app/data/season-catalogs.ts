import allDriversJson from './catalogs/drivers-all.json';
import type { DriverCatalogData, DriverListItem, TeamCatalogData } from './competitor-contract';

const driverCatalogModules = import.meta.glob('./catalogs/drivers-*.json', { import: 'default' }) as Record<string, () => Promise<DriverCatalogData>>;
const teamCatalogModules = import.meta.glob('./catalogs/teams-*.json', { import: 'default' }) as Record<string, () => Promise<TeamCatalogData>>;
const allDrivers = allDriversJson as { schemaVersion: number; generatedAt: string; drivers: DriverListItem[] };

function seasonKey(kind: 'drivers' | 'teams', season: number) {
  return `./catalogs/${kind}-${season}.json`;
}

export async function getDriverCatalog(season: number): Promise<DriverCatalogData> {
  const loader = driverCatalogModules[seasonKey('drivers', season)] ?? driverCatalogModules[seasonKey('drivers', 2026)];
  return loader();
}

export function getAllDriverCatalog() {
  return allDrivers;
}

export async function getTeamCatalog(season: number): Promise<TeamCatalogData> {
  const loader = teamCatalogModules[seasonKey('teams', season)] ?? teamCatalogModules[seasonKey('teams', 2026)];
  return loader();
}
