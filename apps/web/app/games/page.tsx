import type { Metadata } from "next";
import catalog from "../data/catalogs/circuits.json";
import originals from "../data/circuits.json";
import { circuitGeometryRegistry } from "../data/track-geometry-registry";
import { getTrackGeometry } from "../data/track-geometries";
import { gameEras, outlinePoints, type GameCircuit } from "../lib/games-engine";
import { GamesHub } from "../components/games-hub";

export const metadata: Metadata = {
  title: "Игры — География скорости",
  description:
    "Угадывайте контуры трасс Formula 1, находите их на карте и повышайте звание",
};

export default function GamesPage() {
  // Вариант эпохи появляется только для подтверждённого этапа и конфигурации конкретного сезона.
  const circuits: GameCircuit[] = catalog.circuits.flatMap((circuit) => {
    const geometryId =
      circuitGeometryRegistry[
        circuit.id as keyof typeof circuitGeometryRegistry
      ];
    const defaultFeature = originals.features.find((item) => item.properties.id === geometryId);
    const defaultOutline = defaultFeature?.geometry.type === "LineString"
      ? outlinePoints(defaultFeature.geometry.coordinates) : "";
    const outlines = Object.fromEntries(gameEras.filter((era) => era.id !== "all").flatMap((era) => {
      const season = circuit.seasons.find((year) => year >= era.from && year <= era.to);
      if (!season) return [];
      const geometry = getTrackGeometry(circuit.id, season);
      if (!geometry || geometry.geometry.type !== "LineString") return [];
      const outline = outlinePoints(geometry.geometry.coordinates);
      return outline ? [[era.id, outline]] : [];
    }));
    if (
      circuit.coordinates.length !== 2 ||
      !circuit.coordinates.every(Number.isFinite)
    )
      return [];
    return [
      {
        id: circuit.id,
        slug: circuit.slug,
        nameRu: circuit.nameRu,
        countryRu: circuit.countryRu,
        coordinates: [circuit.coordinates[0], circuit.coordinates[1]] as [
          number,
          number,
        ],
        outline: defaultOutline || Object.values(outlines)[0] || "",
        outlines,
        allOutlines: Object.values(outlines),
        isCurrent: circuit.competitionStatus === "active",
      },
    ];
  });
  return <GamesHub circuits={circuits} />;
}
