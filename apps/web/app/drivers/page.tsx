import type { Metadata } from 'next';
import { DriverCatalog } from '../components/driver-catalog';
import { getAllDriverCatalog, getDriverCatalog } from '../data/season-catalogs';

export const metadata: Metadata = {
  title: 'Пилоты — География скорости',
  description: 'Каталог пилотов Formula 1 сезона 2026',
};

export default async function DriversPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const requested = await searchParams;
  const requestedSeason = Number(requested.season);
  const seasonSelected = Number.isInteger(requestedSeason);
  const catalog = seasonSelected ? await getDriverCatalog(requestedSeason) : getAllDriverCatalog();
  return <DriverCatalog key={seasonSelected ? `season-${requestedSeason}` : 'all-seasons'} season={seasonSelected ? requestedSeason : 2026} afterRound={seasonSelected && 'afterRound' in catalog ? catalog.afterRound : 0} drivers={catalog.drivers} seasonSelected={seasonSelected} />;
}
