import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DriverProfile } from '../../components/competitor-profile';
import { getAllDriverCatalog, getDriverCatalog } from '../../data/season-catalogs';

type DriverPageProps = { params: Promise<{ slug: string }>; searchParams: Promise<{ season?: string }> };
const allCatalog = getAllDriverCatalog();
const drivers = allCatalog.drivers;

export function generateStaticParams() { return drivers.map((driver) => ({ slug: driver.id })); }

export async function generateMetadata({ params }: DriverPageProps): Promise<Metadata> {
  const { slug } = await params;
  const driver = drivers.find((item) => item.id === slug);
  return driver ? { title: `${driver.nameRu} — География скорости`, description: `Профиль и география результатов пилота ${driver.nameRu}` } : {};
}

export default async function DriverPage({ params, searchParams }: DriverPageProps) {
  const { slug } = await params;
  const requested = await searchParams;
  const requestedSeason = Number(requested.season);
  const directoryDriver = drivers.find((item) => item.id === slug);
  if (!directoryDriver) notFound();
  const catalog = await getDriverCatalog(Number.isInteger(requestedSeason) ? requestedSeason : directoryDriver.latestSeason ?? 2026);
  const driver = catalog.drivers.find((item) => item.id === slug);
  if (!driver) notFound();
  return <DriverProfile season={catalog.season} driver={driver} sources={catalog.sources} />;
}
