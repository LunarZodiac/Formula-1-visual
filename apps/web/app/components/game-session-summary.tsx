import type { CSSProperties, ReactNode } from "react";
import "./game-session-summary.css";

type SummaryMetric = {
  label: string;
  value: ReactNode;
};

export function GameSessionSummary({
  eyebrow = "Клетчатый флаг",
  title = "Сессия завершена",
  description,
  score,
  gainedXp,
  record,
  rank,
  xp,
  metrics = [],
  children,
  actions,
}: {
  eyebrow?: string;
  title?: string;
  description: string;
  score: number;
  gainedXp: number;
  record: number;
  rank: {
    name: string;
    min: number;
    next: number | null;
    badge: string;
    accent: string;
    reward: string;
  };
  xp: number;
  metrics?: SummaryMetric[];
  children?: ReactNode;
  actions: ReactNode;
}) {
  const progress = rank.next
    ? Math.min(100, ((xp - rank.min) / (rank.next - rank.min)) * 100)
    : 100;
  const format = (value: number) => value.toLocaleString("ru-RU");

  return (
    <section className="game-session-summary" aria-labelledby="game-session-summary-title">
      <header>
        <span>{eyebrow}</span>
        <h1 id="game-session-summary-title">{title}</h1>
        <p>{description}</p>
      </header>
      <div className="game-session-summary__score">
        <div>
          <small>Итоговый счёт</small>
          <strong>{format(score)}</strong>
          <span>из 5 000</span>
        </div>
        <dl>
          {metrics.map((metric) => (
            <div key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
            </div>
          ))}
          <div>
            <dt>Получено опыта</dt>
            <dd>+{format(gainedXp)} XP</dd>
          </div>
          <div>
            <dt>Личный рекорд</dt>
            <dd>{format(record)}</dd>
          </div>
        </dl>
      </div>
      <div
        className="game-session-summary__rank"
        style={{ "--rank-accent": rank.accent } as CSSProperties}
      >
        <div className="game-session-summary__rank-name">
          <b aria-hidden="true">{rank.badge}</b>
          <span>
            <small>Текущее звание</small>
            <strong>{rank.name}</strong>
          </span>
        </div>
        <div className="game-session-summary__rank-track" role="progressbar" aria-label="Прогресс опыта до следующего звания" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
          <i style={{ width: `${progress}%` }} />
        </div>
        <span className="game-session-summary__rank-copy">
          <small>{rank.reward}</small>
          <small>
            {rank.next
              ? `До следующего звания: ${format(Math.max(0, rank.next - xp))} XP`
              : "Высшее звание открыто"}
          </small>
        </span>
      </div>
      {children}
      <div className="game-session-summary__actions">{actions}</div>
    </section>
  );
}
