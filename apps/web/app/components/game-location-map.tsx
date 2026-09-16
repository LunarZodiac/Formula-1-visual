"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { addAtlasMapAttribution } from "../lib/map-attribution";
import { answerNearGuess } from "../lib/games-engine";

type Coordinate = [number, number];

type GameLocationMapProps = {
  selection: Coordinate | null;
  answer: Coordinate;
  revealed: boolean;
  disabled?: boolean;
  onSelect: (coordinate: Coordinate) => void;
};

type GeoData = Parameters<GeoJSONSource["setData"]>[0];
const emptyCollection = { type: "FeatureCollection", features: [] } as GeoData;

const gameMapStyle: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    world: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
      attribution: "&copy; OpenStreetMap contributors &copy; OpenFreeMap",
    },
  },
  layers: [
    {
      id: "game-map-background",
      type: "background",
      paint: { "background-color": "#061015" },
    },
    {
      id: "game-map-land",
      type: "fill",
      source: "world",
      "source-layer": "landcover",
      paint: { "fill-color": "#173238", "fill-opacity": 0.98 },
    },
    {
      id: "game-map-water",
      type: "fill",
      source: "world",
      "source-layer": "water",
      paint: { "fill-color": "#02080d" },
    },
    {
      id: "game-map-boundaries",
      type: "line",
      source: "world",
      "source-layer": "boundary",
      paint: {
        "line-color": "#668087",
        "line-width": 0.7,
        "line-opacity": 0.42,
      },
    },
    {
      id: "game-map-russian-places",
      type: "symbol",
      source: "world",
      "source-layer": "place",
      minzoom: 1.25,
      layout: {
        "text-field": ["coalesce", ["get", "name:ru"], ["get", "name"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 1, 10, 5, 13],
        "text-max-width": 9,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#9ebcc1",
        "text-halo-color": "#061015",
        "text-halo-width": 1.2,
      },
    },
  ],
};

function resultGeoJson(
  selection: Coordinate | null,
  answer: Coordinate,
  revealed: boolean,
): GeoData {
  const features: Array<Record<string, unknown>> = [];
  if (selection)
    features.push({
      type: "Feature",
      properties: { kind: "guess" },
      geometry: { type: "Point", coordinates: selection },
    });
  if (revealed) {
    const resultAnswer: Coordinate = selection
      ? [answerNearGuess(selection[0], answer[0]), answer[1]]
      : answer;
    features.push({
      type: "Feature",
      properties: { kind: "answer" },
      geometry: { type: "Point", coordinates: resultAnswer },
    });
    if (selection)
      features.push({
        type: "Feature",
        properties: { kind: "line" },
        geometry: {
          type: "LineString",
          coordinates: [selection, resultAnswer],
        },
      });
  }
  return { type: "FeatureCollection", features } as GeoData;
}

