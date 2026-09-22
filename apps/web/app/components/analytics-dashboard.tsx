"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./analytics-dashboard.css";
import { addAtlasMapAttribution } from "../lib/map-attribution";
import {
  buildAnalytics,
  type AnalyticsDriverOption,
  type CircuitMetric,
  type DriverMetric,
} from "../lib/analytics-data";
import { loadAnalyticsSeasons } from "../lib/analytics-loader";
import {
  mergeImportedComparisons,
  parseAnalyticsComparisonsExport,
  readSavedComparisons,
  savedComparisonsKey,
  savedComparisonsLimit,
  serializeAnalyticsComparisons,
  type SavedAnalyticsComparison as SavedComparison,
} from "../lib/analytics-saved";
import type { SeasonSnapshot } from "../data/web-snapshots";
import { useTheme, type AtlasTheme } from "./theme-provider";
import { Breadcrumbs } from "./breadcrumbs";
export type { AnalyticsDriverOption } from "../lib/analytics-data";

type Props = {
  drivers: AnalyticsDriverOption[];
  seasons: number[];
  initialSeason: number;
};
type Scope = "season" | "career";
type SessionView = "overview" | "race" | "sprint" | "qualifying";
type MapMode = "shares" | "heat";
type Metric =
  | "wins"
  | "poles"
  | "podiums"
  | "points"
  | "racePoints"
  | "sprintWins"
  | "sprintPodiums"
  | "sprintPoints"
  | "qualifyingEntries";
const colors = ["#ff365c", "#35d5c2", "#ffc857"];
const overviewChoices: Array<{ key: Metric; label: string; unit: string }> = [
  { key: "wins", label: "Победы", unit: "побед" },
  { key: "poles", label: "Поулы", unit: "поулов" },
  { key: "podiums", label: "Подиумы", unit: "подиумов" },
  { key: "points", label: "Очки", unit: "очков" },
];
const sessionChoices: Record<SessionView, Array<{ key: Metric; label: string; unit: string }>> = {
  overview: overviewChoices,
  race: [
    { key: "wins", label: "Победы", unit: "побед" },
    { key: "podiums", label: "Подиумы", unit: "подиумов" },
    { key: "racePoints", label: "Очки", unit: "очков" },
  ],
  sprint: [
    { key: "sprintWins", label: "Победы", unit: "побед" },
    { key: "sprintPodiums", label: "Подиумы", unit: "подиумов" },
    { key: "sprintPoints", label: "Очки", unit: "очков" },
  ],
  qualifying: [
    { key: "poles", label: "Поулы", unit: "поулов" },
    { key: "qualifyingEntries", label: "Участия", unit: "участий" },
  ],
};
type CompareRow = {
  key: keyof DriverMetric;
  label: string;
  hint: string;
  low?: boolean;
};
const overviewCompare: CompareRow[] = [
  { key: "wins", label: "Победы", hint: "финиши P1" },
  { key: "poles", label: "Поулы", hint: "P1 в квалификации" },
  { key: "podiums", label: "Подиумы", hint: "финиши P1–P3" },
  { key: "points", label: "Очки", hint: "официальный итог" },
  { key: "starts", label: "Старты", hint: "без не стартовавших" },
  {
    key: "averageFinish",
    label: "Средняя позиция",
    hint: "меньше — лучше",
    low: true,
  },
];
const sessionCompare: Record<SessionView, CompareRow[]> = {
  overview: overviewCompare,
  race: [
    { key: "wins", label: "Победы", hint: "финиши P1" },
    { key: "podiums", label: "Подиумы", hint: "финиши P1–P3" },
    { key: "racePoints", label: "Очки", hint: "начислено в гонках" },
    { key: "starts", label: "Старты", hint: "без не стартовавших" },
    { key: "averageFinish", label: "Средняя позиция", hint: "меньше — лучше", low: true },
  ],
  sprint: [
    { key: "sprintWins", label: "Победы", hint: "финиши P1" },
    { key: "sprintPodiums", label: "Подиумы", hint: "финиши P1–P3" },
    { key: "sprintPoints", label: "Очки", hint: "начислено в спринтах" },
    { key: "sprintStarts", label: "Старты", hint: "без не стартовавших" },
    { key: "sprintAverageFinish", label: "Средняя позиция", hint: "меньше — лучше", low: true },
  ],
  qualifying: [
    { key: "poles", label: "Поулы", hint: "P1 в квалификации" },
    { key: "qualifyingEntries", label: "Участия", hint: "результаты в базе" },
    { key: "averageQualifying", label: "Средняя позиция", hint: "меньше — лучше", low: true },
  ],
};
function metricDetails(metric: Metric) {
  return (
    Object.values(sessionChoices)
      .flat()
      .find((choice) => choice.key === metric) ?? overviewChoices[0]
  );
}
const style: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    base: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#050c10" } },
    {
      id: "land",
      type: "fill",
      source: "base",
      "source-layer": "landcover",
      paint: { "fill-color": "#102a2d", "fill-opacity": 0.94 },
    },
    {
      id: "water",
      type: "fill",
      source: "base",
      "source-layer": "water",
      paint: { "fill-color": "#02070b" },
    },
    {
      id: "roads",
      type: "line",
      source: "base",
      "source-layer": "transportation",
      minzoom: 4,
      paint: { "line-color": "#577078", "line-opacity": 0.18, "line-width": 1 },
    },
  ],
};

