import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TeamProfile } from '../../components/competitor-profile';
import { assertCompetitorCatalog, type TeamCatalogData } from '../../data/competitor-contract';
import catalogJson from '../../data/catalogs/teams-2026.json';

type TeamPageProps = { params: Promise<{ slug: string }> };
assertCompetitorCatalog(catalogJson, 'teams');
const catalog = catalogJson as TeamCatalogData;
const teams = catalog.teams;

export function generateStaticParams() { return teams.map((team) => ({ slug: team.id })); }

export async function generateMetadata({ params }: TeamPageProps): Promise<Metadata> {
  const { slug } = await params;
  const team = teams.find((item) => item.id === slug);
  return team ? { title: `${team.name} — География скорости`, description: `Профиль и география результатов команды ${team.name}` } : {};
}

export default async function TeamPage({ params }: TeamPageProps) {
  const { slug } = await params;
  const team = teams.find((item) => item.id === slug);
  if (!team) notFound();
  return <TeamProfile season={catalog.season} team={team} sources={catalog.sources} />;
}
