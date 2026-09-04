import type { Metadata } from 'next';
import catalogJson from '../data/catalogs/drivers-2026.json';
import { DriverCatalog } from '../components/driver-catalog';
import { assertCompetitorCatalog, type DriverCatalogData } from '../data/competitor-contract';

assertCompetitorCatalog(catalogJson, 'drivers');
const catalog = catalogJson as DriverCatalogData;

export const metadata: Metadata = {
  title: 'Пилоты — География скорости',
  description: 'Каталог пилотов Formula 1 сезона 2026',
};

export default function DriversPage() {
  return <DriverCatalog season={catalog.season} afterRound={catalog.afterRound} drivers={catalog.drivers} />;
}
