"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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
import type { SeasonSnapshot } from "../data/web-snapshots";
export type { AnalyticsDriverOption } from "../lib/analytics-data";

type Props = {
  drivers: AnalyticsDriverOption[];
  seasons: number[];
  initialSeason: number;
};
type Scope = "season" | "career";
type Metric = "wins" | "poles" | "podiums" | "points";
type Mode = "shares" | "heat";
const colors = ["#ff365c", "#35d5c2", "#ffc857"];
const choices: Array<{ key: Metric; label: string; unit: string }> = [
  { key: "wins", label: "Победы", unit: "побед" },
  { key: "poles", label: "Поулы", unit: "поулов" },
  { key: "podiums", label: "Подиумы", unit: "подиумов" },
  { key: "points", label: "Очки", unit: "очков" },
];
const compare: Array<{
  key: keyof DriverMetric;
  label: string;
  hint: string;
  low?: boolean;
}> = [
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
  small.textContent = `${choices.find((item) => item.key === metric)?.label} · ${group[0]?.locality ?? group[0]?.countryCode ?? ""}`;
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
}: {
  points: CircuitMetric[];
  drivers: AnalyticsDriverOption[];
  metric: Metric;
  mode: Mode;
  focus: string;
  label: string;
}) {
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
      minZoom: -2,
      maxZoom: 12,
      renderWorldCopies: false,
      // Permit empty space around the world on tall screens instead of
      // MapLibre zooming in to fill the viewport and cropping distant circuits.
      transformConstrain: (center, zoom) => ({
        center: new maplibregl.LngLat(
          Math.max(-180, Math.min(180, center.lng)),
          Math.max(-85, Math.min(85, center.lat)),
        ),
        zoom: Math.max(-2, Math.min(12, zoom)),
      }),
      attributionControl: false,
    });
    map.current = m;
    addAtlasMapAttribution(m);
    m.on("load", () => setReady(true));
    m.on("error", () => setFailed(true));
    return () => {
      pops.current.forEach((x) => x.remove());
      marks.current.forEach((x) => x.remove());
      m.remove();
      map.current = null;
    };
  }, []);
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
    const groups = grouped(points),
      max = Math.max(
        0,
        ...groups.map(
          (g) => g.find((p) => p.driverId === focus)?.[metric] ?? 0,
        ),
      );
    marks.current = groups.map((g) => {
      const value = g.find((p) => p.driverId === focus)?.[metric] ?? 0,
        intensity = max ? value / max : 0,
        total = g.reduce((s, p) => s + p[metric], 0),
        button = document.createElement("button");
      button.type = "button";
      button.className = `av-marker ${mode === "heat" ? "heat" : ""} ${mode === "heat" && !value ? "zero" : ""}`;
      button.style.setProperty(
        "--fill",
        mode === "shares"
          ? gradient(g, metric)
          : `rgba(255,54,92,${0.18 + 0.82 * intensity})`,
      );
      button.setAttribute(
        "aria-label",
        `${g[0].name}: ${number(mode === "heat" ? value : total)} ${choices.find((x) => x.key === metric)?.unit}`,
      );
      button.append(document.createElement("span"));
      button.onclick = (e) => {
        e.stopPropagation();
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
  }, [drivers, focus, metric, mode, points, ready]);
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
        {mode === "shares" ? (
          <>
            <strong>Доля показателя</strong>
            <span>
              <i className="donut" />
              сектор = доля пилота
            </span>
            <span>
              <i />
              серый = у всех 0
            </span>
          </>
        ) : (
          <>
            <strong>Интенсивность пилота</strong>
            <span className="ramp" />
            <span>
              0 <b>в выбранном периоде</b> максимум
            </span>
          </>
        )}
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
    [metric, setMetric] = useState<Metric>("wins"),
    [mode, setMode] = useState<Mode>("shares"),
    [focusId, setFocus] = useState(fallback?.id ?? "");
  const request = useRef(0);
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
  const focus = selected.some((d) => d.id === focusId)
    ? focusId
    : (selected[0]?.id ?? "");
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
  const rank = useMemo(
    () =>
      grouped(analytics.circuitMetrics)
        .map((group) => ({
          group,
          total:
            mode === "heat"
              ? (group.find((point) => point.driverId === focus)?.[metric] ?? 0)
              : group.reduce((s, p) => s + p[metric], 0),
        }))
        .sort(
          (a, b) =>
            b.total - a.total ||
            a.group[0].name.localeCompare(b.group[0].name, "ru"),
        ),
    [analytics.circuitMetrics, focus, metric, mode],
  );
  const active = choices.find((x) => x.key === metric)!,
    rankMax = Math.max(0, ...rank.map((item) => item.total));
  const toggle = (id: string) =>
    setIds((now) =>
      now.includes(id)
        ? now.filter((x) => x !== id)
        : now.length < 3
          ? [...now, id]
          : now,
    );
  return (
    <main className="av-page">
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
            {analytics.metrics.map((m, i) => (
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
                  {m.wins}
                  <small>побед</small>
                </strong>
                <dl>
                  {[
                    ["Старты", m.starts],
                    ["Подиумы", m.podiums],
                    ["Поулы", m.poles],
                    ["Очки", number(m.points)],
                    ["Спринт-победы", m.sprintWins],
                    [
                      "Средняя позиция",
                      m.averageFinish === null ? "—" : number(m.averageFinish),
                    ],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
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
                    min = Math.min(...valid),
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
                {mode === "shares"
                  ? "Сектор пилота пропорционален его вкладу в сумму на трассе"
                  : "Яркость нормирована от нуля до максимума пилота в выбранном периоде"}
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
            <div className="av-toolbar">
              <div className="av-tabs">
                {choices.map((c) => (
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
                  aria-pressed={mode === "shares"}
                  className={mode === "shares" ? "active" : ""}
                  onClick={() => setMode("shares")}
                >
                  Доли
                </button>
                <button
                  aria-pressed={mode === "heat"}
                  className={mode === "heat" ? "active" : ""}
                  onClick={() => setMode("heat")}
                >
                  Тепло
                </button>
              </div>
              {mode === "heat" && (
                <label>
                  Пилот
                  <select
                    value={focus}
                    onChange={(e) => setFocus(e.target.value)}
                  >
                    {selected.map((d) => (
                      <option value={d.id} key={d.id}>
                        {d.nameRu}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <MapView
              points={analytics.circuitMetrics}
              drivers={selected}
              metric={metric}
              mode={mode}
              focus={focus}
              label={period}
            />
          </section>
          <section className="av-ranking">
            <header>
              <div>
                <span>Рейтинг трасс</span>
                <h2>Где набрано больше</h2>
              </div>
              <b>{rank.length} трасс</b>
            </header>
            {rank.length ? (
              <ol>
                {rank.map(({ group, total }, i) => (
                  <li key={group[0].circuitId}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{group[0].name}</strong>
                      <small>{group[0].locality ?? group[0].countryCode}</small>
                    </div>
                    <div className="bars">
                      {selected
                        .filter((d) => mode === "shares" || d.id === focus)
                        .map((d) => {
                          const p = group.find((x) => x.driverId === d.id);
                          return (
                            <i
                              key={d.id}
                              title={`${d.nameRu}: ${number(p?.[metric] ?? 0)}`}
                              style={
                                {
                                  "--driver": palette.get(d.id),
                                  "--share": `${mode === "heat" ? (rankMax ? (total / rankMax) * 100 : 0) : total ? ((p?.[metric] ?? 0) / total) * 100 : 0}%`,
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
                  </li>
                ))}
              </ol>
            ) : (
              <div className="av-empty">Для показателя нет результатов</div>
            )}
          </section>
          <aside className="av-method">
            <strong>Как считаем</strong>
            <p>
              Поул — P1 в квалификации, а не стартовая позиция в гонке. Старт —
              фактический старт, записи DNS, DNQ и DNPQ исключены. Средняя
              позиция в классификации включает классифицированные позиции, в том
              числе у сошедших, если позиция присвоена. Доступность квалификаций
              особенно различается для ранних сезонов: в периоде нет данных для{" "}
              {analytics.coverage.missingQualifyingRounds} из{" "}
              {analytics.coverage.raceRounds} гоночных раундов. Очки в карточках
              — сумма официальных сезонных итогов; на карте — сумма очков гонок
              и спринтов по трассе. Они могут различаться из-за исторических
              правил и отброшенных результатов
            </p>
          </aside>
        </>
      )}
    </main>
  );
}
