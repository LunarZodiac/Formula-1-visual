import type { Metadata } from "next";
import season from "../../../public/data/f1/season-2026.json";
import seasons from "../../../public/data/f1/seasons.json";
import circuits from "../../data/catalogs/circuits.json";
import { CalendarOptimizerGame } from "../../components/calendar-optimizer-game";

export const metadata: Metadata = { title: "Оптимизатор календаря — География скорости", description: "Переставьте реальные этапы Formula 1 и сократите расстояние перелётов" };

export default function CalendarOptimizerPage() {
  const names = Object.fromEntries(circuits.circuits.map((circuit) => [circuit.id, { name: circuit.nameRu, city: circuit.cityRu }]));
  const stages = season.calendar.map((race) => ({ id: race.id, round: race.round, name: names[race.circuit.id]?.name ?? race.circuit.name,
    city: names[race.circuit.id]?.city ?? race.circuit.locality ?? race.circuit.countryCode, countryCode: race.circuit.countryCode,
    coordinates: race.circuit.coordinates as [number, number] }));
  const seasonOptions = seasons.seasons.filter((item) => item.racesAvailable > 1 && item.year <= season.season).map((item) => item.year);
  return <CalendarOptimizerGame season={season.season} stages={stages} seasonOptions={seasonOptions} circuitNames={names} />;
}
