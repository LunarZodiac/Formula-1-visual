"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { answerNearGuess } from "../lib/games-engine";

type Stage = { id: string; name: string; coordinates: [number, number] };
function routeData(stages: Stage[]) {
  const segments = stages.slice(1).map((stage, index) => {
    const previous = stages[index];
    return [previous.coordinates, [answerNearGuess(previous.coordinates[0], stage.coordinates[0]), stage.coordinates[1]]];
  });
  return { type: "FeatureCollection", features: [
    { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: segments } },
    ...stages.map((stage, index) => ({ type: "Feature", properties: { order: index + 1, name: stage.name }, geometry: { type: "Point", coordinates: stage.coordinates } })),
  ] } as GeoJSON.FeatureCollection;
}

const mapStyle: maplibregl.StyleSpecification = { version: 8, glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf", sources: {
  satellite: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "Tiles © Esri" },
  labels: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: "© OpenStreetMap contributors · OpenFreeMap" },
}, layers: [
  { id: "calendar-bg", type: "background", paint: { "background-color": "#02090d" } },
  { id: "calendar-satellite", type: "raster", source: "satellite", paint: { "raster-brightness-max": .5, "raster-saturation": -.35, "raster-contrast": .12 } },
  { id: "calendar-boundaries", type: "line", source: "labels", "source-layer": "boundary", paint: { "line-color": "#dce7ea", "line-width": .65, "line-opacity": .35 } },
  { id: "calendar-labels", type: "symbol", source: "labels", "source-layer": "place", minzoom: .6, layout: { "text-field": ["coalesce", ["get", "name:ru"], ["get", "name"]], "text-font": ["Noto Sans Regular"], "text-size": 10 }, paint: { "text-color": "#f4f7f8", "text-halo-color": "#071014", "text-halo-width": 1.5 } },
] };

export function CalendarRouteMap({ stages }: { stages: Stage[] }) {
  const containerRef = useRef<HTMLDivElement>(null); const mapRef = useRef<MapLibreMap | null>(null); const readyRef = useRef(false); const initialStagesRef = useRef(stages);
  useEffect(() => {
    if (!containerRef.current) return undefined;
    const map = new maplibregl.Map({ container: containerRef.current, style: mapStyle, center: [12, 23], zoom: .8, minZoom: -2, maxZoom: 7, renderWorldCopies: false, attributionControl: { compact: true },
      transformConstrain: (center, zoom) => ({ center: new maplibregl.LngLat(Math.max(-180, Math.min(180, center.lng)), Math.max(-85, Math.min(85, center.lat))), zoom: Math.max(-2, Math.min(7, zoom)) }) });
    mapRef.current = map; map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => { map.addSource("calendar-route", { type: "geojson", data: routeData(initialStagesRef.current) });
      map.addLayer({ id: "calendar-route-line-shadow", type: "line", source: "calendar-route", filter: ["==", ["geometry-type"], "MultiLineString"], paint: { "line-color": "#030b0f", "line-width": 4.5, "line-opacity": .7 } });
      map.addLayer({ id: "calendar-route-line", type: "line", source: "calendar-route", filter: ["==", ["geometry-type"], "MultiLineString"], paint: { "line-color": "#ffffff", "line-width": 2.25, "line-opacity": .92 } });
      map.addLayer({ id: "calendar-route-points", type: "circle", source: "calendar-route", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#ff365c", "circle-radius": 7, "circle-stroke-color": "#edf6f7", "circle-stroke-width": 1.5 } });
      map.addLayer({ id: "calendar-route-order", type: "symbol", source: "calendar-route", filter: ["==", ["geometry-type"], "Point"], layout: { "text-field": ["to-string", ["get", "order"]], "text-font": ["Noto Sans Regular"], "text-size": 9 }, paint: { "text-color": "#fff" } }); readyRef.current = true; });
    return () => { map.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => { if (!readyRef.current) return; (mapRef.current?.getSource("calendar-route") as GeoJSONSource | undefined)?.setData(routeData(stages)); }, [stages]);
  return <div ref={containerRef} className="calendar-route-map" aria-label="Маршрут календаря на карте мира" />;
}
