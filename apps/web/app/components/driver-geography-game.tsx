"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { awardSession, emptyProgress, rankForXp, readProgress, shuffled, type Progress } from "../lib/games-engine";
import { DriverCountryMap } from "./driver-country-map";
import "./driver-geography-game.css";

const STORAGE_KEY = "f1-atlas-games-progress-v1";
type DriverQuestion = { id: string; name: string; code: string | null; photoUrl: string | null; birthPlace: string; countryCode: string; countryName: string };

export function DriverGeographyGame({ drivers }: { drivers: DriverQuestion[] }) {
  const [progress, setProgress] = useState<Progress>(() => emptyProgress());
  const [rounds, setRounds] = useState<DriverQuestion[]>([]);
  const [round, setRound] = useState(0);
  const [selected, setSelected] = useState<{ code: string; name: string } | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const sessionRef = useRef("");
  const current = rounds[round];
  const revealed = scores.length > round;
  useEffect(() => { queueMicrotask(() => { try { setProgress(readProgress(localStorage.getItem(STORAGE_KEY))); } catch {} }); }, []);

  function start() {
    setRounds(shuffled(drivers).slice(0, 5)); setRound(0); setSelected(null); setScores([]); setFinished(false);
    sessionRef.current = crypto.randomUUID?.() ?? `${Date.now()}`;
  }
  function confirm() { if (!current || !selected || revealed) return; setScores((items) => [...items, selected.code === current.countryCode ? 1000 : 0]); }
  function next() {
    if (round >= 4) {
      const total = scores.reduce((sum, score) => sum + score, 0);
      const updated = awardSession(progress, sessionRef.current, "driver-geography-standard", total);
      setProgress(updated); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
      setFinished(true); return;
    }
    setRound((value) => value + 1); setSelected(null);
  }
  const rank = rankForXp(progress.xp);
  if (!rounds.length || finished) return <main className="driver-game-page"><nav><Link href="/games">← Все игры</Link></nav><section className="driver-game-intro"><span>03 / География пилотов</span><h1>Где началась<br/><em>история пилота?</em></h1><p>Выберите на карте страну рождения. После ответа страна будет полностью выделена, а правильный полигон показан бирюзовым</p><dl><div><dt>Раундов</dt><dd>5</dd></div><div><dt>Текущее звание</dt><dd>{rank.name}</dd></div><div><dt>Результат</dt><dd>{finished ? `${scores.reduce((a, b) => a + b, 0)} / 5 000` : "Новый заезд"}</dd></div></dl><button type="button" onClick={start}>{finished ? "Сыграть ещё раз →" : "Начать сессию →"}</button></section></main>;
  return <main className="driver-game-page is-playing"><header className="driver-game-head"><Link href="/games">← К играм</Link><div><b>Раунд {round + 1}</b><i><span style={{ width: `${((round + (revealed ? 1 : 0)) / 5) * 100}%` }} /></i><small>{round + 1} / 5</small></div><strong>{scores.reduce((a, b) => a + b, 0)} очков</strong></header>
    <section className="driver-game-arena"><div className="driver-map-panel"><DriverCountryMap selected={selected?.code ?? null} answer={current.countryCode} revealed={revealed} onSelect={(code, name) => setSelected({ code, name })} /></div><aside>
      <span>Где родился пилот?</span><div className="driver-question-person">{current.photoUrl ? <img src={current.photoUrl} alt="" /> : <b>{current.code ?? current.name.slice(0, 2)}</b>}<div><h1>{current.name}</h1><p>{current.code ?? "Formula 1"}</p></div></div>
      {!revealed ? <><div className="driver-selected-country"><small>Ваш выбор</small><strong>{selected?.name ?? "Нажмите на страну"}</strong></div><button className="driver-game-confirm" type="button" disabled={!selected} onClick={confirm}>Подтвердить ответ →</button></> : <div className={`driver-game-result ${selected?.code === current.countryCode ? "is-correct" : "is-wrong"}`}><small>{selected?.code === current.countryCode ? "Верно" : "Правильный ответ"}</small><h2>{current.countryName}</h2><p>Место рождения: {current.birthPlace}</p><strong>+{scores[round]} очков</strong><button type="button" onClick={next}>{round === 4 ? "Завершить сессию →" : "Следующий раунд →"}</button></div>}
    </aside></section></main>;
}