function applyAnalyticsMapTheme(map: MapLibreMap, theme: AtlasTheme) {
  const isLight = theme === "light";
  const paint = (layerId: string, property: string, value: unknown) => {
    if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value);
  };

  paint("bg", "background-color", isLight ? "#e8efef" : "#050c10");
  paint("land", "fill-color", isLight ? "#d9e4df" : "#102a2d");
  paint("water", "fill-color", isLight ? "#b9d6df" : "#02070b");
  paint("roads", "line-color", isLight ? "#6d838d" : "#577078");
  paint("roads", "line-opacity", isLight ? 0.3 : 0.18);
}
const number = (v: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(v);
function grouped(points: CircuitMetric[]) {
  const m = new Map<string, CircuitMetric[]>();
  points.forEach((p) => m.set(p.circuitId, [...(m.get(p.circuitId) ?? []), p]));
  return [...m.values()];
}
function gradient(group: CircuitMetric[], metric: Metric) {
  const total = group.reduce((s, p) => s + p[metric], 0);
  if (!total) return "#526068";
  let at = 0;
  return `conic-gradient(${group
    .map((p) => {
      const start = at;
      at += (p[metric] / total) * 100;
      return `${p.color} ${start}% ${at}%`;
    })
    .join(",")})`;
}
function popup(
  group: CircuitMetric[],
  drivers: AnalyticsDriverOption[],
  metric: Metric,
) {
  const root = document.createElement("section");
  root.className = "av-popup";
  const h = document.createElement("strong");
  h.textContent = group[0]?.name ?? "Трасса";
  const small = document.createElement("small");
  small.textContent = `${metricDetails(metric).label} · ${group[0]?.locality ?? group[0]?.countryCode ?? ""}`;
  root.append(h, small);
  const list = document.createElement("div");
  drivers.forEach((d) => {
    const p = group.find((x) => x.driverId === d.id);
    const row = document.createElement("div");
    const who = document.createElement("span");
    const dot = document.createElement("i");
    dot.style.background = p?.color ?? "#526068";
    const name = document.createElement("b");
    name.textContent = d.nameRu;
    who.append(dot, name);
    const value = document.createElement("em");
    value.textContent = p ? number(p[metric]) : "—";
    value.title = p ? "" : "Нет результатов пилота на этой трассе";
    row.append(who, value);
    list.append(row);
  });
  root.append(list);
  return root;
}
function MapView({
  points,
  drivers,
  metric,
  mode,
  focus,
  label,
  selectedCircuitId,
  onSelectCircuit,
}: {
  points: CircuitMetric[];
  drivers: AnalyticsDriverOption[];
  metric: Metric;
  mode: MapMode;
  focus: string;
  label: string;
  selectedCircuitId: string;
  onSelectCircuit: (circuitId: string) => void;
}) {
  const { theme } = useTheme();
  const node = useRef<HTMLDivElement>(null),
    map = useRef<MapLibreMap | null>(null),
    marks = useRef<maplibregl.Marker[]>([]),
    pops = useRef<maplibregl.Popup[]>([]);
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!node.current) return;
    const m = new maplibregl.Map({
      container: node.current,
      style,
      center: [12, 24],
      zoom: 1,
      minZoom: 0,
      maxZoom: 12,
      renderWorldCopies: false,
      transformConstrain: (center, zoom) => {
        const width = node.current?.clientWidth ?? 0;
        const height = node.current?.clientHeight ?? 0;
        const viewportZoom = Math.max(0, Math.log2(Math.max(width, height, 1) / 512));
        const nextZoom = Math.max(zoom, viewportZoom);
        const worldSize = 512 * (2 ** nextZoom);
        const halfX = Math.min(.5, width / (2 * worldSize));
        const halfY = Math.min(.5, height / (2 * worldSize));
        const mercatorX = Math.min(1 - halfX, Math.max(halfX, (center.lng + 180) / 360));
        const latitude = Math.min(85, Math.max(-85, center.lat));
        const radians = latitude * Math.PI / 180;
        const rawY = (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2;
        const mercatorY = Math.min(1 - halfY, Math.max(halfY, rawY));
        const constrainedLatitude = Math.atan(Math.sinh(Math.PI * (1 - 2 * mercatorY))) * 180 / Math.PI;

        // Камера учитывает размер viewport, поэтому за его краями не появляется пустое пространство.
        return {
          center: new maplibregl.LngLat(mercatorX * 360 - 180, constrainedLatitude),
          zoom: nextZoom,
        };
      },
      attributionControl: false,
    });
    map.current = m;
    addAtlasMapAttribution(m);
    m.on("load", () => {
      applyAnalyticsMapTheme(
        m,
        document.documentElement.dataset.theme === "light" ? "light" : "dark",
      );
      setReady(true);
    });
    m.on("error", () => setFailed(true));
    return () => {
      pops.current.forEach((x) => x.remove());
      marks.current.forEach((x) => x.remove());
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const currentMap = map.current;
    if (currentMap?.isStyleLoaded()) applyAnalyticsMapTheme(currentMap, theme);
  }, [theme]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !node.current) return;
    const fit = () => {
      m.resize();
      if (!points.length) return;
      const bounds = new maplibregl.LngLatBounds();
      points.forEach((point) => bounds.extend(point.coordinates));
      m.fitBounds(bounds, { padding: 32, maxZoom: 4, duration: 0 });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node.current);
    return () => observer.disconnect();
  }, [points, ready]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    pops.current.forEach((x) => x.remove());
    marks.current.forEach((x) => x.remove());
    pops.current = [];
    const groups = grouped(points);
    const max = Math.max(
      0,
      ...groups.map((group) =>
        mode === "heat"
          ? (group.find((point) => point.driverId === focus)?.[metric] ?? 0)
          : group.reduce((sum, point) => sum + point[metric], 0),
      ),
    );
    marks.current = groups.map((g) => {
      const total = g.reduce((s, p) => s + p[metric], 0),
        focusedValue = g.find((point) => point.driverId === focus)?.[metric] ?? 0,
        displayedValue = mode === "heat" ? focusedValue : total,
        contributors = g.filter((point) => point[metric] > 0).length,
        markerSize = displayedValue && max ? 25 + Math.sqrt(displayedValue / max) * 31 : 23,
        button = document.createElement("button");
      button.type = "button";
      button.className = `av-marker${mode === "heat" ? " heat" : ""}${displayedValue ? "" : " zero"}${selectedCircuitId === g[0].circuitId ? " is-active" : ""}`;
      button.style.setProperty(
        "--fill",
        mode === "heat"
          ? `rgba(255,54,92,${max ? 0.18 + 0.82 * (focusedValue / max) : 0.18})`
          : gradient(g, metric),
      );
      button.style.setProperty("--marker-size", `${markerSize}px`);
      button.dataset.contributors = String(contributors);
      button.setAttribute(
        "aria-label",
        `${g[0].name}: ${number(displayedValue)} ${metricDetails(metric).unit}; участников с результатом: ${contributors}`,
      );
      const valueLabel = document.createElement("span");
      valueLabel.textContent = number(displayedValue);
      button.append(valueLabel);
      button.onclick = (e) => {
        e.stopPropagation();
        onSelectCircuit(g[0].circuitId);
        pops.current.forEach((x) => x.remove());
        const p = new maplibregl.Popup({
          className: "av-map-popup",
          closeButton: true,
        })
          .setLngLat(g[0].coordinates)
          .setDOMContent(popup(g, drivers, metric))
          .addTo(m);
        pops.current = [p];
      };
      return new maplibregl.Marker({ element: button })
        .setLngLat(g[0].coordinates)
        .addTo(m);
    });
    return () => {
      pops.current.forEach((x) => x.remove());
      marks.current.forEach((x) => x.remove());
      pops.current = [];
      marks.current = [];
    };
  }, [drivers, focus, metric, mode, onSelectCircuit, points, ready, selectedCircuitId]);
  return (
    <div className="av-mapShell">
      <div
        className="av-map"
        ref={node}
        aria-label={`Карта результатов, ${label}`}
      />
      {!points.length && (
        <div className="av-mapEmpty">Нет результатов для карты</div>
      )}
      {failed && (
        <p className="av-mapError">
          Подложка недоступна. Рейтинг трасс остаётся доступен
        </p>
      )}
      <div className="av-legend">
        {mode === "shares" ? <>
          <strong>Как читать знак</strong>
          <span><i className="donut" />цвет = доля пилота</span>
          <span><i className="size" />размер = сумма</span>
          <span><i className="count">2</i>бейдж = участников</span>
        </> : <>
          <strong>Интенсивность пилота</strong>
          <span><i className="size" />яркость и размер = результат</span>
          <span><i />серый = нет результата</span>
        </>}
      </div>
    </div>
  );
}
export function AnalyticsDashboard({ drivers, seasons, initialSeason }: Props) {
  const years = useMemo(() => [...seasons].sort((a, b) => b - a), [seasons]),
    fallback = drivers.find((d) => d.id === "max_verstappen") ?? drivers[0];
  const [season, setSeason] = useState(initialSeason),
    [scope, setScope] = useState<Scope>("season"),
    [ids, setIds] = useState<string[]>(fallback ? [fallback.id] : []),
    [query, setQuery] = useState(""),
    [snapshots, setSnapshots] = useState<SeasonSnapshot[]>([]),
    [status, setStatus] = useState<"loading" | "ready" | "error">("loading"),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(0),
    [retry, setRetry] = useState(0),
    [sessionView, setSessionView] = useState<SessionView>("overview"),
    [metric, setMetric] = useState<Metric>("wins"),
    [mapMode, setMapMode] = useState<MapMode>("shares"),
    [focusId, setFocusId] = useState(fallback?.id ?? ""),
    [savedComparisons, setSavedComparisons] = useState<SavedComparison[]>([]),
    [savedNotice, setSavedNotice] = useState(""),
    [selectedCircuitId, setSelectedCircuitId] = useState("");
  const request = useRef(0),
    importInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setSavedComparisons(readSavedComparisons(window.localStorage.getItem(savedComparisonsKey)));
    });
    return () => { active = false; };
  }, []);
  const selected = useMemo(
    () =>
      ids
        .map((id) => drivers.find((d) => d.id === id))
        .filter((d): d is AnalyticsDriverOption => Boolean(d)),
    [drivers, ids],
  );
  const palette = useMemo(
    () => new Map(selected.map((d, i) => [d.id, colors[i]])),
    [selected],
  );
  const wanted = useMemo(() => {
    if (scope === "season") return [season];
    if (!selected.length) return [];
    return years.filter((year) =>
      selected.some(
        (driver) =>
          year >= (driver.firstSeason ?? year) &&
          year <= (driver.latestSeason ?? year),
      ),
    );
  }, [scope, season, selected, years]);
  const period =
    scope === "season"
      ? `сезон ${season}`
      : wanted.length
        ? `${wanted.at(-1)}–${wanted[0]}`
        : "карьера";
  useEffect(() => {
    const id = ++request.current,
      c = new AbortController();
    queueMicrotask(() => {
      if (c.signal.aborted) return;
      setStatus("loading");
      setLoaded(0);
      setSnapshots([]);
      setError("");
      if (!wanted.length || !selected.length) {
        setStatus("ready");
        return;
      }
      loadAnalyticsSeasons(wanted, c.signal, (done) => {
        if (request.current === id) setLoaded(done);
      })
        .then((v) => {
          if (request.current === id && !c.signal.aborted) {
            setSnapshots(v);
            setStatus("ready");
          }
        })
        .catch((e: unknown) => {
          if (request.current === id && !c.signal.aborted) {
            setError(
              e instanceof Error ? e.message : "Не удалось загрузить данные",
            );
            setStatus("error");
          }
        });
    });
    return () => c.abort();
  }, [retry, selected.length, wanted]);
  const analytics = useMemo(
      () => buildAnalytics(snapshots, selected, palette),
      [palette, selected, snapshots],
    ),
    filtered = useMemo(() => {
      const q = query.trim().toLocaleLowerCase("ru");
      return q
        ? drivers
            .filter(
              (d) =>
                !ids.includes(d.id) &&
                `${d.nameRu} ${d.nameEn} ${d.code ?? ""}`
                  .toLocaleLowerCase("ru")
                  .includes(q),
            )
            .slice(0, 10)
        : [];
    }, [drivers, ids, query]);
  const activeChoices = sessionChoices[sessionView];
  const compare = sessionCompare[sessionView];
  const focus = selected.some((driver) => driver.id === focusId)
    ? focusId
    : (selected[0]?.id ?? "");
  const rank = useMemo(
    () =>
      grouped(analytics.circuitMetrics)
        .map((group) => ({
          group,
          total:
            mapMode === "heat"
              ? (group.find((point) => point.driverId === focus)?.[metric] ?? 0)
              : group.reduce((s, p) => s + p[metric], 0),
        }))
        .filter((item) => item.total > 0)
        .sort(
          (a, b) =>
            b.total - a.total ||
            a.group[0].name.localeCompare(b.group[0].name, "ru"),
        ),
    [analytics.circuitMetrics, focus, mapMode, metric],
  );
  const rankedCircuitIds = useMemo(
    () => new Set(rank.map((item) => item.group[0].circuitId)),
    [rank],
  );
  const mapPoints = useMemo(
    () => analytics.circuitMetrics.filter((point) => rankedCircuitIds.has(point.circuitId)),
    [analytics.circuitMetrics, rankedCircuitIds],
  );
  const active = activeChoices.find((x) => x.key === metric) ?? activeChoices[0];
  const selectedCircuit = rank.find((item) => item.group[0].circuitId === selectedCircuitId) ?? rank[0];
  const selectCircuit = useCallback((circuitId: string) => setSelectedCircuitId(circuitId), []);
  const toggle = (id: string) =>
    setIds((now) =>
      now.includes(id)
        ? now.filter((x) => x !== id)
        : now.length < 3
          ? [...now, id]
          : now,
  );
  const storeSavedComparisons = (next: SavedComparison[]) => {
    try {
      window.localStorage.setItem(savedComparisonsKey, JSON.stringify(next));
      setSavedComparisons(next);
      setSavedNotice("");
      return true;
    } catch {
      setSavedNotice("Браузер не разрешил сохранить сравнение");
      return false;
    }
  };
  const currentComparison = (): SavedComparison | null => {
    if (!selected.length) return null;
    const fingerprint = JSON.stringify({ scope, season, ids, sessionView, metric, mapMode, focus });
    const existing = savedComparisons.find((item) =>
      JSON.stringify({
        scope: item.scope,
        season: item.season,
        ids: item.driverIds,
        sessionView: item.sessionView,
        metric: item.metric,
        mapMode: item.mapMode,
        focus: item.focusId,
      }) === fingerprint,
    );
    const sessionLabel = {
      overview: "обзор",
      race: "гонки",
      sprint: "спринты",
      qualifying: "квалификации",
    }[sessionView];
    return {
      id: existing?.id ?? `${Date.now()}`,
      label: `${selected.map((driver) => driver.nameRu).join(" · ")} — ${period}, ${sessionLabel}`,
      savedAt: new Date().toISOString(),
      scope,
      season,
      driverIds: ids,
      sessionView,
      metric,
      mapMode,
      focusId: focus,
    };
  };
  const saveComparison = () => {
    const saved = currentComparison();
    if (!saved) return;
    const existing = savedComparisons.find((item) => item.id === saved.id);
    if (storeSavedComparisons([saved, ...savedComparisons.filter((item) => item.id !== saved.id)].slice(0, savedComparisonsLimit))) {
      setSavedNotice(existing ? "Сравнение обновлено" : "Сравнение сохранено");
    }
  };
  const downloadComparisons = (items: SavedComparison[], name: string) => {
    if (!items.length) return;
    const url = URL.createObjectURL(new Blob([serializeAnalyticsComparisons(items)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    setSavedNotice(items.length === 1 ? "Сравнение экспортировано" : "Сохранённые сравнения экспортированы");
  };
  const importComparisons = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = parseAnalyticsComparisonsExport(
        await file.text(),
        new Set(drivers.map((driver) => driver.id)),
        new Set(years),
      );
      const next = mergeImportedComparisons(savedComparisons, imported);
      const added = next.length - savedComparisons.length;
      if (!added) {
        setSavedNotice(savedComparisons.length >= savedComparisonsLimit ? "Лимит из восьми сравнений уже заполнен" : "Все сравнения из файла уже сохранены");
        return;
      }
      if (storeSavedComparisons(next)) setSavedNotice(`Импортировано сравнений: ${added}`);
    } catch (reason) {
      setSavedNotice(reason instanceof Error ? reason.message : "Не удалось импортировать сравнения");
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  };
  const loadComparison = (saved: SavedComparison) => {
    const availableIds = saved.driverIds.filter((id) => drivers.some((driver) => driver.id === id));
    if (!availableIds.length) {
      setSavedNotice("Пилоты этого сравнения отсутствуют в каталоге");
      return;
    }
    const nextView = saved.sessionView;
    const nextMetric = sessionChoices[nextView].some((choice) => choice.key === saved.metric)
      ? saved.metric
      : sessionChoices[nextView][0].key;
    setScope(saved.scope);
    if (years.includes(saved.season)) setSeason(saved.season);
    setIds(availableIds);
    setSessionView(nextView);
    setMetric(nextMetric);
    setMapMode(saved.mapMode);
    setFocusId(availableIds.includes(saved.focusId) ? saved.focusId : availableIds[0]);
    setSelectedCircuitId("");
    setSavedNotice("Сравнение восстановлено");
  };
  const removeComparison = (id: string) => {
    storeSavedComparisons(savedComparisons.filter((item) => item.id !== id));
  };
  const cardContent = (driver: DriverMetric) => {
    if (sessionView === "race")
      return {
        lead: driver.wins,
        unit: "побед",
        rows: [
          ["Старты", driver.starts],
          ["Подиумы", driver.podiums],
          ["Очки", number(driver.racePoints)],
          ["Средняя позиция", driver.averageFinish === null ? "—" : number(driver.averageFinish)],
        ],
      };
    if (sessionView === "sprint")
      return {
        lead: driver.sprintWins,
        unit: "побед",
        rows: [
          ["Старты", driver.sprintStarts],
          ["Подиумы", driver.sprintPodiums],
          ["Очки", number(driver.sprintPoints)],
          ["Средняя позиция", driver.sprintAverageFinish === null ? "—" : number(driver.sprintAverageFinish)],
        ],
      };
    if (sessionView === "qualifying")
      return {
        lead: driver.poles,
        unit: "поулов",
        rows: [
          ["Участия", driver.qualifyingEntries],
          ["Средняя позиция", driver.averageQualifying === null ? "—" : number(driver.averageQualifying)],
        ],
      };
    return {
      lead: driver.wins,
      unit: "побед",
      rows: [
        ["Старты", driver.starts],
        ["Подиумы", driver.podiums],
        ["Поулы", driver.poles],
        ["Очки", number(driver.points)],
        ["Спринт-победы", driver.sprintWins],
        ["Средняя позиция", driver.averageFinish === null ? "—" : number(driver.averageFinish)],
      ],
    };
  };
  return (
    <main className="av-page">
      <Breadcrumbs items={[{ label: "Главная", href: "/" }, { label: "Аналитика" }]} />
      <header className="av-hero">
        <div>
          <span>F1 / сравнительный атлас</span>
          <h1>
            География
            <br />
            <em>результата</em>
          </h1>
          <p>
            Сравните до трёх пилотов по сезону или всей доступной карьере.
            Выберите показатель и исследуйте, на каких трассах складывался
            результат
          </p>
        </div>
        <b aria-hidden="true">01</b>
      </header>
      <section className="av-controls" aria-label="Параметры аналитики">
        <div className="av-tabs">
          <button
            aria-pressed={scope === "season"}
            className={scope === "season" ? "active" : ""}
            onClick={() => setScope("season")}
          >
            Сезон
          </button>
          <button
            aria-pressed={scope === "career"}
            className={scope === "career" ? "active" : ""}
            onClick={() => setScope("career")}
          >
            Карьера
          </button>
        </div>
        <label>
          <span>Сезон</span>
          <select
            value={season}
            disabled={scope === "career"}
            onChange={(e) => setSeason(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <div className="av-picker">
          <label htmlFor="driver-search">
            Пилоты <small>{selected.length}/3</small>
          </label>
          <div>
            {selected.map((d, i) => (
              <button
                key={d.id}
                style={{ "--driver": colors[i] } as CSSProperties}
                onClick={() => toggle(d.id)}
                aria-label={`Убрать ${d.nameRu}`}
              >
                <i />
                {d.nameRu}
                <b>×</b>
              </button>
            ))}
          </div>
          {selected.length < 3 && (
            <input
              id="driver-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Добавить пилота…"
            />
          )}
          {query && (
            <aside>
              {filtered.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    toggle(d.id);
                    setQuery("");
                  }}
                >
                  <span>
                    {d.nameRu}
                    <small>{d.nameEn}</small>
                  </span>
                  <b>{d.code ?? "+"}</b>
                </button>
              ))}
              {!filtered.length && <p>Совпадений нет</p>}
            </aside>
          )}
        </div>
        <div className="av-period">
          <span>Период данных</span>
          <strong>{period}</strong>
          <small>
            {scope === "career"
              ? `${wanted.length} сезонов в архиве`
              : "один сезон"}
          </small>
        </div>
      </section>
      <nav className="av-sessionModes" aria-label="Тип сессии">
        {([
          ["overview", "Обзор"],
          ["race", "Гонки"],
          ["sprint", "Спринты"],
          ["qualifying", "Квалификации"],
        ] as Array<[SessionView, string]>).map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={sessionView === key ? "active" : ""}
            aria-pressed={sessionView === key}
            onClick={() => {
              setSessionView(key);
              setMetric(sessionChoices[key][0].key);
              setSelectedCircuitId("");
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <section className="av-savedComparisons" aria-label="Сохранённые сравнения">
        <header>
          <div>
            <span>Личная подборка</span>
            <strong>Сохранённые сравнения</strong>
          </div>
          <div className="av-savedComparisons__actions">
            <button type="button" onClick={saveComparison} disabled={!selected.length}>Сохранить текущее</button>
            <button type="button" onClick={() => {
              const current = currentComparison();
              if (current) downloadComparisons([current], "f1-atlas-comparison.json");
            }} disabled={!selected.length}>Экспорт текущего</button>
            <button type="button" onClick={() => downloadComparisons(savedComparisons, "f1-atlas-comparisons.json")} disabled={!savedComparisons.length}>Экспорт сохранённых</button>
            <button type="button" onClick={() => importInput.current?.click()}>Импорт JSON</button>
            <input
              ref={importInput}
              type="file"
              accept="application/json,.json"
              className="av-savedComparisons__file"
              onChange={(event) => void importComparisons(event.target.files?.[0])}
            />
          </div>
        </header>
        {savedComparisons.length ? (
          <div className="av-savedComparisons__list">
            {savedComparisons.map((saved) => (
              <article key={saved.id}>
                <button type="button" onClick={() => loadComparison(saved)}>
                  <strong>{saved.label}</strong>
                  <small>{metricDetails(saved.metric).label} · {saved.mapMode === "heat" ? "тепло" : "доли"}</small>
                </button>
                <button type="button" onClick={() => removeComparison(saved.id)} aria-label={`Удалить сравнение ${saved.label}`}>×</button>
              </article>
            ))}
          </div>
        ) : (
          <p>Сохраните текущую настройку, чтобы вернуться к ней одним нажатием</p>
        )}
        <span className="av-savedComparisons__notice" aria-live="polite">{savedNotice}</span>
      </section>
      {status === "loading" && (
        <section className="av-status" aria-live="polite">
          <i
            style={
              {
                "--progress": `${wanted.length ? (loaded / wanted.length) * 100 : 0}%`,
              } as CSSProperties
            }
          />
          <span>
            Собираем{" "}
            {scope === "career" ? "карьерный диапазон" : `сезон ${season}`}
          </span>
          <b>
            {loaded}/{wanted.length}
          </b>
          <p>Итог появится только после загрузки всех сезонов</p>
        </section>
      )}
      {status === "error" && (
        <section className="av-status error" role="alert">
          <span>Данные не собраны</span>
          <p>{error}</p>
          <button onClick={() => setRetry((x) => x + 1)}>
            Повторить загрузку
          </button>
        </section>
      )}
      {status === "ready" && !selected.length && (
        <div className="av-empty">
          <strong>Добавьте пилота</strong>
          <p>После выбора появятся сводка и география результатов</p>
        </div>
      )}
      {status === "ready" && selected.length > 0 && (
        <>
          <section className="av-intro">
            <div>
              <span>{period}</span>
              <h2>{selected.map((d) => d.nameRu).join(" · ")}</h2>
            </div>
            <p>
              Результаты агрегированы только по полностью загруженному периоду.
              Координаты этапов показаны без смещения точек
            </p>
          </section>
          <section className="av-cards">
            {analytics.metrics.map((m, i) => {
              const content = cardContent(m);
              return (
              <article
                key={m.driver.id}
                style={
                  {
                    "--driver": m.color,
                    "--index": `'0${i + 1}'`,
                  } as CSSProperties
                }
              >
                <header>
                  <i />
                  <div>
                    <small>{m.driver.code ?? "F1"}</small>
                    <h3>{m.driver.nameRu}</h3>
                  </div>
                </header>
                <strong>
                  {content.lead}
                  <small>{content.unit}</small>
                </strong>
                <dl>
                  {content.rows.map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </article>
              );
            })}
          </section>
          {analytics.metrics.length > 1 && (
            <section className="av-compare">
              <header>
                <div>
                  <span>Сравнение</span>
                  <h2>Сравнение результатов</h2>
                </div>
                <p>
                  Полосы сравнивают значения с лидером строки. Для средней
                  позиции меньше — лучше; длина показывает обратное отношение
                </p>
              </header>
              <div>
                {compare.map((row) => {
                  const vals = analytics.metrics.map(
                      (m) => m[row.key] as number | null,
                    ),
                    valid = vals.filter((v): v is number => v !== null),
                    max = Math.max(0, ...valid),
                    min = valid.length ? Math.min(...valid) : 0,
                    best = row.low ? min : max;
                  return (
                    <section key={row.label}>
                      <header>
                        <strong>{row.label}</strong>
                        <small>{row.hint}</small>
                      </header>
                      <div
                        className={
                          analytics.metrics.length === 2 ? "av-duel" : ""
                        }
                      >
                        {analytics.metrics.map((m) => {
                          const v = m[row.key] as number | null;
                          return (
                            <p
                              className={v === best ? "best" : ""}
                              key={m.driver.id}
                              style={
                                {
                                  "--driver": m.color,
                                  "--size": `${v === null || !max ? 0 : row.low ? (min / v) * 100 : (v / max) * 100}%`,
                                } as CSSProperties
                              }
                            >
                              <span>
                                <i />
                                {m.driver.code ?? m.driver.nameRu}
                              </span>
                              <b>{v === null ? "—" : number(v)}</b>
                            </p>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </section>
          )}
          <section className="av-geo">
            <header>
              <div>
                <span>Карта трасс</span>
                <h2>{active.label} по географии</h2>
              </div>
              <p>
                {mapMode === "shares"
                  ? "Диаметр показывает абсолютное значение, цветные сектора — вклад каждого пилота, число в центре — сумму по трассе"
                  : "Яркость и размер нормированы от нуля до максимального результата выбранного пилота"}
              </p>
            </header>
            <div className="av-driverLegend" aria-label="Цвета пилотов">
              {selected.map((driver) => (
                <span key={driver.id}>
                  <i style={{ background: palette.get(driver.id) }} />
                  {driver.nameRu}
                </span>
              ))}
            </div>
            <div className="av-toolbar" aria-label="Показатель карты">
              <div className="av-tabs">
                {activeChoices.map((c) => (
                  <button
                    aria-pressed={metric === c.key}
                    className={metric === c.key ? "active" : ""}
                    key={c.key}
                    onClick={() => setMetric(c.key)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="av-tabs modes">
                <button
                  type="button"
                  aria-pressed={mapMode === "shares"}
                  className={mapMode === "shares" ? "active" : ""}
                  onClick={() => setMapMode("shares")}
                >
                  Доли
                </button>
                <button
                  type="button"
                  aria-pressed={mapMode === "heat"}
                  className={mapMode === "heat" ? "active" : ""}
                  onClick={() => setMapMode("heat")}
                >
                  Тепло
                </button>
              </div>
              {mapMode === "heat" && (
                <label>
                  Пилот
                  <select value={focus} onChange={(event) => setFocusId(event.target.value)}>
                    {selected.map((driver) => (
                      <option value={driver.id} key={driver.id}>{driver.nameRu}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="av-explorer">
              <MapView
                points={mapPoints}
                drivers={selected}
                metric={metric}
                mode={mapMode}
                focus={focus}
                label={period}
                selectedCircuitId={selectedCircuit?.group[0].circuitId ?? ""}
                onSelectCircuit={selectCircuit}
              />
              <aside className="av-ranking" aria-label="Связанный рейтинг трасс">
                <header>
                  <div><span>Связанный рейтинг</span><h3>Трассы</h3></div>
                  <b>{rank.length}</b>
                </header>
                {selectedCircuit ? <section className="av-circuitPassport">
                  <small>Выбранная трасса</small>
                  <strong>{selectedCircuit.group[0].name}</strong>
                  <span>{selectedCircuit.group[0].locality ?? selectedCircuit.group[0].countryCode}</span>
                  <dl>{selected.map((driver) => {
                    const point = selectedCircuit.group.find((item) => item.driverId === driver.id);
                    return <div key={driver.id}><dt><i style={{ background: palette.get(driver.id) }} />{driver.nameRu}</dt><dd>{number(point?.[metric] ?? 0)}</dd></div>;
                  })}</dl>
                </section> : null}
                {rank.length ? <ol>
                {rank.map(({ group, total }, i) => (
                  <li className={group[0].circuitId === selectedCircuit?.group[0].circuitId ? "is-active" : ""} key={group[0].circuitId}>
                    <button type="button" onClick={() => selectCircuit(group[0].circuitId)} aria-label={`Выбрать трассу ${group[0].name}`}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{group[0].name}</strong>
                      <small>{group[0].locality ?? group[0].countryCode}</small>
                    </div>
                    <div className="bars">
                      {selected.map((d) => {
                          const p = group.find((x) => x.driverId === d.id);
                          return (
                            <i
                              key={d.id}
                              title={`${d.nameRu}: ${number(p?.[metric] ?? 0)}`}
                              style={
                                {
                                  "--driver": palette.get(d.id),
                                  "--share": `${total ? ((p?.[metric] ?? 0) / total) * 100 : 0}%`,
                                } as CSSProperties
                              }
                            />
                          );
                        })}
                    </div>
                    <b>
                      {number(total)}
                      <small>{active.unit}</small>
                    </b>
                    </button>
                  </li>
                ))}
              </ol> : <div className="av-empty">Для показателя нет результатов</div>}
              </aside>
            </div>
          </section>
          <aside className="av-method">
            <strong>Как считаем</strong>
            <p>
              Гонки, спринты и квалификации считаются раздельно. Поул — P1 в
              квалификации, а не стартовая позиция в гонке. Старт — фактический
              старт, записи DNS, DNQ и DNPQ исключены. Средняя позиция использует
              только строки с числовой классификацией. Для ранних сезонов нет
              квалификационных данных в {analytics.coverage.missingQualifyingRounds} из{" "}
              {analytics.coverage.raceRounds} гоночных раундов. В общем обзоре
              очки карточек берутся из официальных сезонных итогов; в отдельных
              режимах и на карте показывается сумма начисленных очков сессий
            </p>
          </aside>
        </>
      )}
    </main>
  );
}
