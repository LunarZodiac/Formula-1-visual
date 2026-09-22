export type SavedAnalyticsComparison = {
  id: string;
  label: string;
  savedAt: string;
  scope: "season" | "career";
  season: number;
  driverIds: string[];
  sessionView: "overview" | "race" | "sprint" | "qualifying";
  metric:
    | "wins"
    | "poles"
    | "podiums"
    | "points"
    | "racePoints"
    | "sprintWins"
    | "sprintPodiums"
    | "sprintPoints"
    | "qualifyingEntries";
  mapMode: "shares" | "heat";
  focusId: string;
};

export const savedComparisonsKey = "f1-atlas-analytics-comparisons-v1";
export const analyticsComparisonsExportVersion = 1;
export const savedComparisonsLimit = 8;

const sessionViews = new Set(["overview", "race", "sprint", "qualifying"]);
const metrics = new Set([
  "wins",
  "poles",
  "podiums",
  "points",
  "racePoints",
  "sprintWins",
  "sprintPodiums",
  "sprintPoints",
  "qualifyingEntries",
]);
const mapModes = new Set(["shares", "heat"]);
const comparisonKeys = new Set([
  "id",
  "label",
  "savedAt",
  "scope",
  "season",
  "driverIds",
  "sessionView",
  "metric",
  "mapMode",
  "focusId",
]);
const metricsBySession = new Map([
  ["overview", new Set(["wins", "poles", "podiums", "points"])],
  ["race", new Set(["wins", "podiums", "racePoints"])],
  ["sprint", new Set(["sprintWins", "sprintPodiums", "sprintPoints"])],
  ["qualifying", new Set(["poles", "qualifyingEntries"])],
]);

type AnalyticsComparisonsExport = {
  kind: "f1-atlas-analytics-comparisons";
  version: 1;
  exportedAt: string;
  comparisons: SavedAnalyticsComparison[];
};

function isIsoDate(value: unknown) {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}

function comparisonError(item: unknown, knownDriverIds?: ReadonlySet<string>, knownSeasons?: ReadonlySet<number>): string | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return "Запись сравнения должна быть объектом";
  const row = item as Partial<SavedAnalyticsComparison>;
  const keys = Object.keys(item);
  if (keys.length !== comparisonKeys.size || keys.some((key) => !comparisonKeys.has(key))) {
    return "Запись сравнения содержит неизвестные или отсутствующие поля";
  }
  if (typeof row.id !== "string" || !row.id.trim()) return "У сравнения отсутствует идентификатор";
  if (typeof row.label !== "string" || !row.label.trim()) return "У сравнения отсутствует название";
  if (!isIsoDate(row.savedAt)) return "У сравнения некорректная дата сохранения";
  if (row.scope !== "season" && row.scope !== "career") return `Неизвестный период сравнения: ${String(row.scope)}`;
  if (!Number.isInteger(row.season)) return "У сравнения некорректный сезон";
  if (knownSeasons && !knownSeasons.has(row.season as number)) return `Неизвестный сезон: ${String(row.season)}`;
  if (!Array.isArray(row.driverIds) || row.driverIds.length < 1 || row.driverIds.length > 3) {
    return "В сравнении должно быть от одного до трёх пилотов";
  }
  if (row.driverIds.some((id) => typeof id !== "string" || !id.trim())) return "В сравнении указан некорректный пилот";
  if (new Set(row.driverIds).size !== row.driverIds.length) return "В сравнении пилоты не должны повторяться";
  const unknownDriver = knownDriverIds && row.driverIds.find((id) => !knownDriverIds.has(id));
  if (unknownDriver) return `Неизвестный пилот: ${unknownDriver}`;
  if (!sessionViews.has(row.sessionView ?? "")) return `Неизвестный режим сессии: ${String(row.sessionView)}`;
  if (!metrics.has(row.metric ?? "")) return `Неизвестный показатель: ${String(row.metric)}`;
  if (!metricsBySession.get(row.sessionView ?? "")?.has(row.metric ?? "")) {
    return "Показатель не относится к выбранному режиму сессии";
  }
  if (!mapModes.has(row.mapMode ?? "")) return `Неизвестный режим карты: ${String(row.mapMode)}`;
  if (typeof row.focusId !== "string" || !row.driverIds.includes(row.focusId)) {
    return "Выбранный пилот карты отсутствует в сравнении";
  }
  return null;
}

export function readSavedComparisons(value: string | null): SavedAnalyticsComparison[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SavedAnalyticsComparison => comparisonError(item) === null)
      .slice(0, savedComparisonsLimit);
  } catch {
    return [];
  }
}

export function serializeAnalyticsComparisons(comparisons: SavedAnalyticsComparison[], exportedAt = new Date().toISOString()) {
  const envelope: AnalyticsComparisonsExport = {
    kind: "f1-atlas-analytics-comparisons",
    version: analyticsComparisonsExportVersion,
    exportedAt,
    comparisons,
  };
  return JSON.stringify(envelope, null, 2);
}

export function parseAnalyticsComparisonsExport(
  value: string,
  knownDriverIds: ReadonlySet<string>,
  knownSeasons: ReadonlySet<number>,
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Файл не является корректным JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Файл сравнения должен содержать объект");
  const envelope = parsed as Partial<AnalyticsComparisonsExport>;
  const keys = Object.keys(parsed);
  if (keys.length !== 4 || keys.some((key) => !["kind", "version", "exportedAt", "comparisons"].includes(key))) {
    throw new Error("Файл сравнения содержит неизвестные или отсутствующие поля");
  }
  if (envelope.kind !== "f1-atlas-analytics-comparisons") throw new Error("Это не файл сравнений аналитики Formula 1 Atlas");
  if (envelope.version !== analyticsComparisonsExportVersion) {
    throw new Error(`Версия файла ${String(envelope.version)} не поддерживается`);
  }
  if (!isIsoDate(envelope.exportedAt)) throw new Error("В файле указана некорректная дата экспорта");
  if (!Array.isArray(envelope.comparisons) || !envelope.comparisons.length) throw new Error("В файле нет сравнений для импорта");
  if (envelope.comparisons.length > savedComparisonsLimit) throw new Error("В одном файле может быть не более восьми сравнений");
  envelope.comparisons.forEach((comparison, index) => {
    const message = comparisonError(comparison, knownDriverIds, knownSeasons);
    if (message) throw new Error(`Сравнение ${index + 1}: ${message}`);
  });
  return envelope.comparisons as SavedAnalyticsComparison[];
}

function comparisonFingerprint(item: SavedAnalyticsComparison) {
  return JSON.stringify([
    item.scope,
    item.season,
    item.driverIds,
    item.sessionView,
    item.metric,
    item.mapMode,
    item.focusId,
  ]);
}

export function mergeImportedComparisons(existing: SavedAnalyticsComparison[], imported: SavedAnalyticsComparison[]) {
  const result = existing.slice(0, savedComparisonsLimit);
  const fingerprints = new Set(result.map(comparisonFingerprint));
  const ids = new Set(result.map((item) => item.id));
  for (const item of imported) {
    if (result.length >= savedComparisonsLimit) break;
    const fingerprint = comparisonFingerprint(item);
    if (fingerprints.has(fingerprint)) continue;
    let id = item.id;
    let suffix = 1;
    while (ids.has(id)) id = `${item.id}-import-${suffix++}`;
    result.push({ ...item, id });
    ids.add(id);
    fingerprints.add(fingerprint);
  }
  return result;
}
