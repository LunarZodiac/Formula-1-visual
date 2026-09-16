import type { Metadata } from 'next';
import { AllTeamCatalog, TeamCatalog } from '../components/team-catalog';
import { getAllTeamCatalog, getTeamCatalog } from '../data/season-catalogs';

export const metadata: Metadata = {
  title: 'Кубок конструкторов — География скорости',
  description: 'Команды Formula 1, турнирная таблица и история выступлений',
};

export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const requested = await searchParams;
  const requestedSeason = Number(requested.season);
  if (!requested.season || !Number.isInteger(requestedSeason)) {
    return <AllTeamCatalog teams={getAllTeamCatalog().teams} />;
  }
  const catalog = await getTeamCatalog(requestedSeason);
  return <TeamCatalog season={catalog.season} afterRound={catalog.afterRound} teams={catalog.teams} />;
}
