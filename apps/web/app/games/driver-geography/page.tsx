import type { Metadata } from "next";
import driversJson from "../../data/catalogs/drivers-2026.json";
import { DriverGeographyGame } from "../../components/driver-geography-game";

export const metadata: Metadata = { title: "География пилотов — География скорости", description: "Найдите на карте страну рождения пилота Formula 1" };

const birthCountries = [
  { endings: ["Италия"], code: "IT", name: "Италия" },
  { endings: ["Англия", "Шотландия", "Уэльс", "Северная Ирландия"], code: "GB", name: "Великобритания" },
  { endings: ["Бельгия"], code: "BE", name: "Бельгия" },
  { endings: ["Австралия"], code: "AU", name: "Австралия" },
  { endings: ["Франция"], code: "FR", name: "Франция" },
  { endings: ["Новая Зеландия"], code: "NZ", name: "Новая Зеландия" },
  { endings: ["Аргентина"], code: "AR", name: "Аргентина" },
  { endings: ["Германия"], code: "DE", name: "Германия" },
  { endings: ["Испания"], code: "ES", name: "Испания" },
  { endings: ["Япония"], code: "JP", name: "Япония" },
  { endings: ["Бразилия"], code: "BR", name: "Бразилия" },
  { endings: ["Канада"], code: "CA", name: "Канада" },
  { endings: ["США"], code: "US", name: "США" },
] as const;

export default function DriverGeographyPage() {
  const drivers = driversJson.drivers.flatMap((driver) => {
    const birthPlace = "birthPlace" in driver && typeof driver.birthPlace === "string" ? driver.birthPlace : "";
    const country = birthCountries.find((item) => item.endings.some((ending) => birthPlace.endsWith(ending)));
    if (!birthPlace || !country) return [];
    return [{ id: driver.id, name: driver.nameRu, code: driver.code, photoUrl: "photoUrl" in driver && typeof driver.photoUrl === "string" ? driver.photoUrl : null,
      birthPlace, countryCode: country.code, countryName: country.name }];
  });
  return <DriverGeographyGame drivers={drivers} />;
}
