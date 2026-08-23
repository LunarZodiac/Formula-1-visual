import type { Metadata } from 'next';
import { BahrainCircuitExperience } from '../../components/bahrain-circuit-experience';

export const metadata: Metadata = {
  title: 'Бахрейн — Bahrain International Circuit | F1 Geovisual Atlas',
  description: 'Картографическая страница трассы Бахрейна: контур, характеристики, результаты и ориентиры для поездки.',
  openGraph: {
    title: 'Бахрейн — Bahrain International Circuit',
    description: 'Интерактивная карта трассы и география поездки на этап Formula 1.',
    images: [],
  },
};

export default function BahrainCircuitPage() {
  return <BahrainCircuitExperience />;
}
