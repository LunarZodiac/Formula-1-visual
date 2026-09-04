import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CircuitExperience } from '../../components/bahrain-circuit-experience';
import { circuitPageCatalog } from '../../data/circuit-page-data';

type CircuitPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return [...circuitPageCatalog.keys()].map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: CircuitPageProps): Promise<Metadata> {
  const { slug } = await params;
  const circuit = circuitPageCatalog.get(slug);
  if (!circuit) return {};

  return {
    title: `${circuit.nameRu} — География скорости`,
    description: circuit.summary.description,
    openGraph: {
      title: `${circuit.nameRu} — География скорости`,
      description: circuit.summary.description,
      images: [],
    },
  };
}

export default async function CircuitPage({ params }: CircuitPageProps) {
  const { slug } = await params;
  const circuit = circuitPageCatalog.get(slug);
  if (!circuit) notFound();

  return <CircuitExperience pageData={circuit} />;
}
