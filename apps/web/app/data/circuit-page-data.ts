import bahrainPageJson from './circuit-pages/bahrain.json';
import spaPageJson from './circuit-pages/spa.json';

export type CircuitPageData = {
  schemaVersion: 1;
  id: string;
  slug: string;
  geometryId: string;
  nameRu: string;
  officialName: string;
  location: {
    cityRu: string;
    countryRu: string;
    coordinates: [number, number];
  };
  summary: {
    description: string;
    typeRu: string;
    metrics: Array<{ label: string; value: string }>;
  };
  map: {
    trackCamera: {
      maxZoom: number;
      pitch: number;
      bearing: number;
      padding: number;
    };
    travelBounds: [[number, number], [number, number]];
    travelZoom: number;
  };
  results: {
    seasons: number[];
    defaultSeason: number;
  };
  features: {
    technicalOverlay: boolean;
    travelMode: boolean;
    local3dModel: boolean;
    buildings3d: boolean;
  };
  travel: {
    intro: string;
    categories: Array<{ id: string; label: string }>;
    points: Array<{
      id: string;
      name: string;
      kindRu: string;
      descriptionRu: string;
      coordinates: [number, number];
    }>;
  };
};

export const bahrainCircuitPage = bahrainPageJson as CircuitPageData;
export const spaCircuitPage = spaPageJson as CircuitPageData;

export const circuitPageCatalog = new Map<string, CircuitPageData>([
  [bahrainCircuitPage.slug, bahrainCircuitPage],
  [spaCircuitPage.slug, spaCircuitPage],
]);
