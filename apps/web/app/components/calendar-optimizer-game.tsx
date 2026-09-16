"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { awardSession, distanceKm, emptyProgress, rankForXp, readProgress, type Progress } from "../lib/games-engine";
import { CalendarRouteMap } from "./calendar-route-map";
import "./calendar-optimizer-game.css";

const STORAGE_KEY = "f1-atlas-games-progress-v1";
type Stage = { id: string; round: number; name: string; city: string; countryCode: string; coordinates: [number, number] };
type CircuitNames = Record<string, { name: string; city: string }>;
type SeasonSnapshot = { season: number; calendar: Array<{ id: string; round: number; circuit: { id: string; name: string; locality: string | null; countryCode: string; coordinates: [number, number] } }> };
function routeDistance(stages: Stage[]) { return stages.slice(1).reduce((sum, stage, index) => sum + distanceKm(stages[index].coordinates, stage.coordinates), 0); }
function referenceRoute(stages: Stage[]) {
  if (stages.length < 3) return stages;
  let best = stages; let bestDistance = Number.POSITIVE_INFINITY;
  for (const start of stages) {
    const remaining = stages.filter((item) => item.id !== start.id); const route = [start];
    while (remaining.length) { const previous = route.at(-1)!; let nextIndex = 0;
      for (let index = 1; index < remaining.length; index++) if (distanceKm(previous.coordinates, remaining[index].coordinates) < distanceKm(previous.coordinates, remaining[nextIndex].coordinates)) nextIndex = index;
      route.push(remaining.splice(nextIndex, 1)[0]);
    }
    const distance = routeDistance(route); if (distance < bestDistance) { bestDistance = distance; best = route; }
  }
  return best;
}
function km(value: number) { return `${Math.round(value).toLocaleString("ru-RU")} км`; }
function stagesLabel(value: number) { const lastTwo = value % 100; const last = value % 10; return `${value} ${lastTwo >= 11 && lastTwo <= 14 ? "этапов" : last === 1 ? "этап" : last >= 2 && last <= 4 ? "этапа" : "этапов"}`; }

