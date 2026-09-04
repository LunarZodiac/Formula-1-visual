import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DriverProfile } from '../../components/competitor-profile';
import { assertCompetitorCatalog, type DriverCatalogData } from '../../data/competitor-contract';
import catalogJson from '../../data/catalogs/drivers-2026.json';

type DriverPageProps = { params: Promise<{ slug: string }> };
assertCompetitorCatalog(catalogJson, 'drivers');
const catalog = catalogJson as DriverCatalogData;
const drivers = catalog.drivers;

export function generateStaticParams() { return drivers.map((driver) => ({ slug: driver.id })); }

export async function generateMetadata({ params }: DriverPageProps): Promise<Metadata> {
  const { slug } = await params;
  const driver = drivers.find((item) => item.id === slug);
  return driver ? { title: `${driver.nameRu} — География скорости`, description: `Профиль и география результатов пилота ${driver.nameRu}` } : {};
}

export default async function DriverPage({ params }: DriverPageProps) {
  const { slug } = await params;
  const driver = drivers.find((item) => item.id === slug);
  if (!driver) notFound();
  return <DriverProfile season={catalog.season} driver={driver} />;
}
