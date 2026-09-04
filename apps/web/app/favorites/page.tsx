import type { Metadata } from 'next';
import { FavoritesPage } from '../components/favorites-page';
import circuitsJson from '../data/catalogs/circuits.json';
import driversJson from '../data/catalogs/drivers-2026.json';
import teamsJson from '../data/catalogs/teams-2026.json';
import type { CircuitCatalogItem } from '../components/circuit-catalog';
import type { DriverCatalogItem } from '../components/driver-catalog';
import type { TeamCatalogItem } from '../components/team-catalog';

export const metadata: Metadata = {
  title: 'Избранное — География скорости',
  description: 'Сохранённые трассы, пилоты и команды Formula 1',
};

export default function FavoritesRoute() {
  return <FavoritesPage season={driversJson.season} circuits={circuitsJson.circuits as CircuitCatalogItem[]} drivers={driversJson.drivers as DriverCatalogItem[]} teams={teamsJson.teams as TeamCatalogItem[]} />;
}