export function CalendarOptimizerGame({ season, stages, seasonOptions, circuitNames }: { season: number; stages: Stage[]; seasonOptions: number[]; circuitNames: CircuitNames }) {
  const [selectedSeason, setSelectedSeason] = useState(season); const [seasonStages, setSeasonStages] = useState(stages);
  const [seasonStatus, setSeasonStatus] = useState<"ready" | "loading" | "error">("ready");
  const official = useMemo(() => [...seasonStages].sort((a, b) => a.round - b.round), [seasonStages]);
  const benchmark = useMemo(() => referenceRoute(official), [official]);
  const [route, setRoute] = useState(official); const [checked, setChecked] = useState(false); const [score, setScore] = useState(0);
  const [progress, setProgress] = useState<Progress>(() => emptyProgress()); const dragging = useRef<number | null>(null); const session = useRef("");
  useEffect(() => { queueMicrotask(() => { try { setProgress(readProgress(localStorage.getItem(STORAGE_KEY))); } catch {} }); }, []);
  const officialDistance = routeDistance(official); const benchmarkDistance = routeDistance(benchmark); const currentDistance = routeDistance(route);
  function move(from: number, to: number) { if (checked || to < 0 || to >= route.length || from === to) return; setRoute((items) => { const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; }); }
  async function selectSeason(nextSeason: number) {
    if (nextSeason === selectedSeason || seasonStatus === "loading") return;
    setSeasonStatus("loading");
    try {
      const response = await fetch(`/data/f1/season-${nextSeason}.json`);
      if (!response.ok) throw new Error(`Не удалось загрузить сезон ${nextSeason}`);
      const snapshot = await response.json() as SeasonSnapshot;
      const nextStages = snapshot.calendar.filter((race) => race.circuit.coordinates?.length === 2).map((race) => ({
        id: race.id, round: race.round, name: circuitNames[race.circuit.id]?.name ?? race.circuit.name,
        city: circuitNames[race.circuit.id]?.city ?? race.circuit.locality ?? race.circuit.countryCode,
        countryCode: race.circuit.countryCode, coordinates: race.circuit.coordinates,
      }));
      if (nextStages.length < 2) throw new Error(`В сезоне ${nextSeason} недостаточно этапов`);
      setSelectedSeason(snapshot.season); setSeasonStages(nextStages); setRoute(nextStages); setChecked(false); setScore(0); session.current = ""; setSeasonStatus("ready");
    } catch { setSeasonStatus("error"); }
  }
  function finish() { const opportunity = Math.max(1, officialDistance - benchmarkDistance); const result = Math.round(Math.max(0, Math.min(1, (officialDistance - currentDistance) / opportunity)) * 5000); setScore(result); setChecked(true);
    if (!session.current) session.current = crypto.randomUUID?.() ?? `${Date.now()}`;
    const updated = awardSession(progress, session.current, `calendar-${selectedSeason}`, result); setProgress(updated); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {} }
  function restart() { setRoute(official); setChecked(false); setScore(0); session.current = crypto.randomUUID?.() ?? `${Date.now()}`; }
  const rank = rankForXp(progress.xp); const saved = officialDistance - currentDistance;
  return <main className="calendar-game-page"><nav><Link href="/games">← Все игры</Link><span>04 / Оптимизатор календаря</span></nav><header className="calendar-game-hero"><div><div className="calendar-season-picker"><label htmlFor="calendar-season">Сезон</label><select id="calendar-season" value={selectedSeason} disabled={seasonStatus === "loading"} onChange={(event) => void selectSeason(Number(event.target.value))}>{seasonOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select><span>{seasonStatus === "loading" ? "Загрузка…" : seasonStatus === "error" ? "Не удалось загрузить сезон" : stagesLabel(seasonStages.length)}</span></div><h1>Сократите<br/><em>путь чемпионата</em></h1><p>Перетаскивайте реальные этапы сезона. Чем меньше суммарная дистанция между соседними гонками, тем выше результат</p></div><dl><div><dt>Официальный маршрут</dt><dd>{km(officialDistance)}</dd></div><div><dt>Ваш маршрут</dt><dd>{km(currentDistance)}</dd></div><div><dt>Разница</dt><dd className={saved > 0 ? "is-good" : saved < 0 ? "is-bad" : ""}>{saved > 0 ? "−" : saved < 0 ? "+" : ""}{km(Math.abs(saved))}</dd></div><div><dt>Звание</dt><dd>{rank.name}</dd></div></dl></header>
    <section className="calendar-game-layout"><div className="calendar-map-column"><CalendarRouteMap stages={route} /><div className="calendar-map-legend"><span>Линия соединяет этапы в выбранном порядке</span><strong>{km(currentDistance)}</strong></div></div><aside><header><div><span>Порядок этапов</span><b>{route.length}</b></div><p>Перетащите карточку или используйте стрелки</p></header><ol>{route.map((stage, index) => <li key={stage.id} draggable={!checked} onDragStart={() => { dragging.current = index; }} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragging.current !== null) move(dragging.current, index); dragging.current = null; }}><b>{String(index + 1).padStart(2,"0")}</b><span><strong>{stage.name}</strong><small>{stage.city}</small></span><div><button type="button" disabled={checked || index === 0} onClick={() => move(index,index-1)} aria-label={`Поднять ${stage.name}`}>↑</button><button type="button" disabled={checked || index === route.length-1} onClick={() => move(index,index+1)} aria-label={`Опустить ${stage.name}`}>↓</button></div></li>)}</ol></aside></section>
    <footer className="calendar-game-actions">{checked ? <div><span>Результат</span><strong>{score.toLocaleString("ru-RU")} / 5 000</strong><p>{score === 5000 ? "Маршрут достиг игрового логистического ориентира" : saved > 0 ? `Удалось сократить путь на ${km(saved)}` : "Попробуйте сгруппировать соседние страны и континенты"}</p></div> : <div><span>Цель</span><strong>Минимальная дистанция</strong><p>Расписание и даты не учитываются в этой версии — оценивается только география перелётов</p></div>}<button type="button" onClick={checked ? restart : finish}>{checked ? "Начать заново →" : "Зафиксировать маршрут →"}</button></footer>
  </main>;
}
