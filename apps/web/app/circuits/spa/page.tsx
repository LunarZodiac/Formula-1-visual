import type { Metadata } from 'next';
import { CircuitExperience } from '../../components/bahrain-circuit-experience';
import { spaCircuitPage } from '../../data/circuit-page-data';

export const metadata: Metadata = {
  title: `${spaCircuitPage.nameRu} — География скорости`,
  description: spaCircuitPage.summary.description,
  openGraph: {
    title: `${spaCircuitPage.nameRu} — География скорости`,
    description: spaCircuitPage.summary.description,
    images: [],
  },
};

export default function SpaCircuitPage() {
  return <CircuitExperience pageData={spaCircuitPage} />;
}
