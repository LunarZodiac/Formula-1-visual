import type { Metadata } from 'next';
import { CircuitExperience } from '../../components/bahrain-circuit-experience';
import { bahrainCircuitPage } from '../../data/circuit-page-data';

export const metadata: Metadata = {
  title: `${bahrainCircuitPage.nameRu} — ${bahrainCircuitPage.officialName} | F1 Geovisual Atlas`,
  description: bahrainCircuitPage.summary.description,
  openGraph: {
    title: `${bahrainCircuitPage.nameRu} — ${bahrainCircuitPage.officialName}`,
    description: bahrainCircuitPage.summary.description,
    images: [],
  },
};

export default function BahrainCircuitPage() {
  return <CircuitExperience pageData={bahrainCircuitPage} />;
}
