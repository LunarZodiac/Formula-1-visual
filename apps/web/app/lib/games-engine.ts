/** Чистые правила игр без работы с хранилищем браузера и побочных эффектов интерфейса. */
export type GameKind = "outline" | "map";
export type Difficulty = "easy" | "hard";
export type GameEra = "all" | "1950s" | "1970s" | "1980s" | "1990s" | "2000s" | "2010s" | "2020s";
export const gameEras: Array<{ id: GameEra; label: string; from: number; to: number }> = [
  { id: "all", label: "Все эпохи · 1950–2026", from: 1950, to: 2026 },
  { id: "1950s", label: "1950–1969", from: 1950, to: 1969 },
  { id: "1970s", label: "1970–1979", from: 1970, to: 1979 },
  { id: "1980s", label: "1980–1989", from: 1980, to: 1989 },
  { id: "1990s", label: "1990–1999", from: 1990, to: 1999 },
  { id: "2000s", label: "2000–2009", from: 2000, to: 2009 },
  { id: "2010s", label: "2010–2019", from: 2010, to: 2019 },
  { id: "2020s", label: "2020–2026", from: 2020, to: 2026 },
];
export type GameCircuit = {
  id: string;
  slug: string;
  nameRu: string;
  countryRu: string;
  coordinates: [number, number];
  outline: string;
  outlines: Partial<Record<GameEra, string>>;
  allOutlines: string[];
  isCurrent: boolean;
};
export type Progress = {
  xp: number;
  records: Record<string, number>;
  completed: string[];
};
export const emptyProgress = (): Progress => ({
  xp: 0,
  records: {},
  completed: [],
});
const ranks = [
  {
    name: "Новичок",
    min: 0,
    badge: "01",
    accent: "#78929a",
    reward: "Базовая рамка профиля",
  },
  {
    name: "Маршал",
    min: 500,
    badge: "02",
    accent: "#ff365c",
    reward: "Красный акцент интерфейса",
  },
  {
    name: "Стратег",
    min: 1500,
    badge: "03",
    accent: "#00c9c3",
    reward: "Бирюзовая метка звания",
  },
  {
    name: "Эксперт",
    min: 3500,
    badge: "04",
    accent: "#4d8fe6",
    reward: "Двойная рамка профиля",
  },
  {
    name: "Географ скорости",
    min: 7000,
    badge: "05",
    accent: "#ff7b63",
    reward: "Финальный градиент профиля",
  },
];
export function rankForXp(xp: number) {
  const index = Math.max(
    0,
    ranks.findLastIndex((rank) => xp >= rank.min),
  );
  return { ...ranks[index], level: index + 1, next: ranks[index + 1]?.min ?? null };
}
export function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad,
    dLon = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

/** Размещает раскрытую точку рядом с ответом, чтобы линия не обходила карту через антимеридиан. */
export function answerNearGuess(
  guessLongitude: number,
  answerLongitude: number,
) {
  const delta = answerLongitude - guessLongitude;
  if (delta > 180) return answerLongitude - 360;
  if (delta < -180) return answerLongitude + 360;
  return answerLongitude;
}
export function scoreRound(
  kind: GameKind,
  correct: boolean,
  distance: number | null,
  hint: boolean,
  difficulty: Difficulty,
): number {
  const base =
    kind === "outline"
      ? correct
        ? 1000
        : 0
      : distance !== null && Number.isFinite(distance) && distance >= 0
        ? 1000 * Math.exp(-distance / (difficulty === "easy" ? 1000 : 350))
        : 0;
  return Math.round(base * (hint ? 0.75 : 1));
}
export function readProgress(raw: string | null): Progress {
  try {
    const value = JSON.parse(raw ?? "null");
    if (
      !value ||
      !Number.isSafeInteger(value.xp) ||
      value.xp < 0 ||
      !Array.isArray(value.completed) ||
      !value.records ||
      typeof value.records !== "object" ||
      Array.isArray(value.records)
    )
      return emptyProgress();
    const records: Record<string, number> = {};
    for (const [key, score] of Object.entries(value.records)) {
      if (
        /^(?:(outline|map)-(easy|hard)-(true|false|timed|untimed)|(driver-geography|calendar)-[a-z0-9-]+)$/.test(key) &&
        typeof score === "number" &&
        Number.isInteger(score) &&
        score >= 0 &&
        score <= 5000
      )
        records[key] = score;
    }
    return {
      xp: value.xp,
      records,
      completed: value.completed
        .filter((id: unknown) => typeof id === "string")
        .slice(-100),
    };
  } catch {
    return emptyProgress();
  }
}
export function awardSession(
  progress: Progress,
  sessionId: string,
  key: string,
  score: number,
): Progress {
  if (progress.completed.includes(sessionId)) return progress;
  const safeScore = Number.isFinite(score)
    ? Math.round(Math.max(0, Math.min(5000, score)))
    : 0;
  return {
    xp: progress.xp + xpForScore(safeScore),
    records: {
      ...progress.records,
      [key]: Math.max(progress.records[key] ?? 0, safeScore),
    },
    completed: [...progress.completed, sessionId].slice(-100),
  };
}
export function xpForScore(score: number): number {
  const safeScore = Number.isFinite(score)
    ? Math.round(Math.max(0, Math.min(5000, score)))
    : 0;
  return 25 + Math.floor(safeScore / 50);
}
/** Локальная равнопромежуточная проекция сохраняет форму и пропорции без упрощения контура. */
export function outlinePoints(coordinates: readonly number[][]): string {
  if (
    coordinates.length < 3 ||
    coordinates.some(
      (p) => p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]),
    )
  )
    return "";
  const midLat =
    coordinates.reduce((sum, p) => sum + p[1], 0) / coordinates.length;
  const projected = coordinates.map(([lon, lat]) => [
    lon * Math.cos((midLat * Math.PI) / 180),
    -lat,
  ]);
  const xs = projected.map((p) => p[0]),
    ys = projected.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const scale = 260 / Math.max(maxX - minX, maxY - minY);
  if (!Number.isFinite(scale)) return "";
  return projected
    .map(
      ([x, y]) =>
        `${(150 + (x - (minX + maxX) / 2) * scale).toFixed(3)},${(150 + (y - (minY + maxY) / 2) * scale).toFixed(3)}`,
    )
    .join(" ");
}
