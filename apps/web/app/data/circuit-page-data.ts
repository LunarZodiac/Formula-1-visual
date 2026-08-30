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
    countryCode?: string;
    coordinates: [number, number];
  };
  summary: {
    description: string;
    typeRu: string;
    metrics: Array<{ label: string; value: string }>;
    highlights?: string[];
    statBar?: Array<{
      label: string;
      value: string;
      note?: string;
      icon?: 'length' | 'turns' | 'debut' | 'record' | 'elevation' | 'type';
    }>;
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
    story?: {
      stats: Array<{ value: string; label: string }>;
      chapters: Array<{
        id: string;
        index: string;
        eyebrow: string;
        title: string;
        description: string;
        markerIds: string[];
        image?: string;
      }>;
      markers: Array<{
        id: string;
        label: string;
        kind: string;
        x: number;
        y: number;
      }>;
      zones: Array<{
        id: string;
        mapFeatureId: string;
        name: string;
        character: string;
        travelTime: string;
        bestFor: string;
        tone: string;
        image?: string;
      }>;
      routes: Array<{
        id: string;
        type: string;
        title: string;
        distance: string;
        duration: string;
        stops: string[];
        description: string;
        image?: string;
      }>;
      gallery?: Array<{
        src: string;
        title: string;
        description: string;
        credit?: string;
        license?: string;
        sourceUrl?: string;
      }>;
    };
    planner?: {
      useful: Array<{ label: string; value: string; detail: string }>;
    };
  };
  history?: Array<{
    year: string;
    title: string;
    description: string;
    image?: string;
    imageAlt?: string;
    credit?: string;
    license?: string;
    sourceUrl?: string;
  }>;
};

export const bahrainCircuitPage = bahrainPageJson as CircuitPageData;
export const spaCircuitPage = spaPageJson as CircuitPageData;

export const circuitPageCatalog = new Map<string, CircuitPageData>([
  [bahrainCircuitPage.slug, bahrainCircuitPage],
  [spaCircuitPage.slug, spaCircuitPage],
]);
