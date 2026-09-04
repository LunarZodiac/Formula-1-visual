import type { Metadata } from 'next';
import { SiteSearch } from '../components/site-search';

export const metadata: Metadata = {
  title: 'Поиск — География скорости',
  description: 'Поиск по трассам, этапам, пилотам, командам и географии Formula 1',
};

type SearchPageProps = { searchParams: Promise<{ q?: string }> };

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = '' } = await searchParams;
  return <SiteSearch initialQuery={q} />;
}
