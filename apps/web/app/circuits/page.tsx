import type { Metadata } from 'next';
import catalogJson from '../data/catalogs/circuits.json';
import { CircuitCatalog, type CircuitCatalogItem } from '../components/circuit-catalog';

export const metadata: Metadata = {
  title: 'Каталог трасс — География скорости',
  description: 'Каталог трасс Formula 1 с карточками, компактным списком, фильтрами и интерактивной картой',
};

export default function CircuitsPage() {
  return <CircuitCatalog season={catalogJson.season} circuits={catalogJson.circuits as CircuitCatalogItem[]} />;
}
