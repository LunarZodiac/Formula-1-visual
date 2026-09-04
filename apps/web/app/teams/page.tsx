import type { Metadata } from 'next';
import catalogJson from '../data/catalogs/teams-2026.json';
import { TeamCatalog } from '../components/team-catalog';
import { assertCompetitorCatalog, type TeamCatalogData } from '../data/competitor-contract';

assertCompetitorCatalog(catalogJson, 'teams');
const catalog = catalogJson as TeamCatalogData;

export const metadata: Metadata = {
  title: 'Кубок конструкторов — География скорости',
  description: 'Команды Formula 1, турнирная таблица и история выступлений',
};

export default function TeamsPage() {
  return <TeamCatalog season={catalog.season} afterRound={catalog.afterRound} teams={catalog.teams} />;
}
