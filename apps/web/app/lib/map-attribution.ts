import type { ControlPosition, IControl, Map as MapLibreMap } from 'maplibre-gl';
import settings from '../data/map-ui-settings.json';

class AtlasAttributionControl implements IControl {
  private container?: HTMLDivElement;

  onAdd() {
    const container = document.createElement('div');
    container.className = `maplibregl-ctrl atlas-map-attribution${settings.detailedAttribution ? ' is-detailed' : ''}`;
    const osm = document.createElement('a');
    osm.href = 'https://www.openstreetmap.org/copyright'; osm.target = '_blank'; osm.rel = 'noreferrer';
    osm.textContent = settings.detailedAttribution ? '© OpenStreetMap contributors' : '© OSM';
    const separator = document.createTextNode(' · ');
    const openFreeMap = document.createElement('a');
    openFreeMap.href = 'https://openfreemap.org/'; openFreeMap.target = '_blank'; openFreeMap.rel = 'noreferrer';
    openFreeMap.textContent = settings.detailedAttribution ? 'OpenFreeMap' : 'OFM';
    container.append(osm, separator, openFreeMap);
    if (settings.detailedAttribution) {
      const mapTilerSeparator = document.createTextNode(' · ');
      const mapTiler = document.createElement('a');
      mapTiler.href = 'https://www.maptiler.com/copyright/'; mapTiler.target = '_blank'; mapTiler.rel = 'noreferrer'; mapTiler.textContent = 'MapTiler';
      container.append(mapTilerSeparator, mapTiler);
    }
    this.container = container;
    return container;
  }

  onRemove() { this.container?.remove(); this.container = undefined; }
}

export function addAtlasMapAttribution(map: MapLibreMap, position: ControlPosition = 'bottom-right') {
  map.addControl(new AtlasAttributionControl(), position);
}

export const detailedMapAttribution = settings.detailedAttribution;
