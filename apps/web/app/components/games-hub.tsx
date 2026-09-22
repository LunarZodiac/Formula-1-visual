"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  awardSession,
  distanceKm,
  emptyProgress,
  gameEras,
  rankForXp,
  readProgress,
  scoreRound,
  shuffled,
  xpForScore,
  type Difficulty,
  type GameEra,
  type GameCircuit,
  type GameKind,
  type Progress,
} from "../lib/games-engine";
import { GameLocationMap } from "./game-location-map";
import { GameSessionSummary } from "./game-session-summary";
import "./games-hub.css";
import { Breadcrumbs } from "./breadcrumbs";

const STORAGE_KEY = "f1-atlas-games-progress-v1";
const ROUND_COUNT = 5;
const ROUND_SECONDS = 30;

type Phase = "idle" | "settings" | "playing" | "finished";
type RoundResult = {
  circuit: GameCircuit;
  selectedName: string | null;
  selectedPoint: [number, number] | null;
  correct: boolean;
  distance: number | null;
  score: number;
  hint: boolean;
  timedOut: boolean;
};

function Outline({
  circuit,
  muted = false,
}: {
  circuit: GameCircuit | undefined;
  muted?: boolean;
}) {
  if (!circuit?.outline)
    return <span className="games-outline-empty">Контур недоступен</span>;
  return (
    <svg
      className={`games-outline${muted ? " is-muted" : ""}`}
      viewBox="0 0 300 300"
      role="img"
      aria-label="Контур трассы без подписи"
    >
      <polyline points={circuit.outline} />
    </svg>
  );
}

function makeSessionId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function formatScore(score: number) {
  return new Intl.NumberFormat("ru-RU").format(score);
}

