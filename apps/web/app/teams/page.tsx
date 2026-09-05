import type { Metadata } from 'next';
import { TeamCatalog } from '../components/team-catalog';
import { getTeamCatalog } from '../data/season-catalogs';

export const metadata: Metadata = {
  title: 'Кубок конструкторов — География скорости',
  description: 'Команды Formula 1, турнирная таблица и история выступлений',
};

export default async function TeamsPage({ searchParams }: { searchParams?: { season?: string } }) {
  const requestedSeason = Number(searchParams?.season);
  const catalog = await getTeamCatalog(Number.isInteger(requestedSeason) ? requestedSeason : 2026);
  return <TeamCatalog season={catalog.season} afterRound={catalog.afterRound} teams={catalog.teams} />;
}