export function GameLocationMap({
  selection,
  answer,
  revealed,
  disabled = false,
  onSelect,
}: GameLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const disabledRef = useRef(disabled);
  const [available, setAvailable] = useState(true);
  const [ready, setReady] = useState(false);
  const [longitude, setLongitude] = useState(selection?.[0]?.toFixed(3) ?? "");
  const [latitude, setLatitude] = useState(selection?.[1]?.toFixed(3) ?? "");
  const [coordinateError, setCoordinateError] = useState("");

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);
  useEffect(() => {
    queueMicrotask(() => {
      setLongitude(selection?.[0]?.toFixed(3) ?? "");
      setLatitude(selection?.[1]?.toFixed(3) ?? "");
      setCoordinateError("");
    });
  }, [selection]);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    let loaded = false;
    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: gameMapStyle,
        center: [12, 24],
        zoom: 1.35,
        minZoom: -2,
        maxZoom: 10,
        renderWorldCopies: false,
        attributionControl: false,
        transformConstrain: (center, zoom) => ({
          center: new maplibregl.LngLat(
            Math.max(-180, Math.min(180, center.lng)),
            Math.max(-85, Math.min(85, center.lat)),
          ),
          zoom: Math.max(-2, Math.min(10, zoom)),
        }),
      });
    } catch {
      queueMicrotask(() => setAvailable(false));
      return undefined;
    }
    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );
    addAtlasMapAttribution(map);
    const handleError = () => {
      if (!loaded) setAvailable(false);
    };
    map.on("error", handleError);
    map.on("load", () => {
      loaded = true;
      setAvailable(true);
      map.addSource("game-result", { type: "geojson", data: emptyCollection });
      map.addLayer({
        id: "game-result-line",
        type: "line",
        source: "game-result",
        filter: ["==", ["get", "kind"], "line"],
        paint: {
          "line-color": "#f5cf65",
          "line-width": 2,
          "line-dasharray": [2, 2],
        },
      });
      map.addLayer({
        id: "game-result-points",
        type: "circle",
        source: "game-result",
        filter: ["in", ["get", "kind"], ["literal", ["guess", "answer"]]],
        paint: {
          "circle-color": [
            "match",
            ["get", "kind"],
            "answer",
            "#2ed3bd",
            "#ff365c",
          ],
          "circle-radius": ["match", ["get", "kind"], "answer", 8, 7],
          "circle-stroke-color": "#f5fbfc",
          "circle-stroke-width": 2,
        },
      });
      setReady(true);
    });
    map.on("click", (event) => {
      if (disabledRef.current) return;
      onSelectRef.current([event.lngLat.lng, event.lngLat.lat]);
    });
    return () => {
      map.off("error", handleError);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !ready) return;
    (map.getSource("game-result") as GeoJSONSource | undefined)?.setData(
      resultGeoJson(selection, answer, revealed),
    );
    if (revealed) {
      const resultAnswer: Coordinate = selection
        ? [answerNearGuess(selection[0], answer[0]), answer[1]]
        : answer;
      const bounds = new maplibregl.LngLatBounds(resultAnswer, resultAnswer);
      if (selection) bounds.extend(selection);
      map.fitBounds(bounds, {
        padding: 70,
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 650,
        maxZoom: 6,
      });
    }
  }, [answer, ready, revealed, selection]);

  const applyCoordinates = () => {
    if (!longitude.trim() || !latitude.trim()) {
      setCoordinateError("Заполните долготу и широту");
      return;
    }
    const lng = Number(longitude.replace(",", "."));
    const lat = Number(latitude.replace(",", "."));
    if (
      !Number.isFinite(lng) ||
      !Number.isFinite(lat) ||
      lng < -180 ||
      lng > 180 ||
      lat < -85 ||
      lat > 85
    ) {
      setCoordinateError(
        "Допустимо: долгота от −180 до 180, широта от −85 до 85",
      );
      return;
    }
    setCoordinateError("");
    onSelect([lng, lat]);
  };

  return (
    <div className="game-map-shell">
      <div
        ref={containerRef}
        className={`game-map-canvas${available ? "" : " is-unavailable"}`}
        aria-label="Карта мира для выбора точки"
      />
      {!available && (
        <p className="game-map-unavailable" role="status">
          Карта сейчас недоступна. Укажите координаты вручную
        </p>
      )}
      {!revealed && (
        <details className="game-map-keyboard" open={!available}>
          <summary>Выбрать координатами</summary>
          <div>
            <label>
              <span>Долгота</span>
              <input
                inputMode="decimal"
                aria-invalid={Boolean(coordinateError)}
                aria-describedby="game-coordinate-error"
                value={longitude}
                disabled={disabled}
                onChange={(event) => {
                  setLongitude(event.target.value);
                  setCoordinateError("");
                }}
                placeholder="от −180 до 180"
              />
            </label>
            <label>
              <span>Широта</span>
              <input
                inputMode="decimal"
                aria-invalid={Boolean(coordinateError)}
                aria-describedby="game-coordinate-error"
                value={latitude}
                disabled={disabled}
                onChange={(event) => {
                  setLatitude(event.target.value);
                  setCoordinateError("");
                }}
                placeholder="от −85 до 85"
              />
            </label>
            <button
              type="button"
              disabled={disabled}
              onClick={applyCoordinates}
            >
              Поставить точку
            </button>
            {coordinateError && (
              <p
                id="game-coordinate-error"
                className="game-map-coordinate-error"
                role="alert"
              >
                {coordinateError}
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