export function GamesHub({ circuits }: { circuits: GameCircuit[] }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [kind, setKind] = useState<GameKind>("outline");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [era, setEra] = useState<GameEra>("2020s");
  const [timed, setTimed] = useState(false);
  const [rounds, setRounds] = useState<GameCircuit[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [options, setOptions] = useState<GameCircuit[]>([]);
  const [selectedName, setSelectedName] = useState("");
  const [selectedPoint, setSelectedPoint] = useState<[number, number] | null>(
    null,
  );
  const [hint, setHint] = useState(false);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [remaining, setRemaining] = useState(ROUND_SECONDS);
  const [progress, setProgress] = useState<Progress>(() => emptyProgress());
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [logos, setLogos] = useState({ outline: null as string | null, map: null as string | null, "driver-geography": null as string | null, "calendar-optimizer": null as string | null });
  const [sessionId, setSessionId] = useState("");
  const [startError, setStartError] = useState("");
  const deadlineRef = useRef<number | null>(null);
  const savedSessionRef = useRef<string | null>(null);
  const resolvedRoundRef = useRef(false);

  const current = rounds[roundIndex];
  const result = results[roundIndex];
  const answered = Boolean(result);
  const rank = rankForXp(progress.xp);
  const rankProgress = rank.next
    ? Math.min(100, ((progress.xp - rank.min) / (rank.next - rank.min)) * 100)
    : 100;
  const recordKey = `${kind}-${difficulty}-${timed}`;
  const bestScore = Math.max(0, ...Object.values(progress.records));
  const previewOutline =
    circuits.find((circuit) => circuit.outline) ?? circuits[0];

  useEffect(() => {
    queueMicrotask(() => {
      try {
        setProgress(readProgress(window.localStorage.getItem(STORAGE_KEY)));
      } catch {
        setStorageError(true);
      } finally {
        setStorageReady(true);
      }
    });
  }, []);

  useEffect(() => {
    fetch('/data/games-media.json', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => {
        const next = value?.logos;
        if (next && Object.values(next).some((item) => typeof item === 'string')) {
          setLogos({ outline: typeof next.outline === 'string' ? next.outline : null, map: typeof next.map === 'string' ? next.map : null,
            "driver-geography": typeof next["driver-geography"] === 'string' ? next["driver-geography"] : null,
            "calendar-optimizer": typeof next["calendar-optimizer"] === 'string' ? next["calendar-optimizer"] : null });
        }
      })
      .catch(() => {});
  }, []);

  const makeOptions = useCallback(
    (target: GameCircuit) => {
      const alternatives = shuffled(
        circuits.filter((circuit) => circuit.id !== target.id),
      ).slice(0, 3);
      return shuffled([target, ...alternatives]);
    },
    [circuits],
  );

  const beginDeadline = useCallback(() => {
    deadlineRef.current = timed ? Date.now() + ROUND_SECONDS * 1000 : null;
    setRemaining(ROUND_SECONDS);
  }, [timed]);

  const openSettings = (game: GameKind) => {
    setKind(game);
    setStartError("");
    setPhase("settings");
  };

  const start = () => {
    const eligible = circuits.flatMap((circuit) => {
      if (kind === "map") return circuit.isCurrent ? [circuit] : [];
      if (era === "all") return circuit.allOutlines.map((outline) => ({ ...circuit, outline }));
      const outline = circuit.outlines[era];
      return outline ? [{ ...circuit, outline }] : [];
    });
    if (eligible.length < ROUND_COUNT) {
      setStartError(
        `Для игры нужны хотя бы ${ROUND_COUNT} трасс с проверенными данными`,
      );
      return;
    }
    const nextRounds = shuffled(eligible).slice(0, ROUND_COUNT);
    setRounds(nextRounds);
    setRoundIndex(0);
    setOptions(
      kind === "outline" && difficulty === "easy"
        ? makeOptions(nextRounds[0])
        : [],
    );
    setResults([]);
    setSelectedName("");
    setSelectedPoint(null);
    setHint(false);
    const nextSessionId = makeSessionId();
    setSessionId(nextSessionId);
    savedSessionRef.current = null;
    resolvedRoundRef.current = false;
    setPhase("playing");
    beginDeadline();
  };

  const resolveRound = useCallback(
    (timedOut = false) => {
      if (!current || answered || resolvedRoundRef.current) return;
      const expired =
        timed &&
        deadlineRef.current !== null &&
        Date.now() >= deadlineRef.current;
      const didTimeOut = timedOut || expired;
      if (kind === "outline") {
        const chosen = circuits.find(
          (circuit) =>
            circuit.nameRu.toLocaleLowerCase("ru") ===
            selectedName.trim().toLocaleLowerCase("ru"),
        );
        if (!didTimeOut && !chosen) return;
        resolvedRoundRef.current = true;
        const correct = !didTimeOut && chosen?.id === current.id;
        setResults((items) => [
          ...items,
          {
            circuit: current,
            selectedName: didTimeOut ? null : (chosen?.nameRu ?? null),
            selectedPoint: null,
            correct,
            distance: null,
            score: didTimeOut
              ? 0
              : scoreRound(kind, correct, null, hint, difficulty),
            hint,
            timedOut: didTimeOut,
          },
        ]);
      } else {
        if (!didTimeOut && !selectedPoint) return;
        resolvedRoundRef.current = true;
        const point = didTimeOut ? null : selectedPoint;
        const distance = point ? distanceKm(point, current.coordinates) : null;
        const correct =
          !didTimeOut &&
          distance !== null &&
          distance <= (difficulty === "easy" ? 100 : 35);
        setResults((items) => [
          ...items,
          {
            circuit: current,
            selectedName: null,
            selectedPoint: point,
            correct,
            distance,
            score: didTimeOut
              ? 0
              : scoreRound(kind, correct, distance, hint, difficulty),
            hint,
            timedOut: didTimeOut,
          },
        ]);
      }
      deadlineRef.current = null;
    },
    [
      answered,
      circuits,
      current,
      difficulty,
      hint,
      kind,
      selectedName,
      selectedPoint,
      timed,
    ],
  );

  useEffect(() => {
    if (phase !== "playing" || !timed || answered || !deadlineRef.current)
      return undefined;
    const update = () => {
      const left = Math.max(
        0,
        Math.ceil((deadlineRef.current! - Date.now()) / 1000),
      );
      setRemaining(left);
      if (left === 0) resolveRound(true);
    };
    update();
    const timer = window.setInterval(update, 250);
    const onVisibility = () => update();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [answered, phase, resolveRound, timed]);

  const nextRound = () => {
    if (!answered) return;
    if (roundIndex === ROUND_COUNT - 1) {
      const total = results.reduce((sum, item) => sum + item.score, 0);
      if (savedSessionRef.current !== sessionId) {
        const nextProgress = awardSession(
          progress,
          sessionId,
          recordKey,
          total,
        );
        savedSessionRef.current = sessionId;
        setProgress(nextProgress);
        try {
          window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(nextProgress),
          );
          setStorageError(false);
        } catch {
          setStorageError(true);
        }
      }
      setPhase("finished");
      return;
    }
    const nextIndex = roundIndex + 1;
    setRoundIndex(nextIndex);
    setSelectedName("");
    setSelectedPoint(null);
    setHint(false);
    resolvedRoundRef.current = false;
    setOptions(
      kind === "outline" && difficulty === "easy"
        ? makeOptions(rounds[nextIndex])
        : [],
    );
    beginDeadline();
  };

  const replay = () => {
    setPhase("settings");
    setStartError("");
  };
  const totalScore = results.reduce((sum, item) => sum + item.score, 0);
  const gainedXp = xpForScore(totalScore);
  const accurate = results.filter((item) => item.correct).length;

  if (!circuits.length)
    return (
      <main className="games-page">
        <Breadcrumbs items={[{ label: "Главная", href: "/" }, { label: "Мини-игры" }]} />
        <section className="games-empty">
          <span>Мини-игры</span>
          <h1>Трассы пока не готовы</h1>
          <p>
            Вернитесь позже: для раундов нужны проверенные контуры и координаты
          </p>
          <Link href="/circuits">Открыть каталог трасс →</Link>
        </section>
      </main>
    );

  return (
    <main className="games-page">
      <Breadcrumbs items={[{ label: "Главная", href: "/" }, { label: "Мини-игры" }]} />
      {storageError && (
        <div className="games-storage-warning" role="status">
          Не удалось сохранить прогресс на этом устройстве. Результат текущей
          сессии останется на экране
        </div>
      )}

      {(phase === "idle" || phase === "settings") && (
        <>
          <div className="games-hub-layout">
            <section className="games-cards" aria-label="Выбор мини-игры">
              <article className="games-card games-card--outline">
              <div className="games-card-visual">
                <span>01 / Контур</span>
                {logos.outline ? <img className="games-card-logo" src={logos.outline} alt="" /> : <Outline circuit={previewOutline} muted />}
              </div>
              <div className="games-card-copy">
                <span>Распознавание</span>
                <h2>
                  Угадай трассу
                  <br />
                  по контуру
                </h2>
                <p>
                  Сопоставьте характерные связки поворотов с одной из трасс
                  атласа
                </p>
                <ul>
                  <li>5 раундов</li>
                  <li>≈ 3 минуты</li>
                  <li>до 5 000 очков</li>
                </ul>
                <button type="button" onClick={() => openSettings("outline")}>
                  Настроить заезд <span>→</span>
                </button>
              </div>
              </article>
              <article className="games-card games-card--map">
              <div
                className="games-card-visual games-card-map-art"
                aria-hidden="true"
              >
                <span>02 / География</span>
                {logos.map ? <img className="games-card-logo" src={logos.map} alt="" /> : <><i /><b>⌖</b></>}
              </div>
              <div className="games-card-copy">
                <span>Карта мира</span>
                <h2>
                  Найди трассу
                  <br />
                  на карте
                </h2>
                <p>Поставьте точку как можно ближе к названному автодрому</p>
                <ul>
                  <li>5 раундов</li>
                  <li>≈ 4 минуты</li>
                  <li>очки за точность</li>
                </ul>
                <button type="button" onClick={() => openSettings("map")}>
                  Настроить заезд <span>→</span>
                </button>
              </div>
              </article>
              <article className="games-card games-card--driver">
              <div className="games-card-visual games-card-driver-art" aria-hidden="true"><span>03 / Пилоты</span>{logos["driver-geography"] ? <img className="games-card-logo" src={logos["driver-geography"]} alt="" /> : <><b>01</b><i>⌖</i></>}</div>
              <div className="games-card-copy"><span>Страны рождения</span><h2>География<br />пилотов</h2><p>Определите по карте, в какой стране родился пилот Formula 1</p><ul><li>5 раундов</li><li>векторная карта</li><li>до 5 000 очков</li></ul><Link className="games-card-link" href="/games/driver-geography">Открыть игру <span>→</span></Link></div>
              </article>
              <article className="games-card games-card--calendar">
              <div className="games-card-visual games-card-calendar-art" aria-hidden="true"><span>04 / Стратегия</span>{logos["calendar-optimizer"] ? <img className="games-card-logo" src={logos["calendar-optimizer"]} alt="" /> : <><i /><i /><i /><b>↝</b></>}</div>
              <div className="games-card-copy"><span>Логистика сезона</span><h2>Оптимизатор<br />календаря</h2><p>Переставьте реальные этапы и сократите суммарную дистанцию перелётов</p><ul><li>реальный сезон</li><li>маршрут на карте</li><li>очки за экономию</li></ul><Link className="games-card-link" href="/games/calendar-optimizer">Открыть игру <span>→</span></Link></div>
              </article>
            </section>
            <aside
              className="games-progress-panel"
              aria-label="Игровой прогресс"
              style={{ "--rank-accent": rank.accent } as CSSProperties}
            >
              <span>Уровень {rank.level} · звание</span>
              <div className="games-progress-rank">
                <b aria-hidden="true">{rank.badge}</b>
                <strong>{rank.name}</strong>
              </div>
              <div
                className="games-rank-track"
                role="progressbar"
                aria-label="Прогресс опыта до следующего звания"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(rankProgress)}
              >
                <i style={{ width: `${rankProgress}%` }} />
              </div>
              <small>
                {rank.next
                  ? `Накоплено ${formatScore(progress.xp)} из ${formatScore(rank.next)} XP`
                  : `Накоплено ${formatScore(progress.xp)} XP · высшее звание`}
              </small>
              <small className="games-progress-reward">Открыто: {rank.reward}</small>
              <dl>
                <div>
                  <dt>Личный рекорд</dt>
                  <dd>{storageReady ? formatScore(bestScore) : "—"}</dd>
                </div>
                <div>
                  <dt>Сессий</dt>
                  <dd>{storageReady ? progress.completed.length : "—"}</dd>
                </div>
              </dl>
            </aside>
          </div>
          {phase === "settings" && <div
            className="games-settings-layer"
            role="presentation"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setPhase("idle");
            }}
          >
            <section className="games-settings" role="dialog" aria-modal="true" aria-labelledby="games-settings-title">
              <>
                <div>
                  <span>Настройка сессии</span>
                  <h2 id="games-settings-title">
                    {kind === "outline" ? "Контур трассы" : "Точка на карте"}
                  </h2>
                </div>
                {kind === "outline" && <label className="games-era-select"><span>Эпоха этапов</span><select value={era} onChange={(event) => setEra(event.target.value as GameEra)}>{gameEras.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><small>Вопросы берутся только из сезонов, где этап действительно проводился</small></label>}
                <fieldset>
                  <legend>Сложность</legend>
                  <label>
                    <input
                      type="radio"
                      name="difficulty"
                      checked={difficulty === "easy"}
                      onChange={() => setDifficulty("easy")}
                    />
                    <span>
                      <b>Начальная</b>
                      <small>
                        {kind === "outline"
                          ? "4 варианта ответа"
                          : "Мягче оценка расстояния"}
                      </small>
                    </span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="difficulty"
                      checked={difficulty === "hard"}
                      onChange={() => setDifficulty("hard")}
                    />
                    <span>
                      <b>Высокая</b>
                      <small>
                        {kind === "outline"
                          ? "Поиск по названию"
                          : "Строже оценка расстояния"}
                      </small>
                    </span>
                  </label>
                </fieldset>
                <label className="games-timer-toggle">
                  <input
                    type="checkbox"
                    checked={timed}
                    onChange={(event) => setTimed(event.target.checked)}
                  />
                  <span>
                    <b>Таймер 30 секунд</b>
                    <small>
                      {timed
                        ? "Включён для каждого раунда"
                        : "Тренировка без ограничения времени"}
                    </small>
                  </span>
                </label>
                <div className="games-settings-actions">
                  <button type="button" onClick={() => setPhase("idle")}>
                    Отмена
                  </button>
                  <button className="is-primary" type="button" onClick={start}>
                    Начать сессию →
                  </button>
                </div>
                {startError && <p role="alert">{startError}</p>}
              </>
            </section>
          </div>}
        </>
      )}

      {phase === "playing" && current && (
        <section className="games-play">
          <header className="games-round-head">
            <div>
              <button type="button" onClick={() => setPhase("idle")}>
                ← К играм
              </button>
              <span>
                {kind === "outline" ? "Угадай трассу" : "Найди трассу"}
              </span>
            </div>
            <div
              className="games-round-progress"
              aria-label={`Раунд ${roundIndex + 1} из ${ROUND_COUNT}`}
            >
              <b>Раунд {roundIndex + 1}</b>
              <i>
                <span
                  style={{
                    width: `${((roundIndex + (answered ? 1 : 0)) / ROUND_COUNT) * 100}%`,
                  }}
                />
              </i>
              <small>
                {roundIndex + 1} / {ROUND_COUNT}
              </small>
            </div>
            {timed ? (
              <output
                className={remaining <= 5 && !answered ? "is-critical" : ""}
                aria-live="off"
              >
                <small>Время</small>
                <b>0:{String(remaining).padStart(2, "0")}</b>
              </output>
            ) : (
              <output>
                <small>Счёт</small>
                <b>{formatScore(totalScore)}</b>
              </output>
            )}
          </header>
          <div className={`games-arena games-arena--${kind}`}>
            <div className="games-field">
              {kind === "outline" ? (
                <>
                  <span className="games-field-label">
                    Контур без масштаба и подписей
                  </span>
                  <Outline circuit={current} />
                  {answered && (
                    <div className="games-answer-stamp">
                      {result.correct ? "Верно" : "Ответ"}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <span className="games-field-label">
                    Поставьте точку на карте
                  </span>
                  <GameLocationMap
                    key={current.id}
                    selection={selectedPoint}
                    answer={current.coordinates}
                    revealed={answered}
                    disabled={answered}
                    onSelect={setSelectedPoint}
                  />
                </>
              )}
            </div>
            <aside className="games-answer-panel">
              <span className="games-kicker">
                {answered
                  ? "Разбор раунда"
                  : kind === "outline"
                    ? "Что это за трасса?"
                    : "Где находится трасса?"}
              </span>
              {kind === "map" && !answered && <h2>{current.nameRu}</h2>}
              {!answered && (
                <>
                  {kind === "outline" && difficulty === "easy" && (
                    <fieldset className="games-options">
                      <legend className="sr-only">Выберите трассу</legend>
                      {options.map((option, index) => (
                        <label key={option.id}>
                          <input
                            type="radio"
                            name="answer"
                            checked={selectedName === option.nameRu}
                            onChange={() => setSelectedName(option.nameRu)}
                          />
                          <span>
                            <small>0{index + 1}</small>
                            {option.nameRu}
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                  {kind === "outline" && difficulty === "hard" && (
                    <label className="games-search-answer">
                      <span>Название трассы</span>
                      <input
                        list="games-circuit-names"
                        value={selectedName}
                        onChange={(event) =>
                          setSelectedName(event.target.value)
                        }
                        placeholder="Начните вводить название"
                        autoComplete="off"
                      />
                      <datalist id="games-circuit-names">
                        {circuits.map((circuit) => (
                          <option key={circuit.id} value={circuit.nameRu} />
                        ))}
                      </datalist>
                    </label>
                  )}
                  <button
                    className="games-hint"
                    type="button"
                    disabled={hint}
                    onClick={() => setHint(true)}
                  >
                    {hint ? `Страна: ${current.countryRu}` : "Показать страну"}{" "}
                    <small>−25% очков</small>
                  </button>
                  {kind === "map" && selectedPoint && (
                    <p className="games-selection-note">
                      Точка выбрана: {selectedPoint[1].toFixed(2)}°,{" "}
                      {selectedPoint[0].toFixed(2)}°
                    </p>
                  )}
                  <button
                    className="games-confirm"
                    type="button"
                    disabled={
                      kind === "map"
                        ? !selectedPoint
                        : !circuits.some(
                            (circuit) =>
                              circuit.nameRu.toLocaleLowerCase("ru") ===
                              selectedName.trim().toLocaleLowerCase("ru"),
                          )
                    }
                    onClick={() => resolveRound(false)}
                  >
                    Подтвердить ответ →
                  </button>
                  <p className="games-formula">
                    Максимум 1 000 очков за раунд
                    {hint ? " · подсказка применена" : ""}
                  </p>
                </>
              )}
              {answered && (
                <div className="games-review" role="status" aria-live="polite">
                  <div className={result.correct ? "is-correct" : ""}>
                    <small>
                      {result.timedOut
                        ? "Время вышло"
                        : result.correct
                          ? "Точное попадание"
                          : "Правильный ответ"}
                    </small>
                    <h2>{current.nameRu}</h2>
                    <p>{current.countryRu}</p>
                  </div>
                  {kind === "map" && (
                    <dl>
                      <div>
                        <dt>Расстояние</dt>
                        <dd>
                          {result.distance === null
                            ? "—"
                            : `${formatScore(Math.round(result.distance))} км`}
                        </dd>
                      </div>
                      <div>
                        <dt>Очки</dt>
                        <dd>+{formatScore(result.score)}</dd>
                      </div>
                    </dl>
                  )}
                  {kind === "outline" && (
                    <dl>
                      <div>
                        <dt>Ваш ответ</dt>
                        <dd>{result.selectedName ?? "Нет ответа"}</dd>
                      </div>
                      <div>
                        <dt>Очки</dt>
                        <dd>+{formatScore(result.score)}</dd>
                      </div>
                    </dl>
                  )}
                  <Link href={`/circuits/${current.slug}`}>
                    Открыть страницу трассы ↗
                  </Link>
                  <button
                    className="games-confirm"
                    type="button"
                    onClick={nextRound}
                  >
                    {roundIndex === ROUND_COUNT - 1
                      ? "Смотреть итоги →"
                      : "Следующий раунд →"}
                  </button>
                </div>
              )}
            </aside>
          </div>
        </section>
      )}

      {phase === "finished" && (
        <GameSessionSummary
          description={`${kind === "outline" ? "Контуры трасс" : "География трасс"} · ${difficulty === "easy" ? "начальная сложность" : "высокая сложность"} · ${timed ? "с таймером" : "без таймера"}`}
          score={totalScore}
          gainedXp={gainedXp}
          record={progress.records[recordKey] ?? totalScore}
          rank={rank}
          xp={progress.xp}
          metrics={[{ label: "Точных ответов", value: `${accurate} / ${ROUND_COUNT}` }]}
          actions={
            <>
              <button type="button" onClick={replay}>Ещё раз</button>
              <button className="is-primary" type="button" onClick={() => setPhase("idle")}>К играм →</button>
            </>
          }
        >
          <section className="games-results" aria-label="Разбор раундов">
            <h2>Разбор заезда</h2>
            {results.map((item, index) => (
              <article key={`${item.circuit.id}-${index}`}>
                <span>0{index + 1}</span>
                <Outline circuit={item.circuit} muted />
                <div>
                  <h3>{item.circuit.nameRu}</h3>
                  <p>
                    {item.circuit.countryRu}
                    {item.distance !== null
                      ? ` · ${formatScore(Math.round(item.distance))} км`
                      : ""}
                  </p>
                </div>
                <b>+{formatScore(item.score)}</b>
                <Link
                  href={`/circuits/${item.circuit.slug}`}
                  aria-label={`Открыть ${item.circuit.nameRu}`}
                >
                  ↗
                </Link>
              </article>
            ))}
          </section>
        </GameSessionSummary>
      )}
    </main>
  );
}
