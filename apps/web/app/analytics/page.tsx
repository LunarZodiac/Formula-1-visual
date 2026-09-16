import type { Metadata } from 'next';
import allDriversJson from '../data/catalogs/drivers-all.json';
import seasonsJson from '../../public/data/f1/seasons.json';
import { AnalyticsDashboard, type AnalyticsDriverOption } from '../components/analytics-dashboard';

export const metadata: Metadata = {
  title: 'Аналитика — География скорости',
  description: 'Сравнение пилотов Formula 1 и карта их результатов по трассам',
};

const availableSeasons = seasonsJson.seasons.filter((season) => season.status !== 'planned' && season.racesAvailable > 0).map((season) => season.year).sort((a, b) => b - a);

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const query = await searchParams;
  const requestedSeason = Number(query.season);
  const initialSeason = availableSeasons.includes(requestedSeason) ? requestedSeason : availableSeasons[0];
  const drivers = (allDriversJson.drivers as AnalyticsDriverOption[]).map((driver) => ({
    id: driver.id,
    nameRu: driver.nameRu,
    nameEn: driver.nameEn,
    code: driver.code,
    firstSeason: driver.firstSeason,
    latestSeason: driver.latestSeason,
  }));
  return <AnalyticsDashboard drivers={drivers} seasons={availableSeasons} initialSeason={initialSeason} />;
}
