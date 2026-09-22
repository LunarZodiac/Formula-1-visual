"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { addAtlasMapAttribution } from "../lib/map-attribution";
import { useTheme, type AtlasTheme } from "./theme-provider";

const COUNTRIES_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";
const codeExpression: maplibregl.ExpressionSpecification = ["upcase", ["case",
  ["all", ["has", "ISO_A2"], ["!=", ["get", "ISO_A2"], "-99"]], ["get", "ISO_A2"],
  ["coalesce", ["get", "ISO_A2_EH"], ["get", "POSTAL"], ""]]];

const style: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    world: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: "&copy; OpenStreetMap contributors &copy; OpenFreeMap" },
  },
  layers: [
    { id: "driver-map-bg", type: "background", paint: { "background-color": "#02090d" } },
    { id: "driver-map-water", type: "fill", source: "world", "source-layer": "water", paint: { "fill-color": "#02090d" } },
    { id: "driver-map-labels", type: "symbol", source: "world", "source-layer": "place", minzoom: 1,
      layout: { "text-field": ["coalesce", ["get", "name:ru"], ["get", "name"]], "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 1, 10, 5, 13], "text-allow-overlap": false },
      paint: { "text-color": "#9ebcc1", "text-halo-color": "#061015", "text-halo-width": 1.2 } },
  ],
};

function applyDriverMapTheme(map: MapLibreMap, theme: AtlasTheme) {
  const isLight = theme === "light";
  const paint = (layerId: string, property: string, value: unknown) => {
    if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value);
  };

  paint("driver-map-bg", "background-color", isLight ? "#e8efef" : "#02090d");
  paint("driver-map-water", "fill-color", isLight ? "#b9d6df" : "#02090d");
  paint("driver-map-labels", "text-color", isLight ? "#334d58" : "#9ebcc1");
  paint("driver-map-labels", "text-halo-color", isLight ? "#f7faf8" : "#061015");
  paint("driver-country-base", "fill-color", isLight ? "#d9e4df" : "#173238");
  paint("driver-country-outline", "line-color", isLight ? "#526d78" : "#668087");
  paint("driver-country-outline", "line-opacity", isLight ? .72 : .65);
  paint("driver-country-selection-outline", "line-color", isLight ? "#263b44" : "#ffffff");
}

export function DriverCountryMap({ selected, answer, revealed, onSelect }: {
  selected: string | null; answer: string; revealed: boolean; onSelect: (code: string, name: string) => void;
}) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const revealedRef = useRef(revealed);
  const [available, setAvailable] = useState(true);
  const [ready, setReady] = useState(false);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { revealedRef.current = revealed; }, [revealed]);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({ container: containerRef.current, style, center: [5, 17], zoom: .65, minZoom: -2, maxZoom: 8,
        renderWorldCopies: false, attributionControl: false,
        transformConstrain: (center, zoom) => ({ center: new maplibregl.LngLat(Math.max(-180, Math.min(180, center.lng)), Math.max(-85, Math.min(85, center.lat))), zoom: Math.max(-2, Math.min(8, zoom)) }) });
    } catch { queueMicrotask(() => setAvailable(false)); return undefined; }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    addAtlasMapAttribution(map);
    map.on("load", () => {
      map.addSource("driver-countries", { type: "geojson", data: COUNTRIES_URL, attribution: "Natural Earth" });
      map.addLayer({ id: "driver-country-base", type: "fill", source: "driver-countries", paint: { "fill-color": "#173238", "fill-opacity": 0.72 } }, "driver-map-labels");
      map.addLayer({ id: "driver-country-outline", type: "line", source: "driver-countries", paint: { "line-color": "#668087", "line-width": 0.7, "line-opacity": 0.65 } }, "driver-map-labels");
      map.addLayer({ id: "driver-country-selection", type: "fill", source: "driver-countries", filter: ["==", codeExpression, "__NONE__"],
        paint: { "fill-color": "#f5c555", "fill-opacity": 0.8 } }, "driver-map-labels");
      map.addLayer({ id: "driver-country-selection-outline", type: "line", source: "driver-countries", filter: ["==", codeExpression, "__NONE__"],
        paint: { "line-color": "#ffffff", "line-width": 2.2 } }, "driver-map-labels");
      applyDriverMapTheme(map, document.documentElement.dataset.theme === "light" ? "light" : "dark");
      setAvailable(true); setReady(true);
    });
    map.on("error", () => setAvailable(false));
    map.on("mousemove", "driver-country-base", () => { map.getCanvas().style.cursor = revealedRef.current ? "default" : "pointer"; });
    map.on("mouseleave", "driver-country-base", () => { map.getCanvas().style.cursor = ""; });
    map.on("click", "driver-country-base", (event) => {
      if (revealedRef.current) return;
      const feature = event.features?.[0];
      const primary = String(feature?.properties?.ISO_A2 ?? "");
      const code = String(primary && primary !== "-99" ? primary : feature?.properties?.ISO_A2_EH ?? feature?.properties?.POSTAL ?? "").toUpperCase();
      const name = String(feature?.properties?.NAME_RU ?? feature?.properties?.NAME_EN ?? feature?.properties?.ADMIN ?? code);
      if (/^[A-Z]{2}$/.test(code)) onSelectRef.current(code, name);
    });
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) applyDriverMapTheme(map, theme);
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer("driver-country-selection")) return;
    const codes = revealed ? [selected, answer].filter(Boolean) as string[] : selected ? [selected] : [];
    const filter: maplibregl.FilterSpecification = codes.length ? ["in", codeExpression, ["literal", codes]] : ["==", codeExpression, "__NONE__"];
    map.setFilter("driver-country-selection", filter);
    map.setFilter("driver-country-selection-outline", filter);
    map.setPaintProperty("driver-country-selection", "fill-color", revealed
      ? ["case", ["==", codeExpression, answer], "#35d5c2", "#ff365c"]
      : "#f5c555");
  }, [answer, ready, revealed, selected]);

  return <div className="driver-country-map-wrap"><div ref={containerRef} className="driver-country-map" aria-label="Карта стран мира" />
    {!available ? <p role="status">Не удалось загрузить контуры стран. Проверьте подключение к сети</p> : null}</div>;
}
