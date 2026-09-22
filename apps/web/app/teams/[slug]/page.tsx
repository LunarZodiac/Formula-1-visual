import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '../../components/breadcrumbs';
import { TeamLineageSection, TeamProfile } from '../../components/competitor-profile';
import { TeamLogo } from '../../components/racing-visuals';
import { getAllTeamCatalog, getTeamCatalog } from '../../data/season-catalogs';

type TeamPageProps = { params: Promise<{ slug: string }>; searchParams: Promise<{ season?: string }> };
const teams = getAllTeamCatalog().teams;

export function generateStaticParams() { return teams.map((team) => ({ slug: team.id })); }

export async function generateMetadata({ params }: TeamPageProps): Promise<Metadata> {
  const { slug } = await params;
  const team = teams.find((item) => item.id === slug);
  return team ? { title: `${team.name} — География скорости`, description: `Профиль и география результатов команды ${team.name}` } : {};
}

export default async function TeamPage({ params, searchParams }: TeamPageProps) {
  const { slug } = await params;
  const requested = await searchParams;
  const indexedTeam = teams.find((item) => item.id === slug);
  if (!indexedTeam) notFound();
  const requestedSeason = Number(requested.season);
  const selectedCatalog = await getTeamCatalog(Number.isInteger(requestedSeason) ? requestedSeason : indexedTeam.latestSeason);
  const team = selectedCatalog.teams.find((item) => item.id === slug);
  if (!team) return <main className="constructors-page"><Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: 'Команды', href: '/teams' }, { label: indexedTeam.name }]} /><header className="constructors-hero"><div><span>Архивная команда</span><h1>{indexedTeam.name}</h1><p>{indexedTeam.firstSeason === indexedTeam.latestSeason ? `Сезон ${indexedTeam.latestSeason}` : `Сезоны ${indexedTeam.firstSeason}–${indexedTeam.latestSeason}`} · отдельный Кубок конструкторов для этого периода отсутствует в базе</p></div><TeamLogo constructorId={indexedTeam.id} constructorName={indexedTeam.name} season={indexedTeam.latestSeason} logoUrl={indexedTeam.logoUrl} /></header><section className="constructors-history"><header><span>Доступные сведения</span><h2>Участие в Гран-при</h2></header><div><article><dl><div><dt>Сезонов</dt><dd>{indexedTeam.seasonCount}</dd></div><div><dt>Гран-при</dt><dd>{indexedTeam.raceEntries}</dd></div><div><dt>Победы</dt><dd>{indexedTeam.wins}</dd></div></dl></article></div></section><TeamLineageSection lineages={indexedTeam.lineages} /><p className="constructors-note">Карточка автоматически собрана из результатов. Историческое описание и медиаматериалы добавляются только с проверяемыми источниками</p></main>;
  return <TeamProfile season={selectedCatalog.season} team={team} lineages={indexedTeam.lineages} />;
}
