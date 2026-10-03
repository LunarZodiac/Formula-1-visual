'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { TeamListItem } from '../data/competitor-contract';
import { buildTeamTimelineContextSegments, buildTeamTimelineFamilies, buildTeamTimelineLineages, buildTeamTimelineModel, type TeamTimelineSegment } from '../data/team-timeline-model';

const lineageDirectionLabels = { predecessor: 'Предшественник', successor: 'Преемник' } as const;
const lineageTypeLabels = {
  rename: 'Переименование', ownership_change: 'Смена владельца', factory_takeover: 'Переход под заводской контроль',
  licence_transfer: 'Передача заявки или лицензии', continuation: 'Продолжение', other: 'Другая связь',
} as const;

function segmentKey(teamId: string, segment: TeamTimelineSegment) {
  return `${teamId}:${segment.startSeason}:${segment.endSeason}:${segment.name}`;
}

function seasonRange(startSeason: number, endSeason: number) {
  return startSeason === endSeason ? String(startSeason) : `${startSeason}–${endSeason}`;
}

export function TeamTimeline({ teams, allTeams = teams, colorForTeam }: { teams: TeamListItem[]; allTeams?: TeamListItem[]; colorForTeam?: (team: TeamListItem) => string }) {
  const model = useMemo(() => buildTeamTimelineModel(teams), [teams]);
  const families = useMemo(() => buildTeamTimelineFamilies(teams, allTeams), [teams, allTeams]);
  const displayRows = useMemo(() => families.map((family) => ({
    ...family,
    periods: [
      ...family.members.flatMap(({ team, segments }) => segments.map((segment) => ({ team, segment, context: false }))),
      ...buildTeamTimelineContextSegments(family, model.rows).map((period) => ({ ...period, context: true })),
    ].map((period) => ({ ...period, instanceKey: `${family.key}|${segmentKey(period.team.id, period.segment)}` })),
  })), [families, model.rows]);
  const lineages = useMemo(() => buildTeamTimelineLineages(allTeams), [allTeams]);
  const teamsById = useMemo(() => new Map(allTeams.map((team) => [team.id, team])), [allTeams]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const detailsRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selectedKey) detailsRef.current?.focus();
    else openerRef.current = null;
  }, [selectedKey]);
  const closeDetails = () => {
    setSelectedKey(null);
    openerRef.current?.focus({ preventScroll: true });
  };
  const selected = (() => {
    for (const row of model.rows) {
      const segment = row.segments.find((item) => selectedKey?.endsWith(`|${segmentKey(row.team.id, item)}`));
      if (segment) return { team: row.team, segment };
    }
    return null;
  })();
  // Clear a selection removed by filters before it can reappear on a later reset.
  if (selectedKey && (!selected || !displayRows.some(({ periods }) => periods.some(({ instanceKey }) => instanceKey === selectedKey)))) setSelectedKey(null);
  const selectedLineages = selected ? lineages.flatMap((lineage) => {
    const direction: 'successor' | 'predecessor' = lineage.predecessor.teamId === selected.team.id ? 'successor' : 'predecessor';
    const ownPeriod = direction === 'successor' ? lineage.predecessor : lineage.successor;
    if (ownPeriod.teamId !== selected.team.id || ownPeriod.startSeason > selected.segment.startSeason || ownPeriod.endSeason < selected.segment.endSeason) return [];
    const otherPeriod = direction === 'successor' ? lineage.successor : lineage.predecessor;
    const otherTeam = teamsById.get(otherPeriod.teamId);
    const profileSeason = direction === 'successor' ? lineage.transitionYear : lineage.transitionYear - 1;
    const periodName = otherTeam?.seasons.find((row) => row.season === profileSeason)?.name ?? otherTeam?.name ?? otherPeriod.teamId;
    return [{ ...lineage, direction, otherPeriod, profileSeason, periodName }];
  }) : [];

  if (model.startSeason === null || model.endSeason === null) {
    return <section className="team-timeline" aria-labelledby="team-timeline-title"><header className="team-timeline__intro"><h2 id="team-timeline-title">Хронология команд</h2><p>Для выбранных команд пока нет данных по сезонам</p></header></section>;
  }

  const startSeason = model.startSeason;
  const timelineStyle = {
    '--timeline-years': model.yearCount,
  } as CSSProperties;

  return <section className="team-timeline" aria-labelledby="team-timeline-title">
    <header className="team-timeline__intro"><div><span>{seasonRange(model.startSeason, model.endSeason)}</span><h2 id="team-timeline-title">Хронология команд</h2></div><p>Каждый участок показывает непрерывные сезоны под одним названием. Подтверждённые цепочки объединены в одну строку, но статистика команд остаётся раздельной. Пропуски в данных не соединяются. Фильтры отбирают команды, сохраняя всю их историю; основания переходов доступны по нажатию на период</p></header>
    {selected ? <aside className="team-timeline__details" id="team-timeline-details" ref={detailsRef} tabIndex={-1} aria-label="Подробности периода команды" onKeyDown={(event) => { if (event.key === 'Escape') closeDetails(); }}>
      <div><small>{selected.team.nameRu ?? selected.team.name}</small><strong>{selected.segment.name}</strong><span>{seasonRange(selected.segment.startSeason, selected.segment.endSeason)}</span></div>
      <Link href={`/teams/${selected.team.id}?season=${selected.segment.endSeason}`}>Открыть профиль команды →</Link>
      <button type="button" onClick={closeDetails} aria-label="Закрыть подробности">×</button>
      {selectedLineages.length ? <ul>{selectedLineages.map((lineage) => <li key={`${lineage.predecessor.teamId}:${lineage.successor.teamId}:${lineage.transitionYear}:${lineage.relationshipType}`}><div><strong>{lineageDirectionLabels[lineage.direction]}: <Link href={`/teams/${lineage.otherPeriod.teamId}?season=${lineage.profileSeason}`}>{lineage.periodName}</Link></strong><span>Период участия: {seasonRange(lineage.otherPeriod.startSeason, lineage.otherPeriod.endSeason)}</span><span>{lineageTypeLabels[lineage.relationshipType]} · переход в сезоне {lineage.transitionYear}</span>{lineage.descriptionRu ? <p>{lineage.descriptionRu}</p> : null}</div><a href={lineage.sourceUrl} target="_blank" rel="noreferrer">Источник ↗</a></li>)}</ul> : <p>Для этого периода в каталоге пока нет подтверждённых связей преемственности</p>}
    </aside> : null}
    <div className="team-timeline__key"><span><i aria-hidden="true" />Основной период строки</span><span><i aria-hidden="true" />Другие периоды участия той же команды</span></div>
    <div className="team-timeline__viewport" tabIndex={0} role="region" aria-label="Шкала сезонов команд, прокручивается по горизонтали и вертикали">
      <div className="team-timeline__canvas" style={timelineStyle}>
        <div className="team-timeline__scale" aria-hidden="true"><span className="team-timeline__corner">Команда</span><div className="team-timeline__years">{model.years.map((year) => <span key={year}>{year}</span>)}</div></div>
        <div className="team-timeline__rows">{displayRows.map(({ key: familyKey, members, periods }) => {
          return <article className="team-timeline__row" key={familyKey}>
          <header className="team-timeline__label"><strong>{members.map(({ team }) => team.name).join(' → ')}</strong><small>{members.length > 1 ? 'Подтверждённая преемственность' : seasonRange(members[0].era.startSeason, members[0].era.endSeason)}</small></header>
          <div className="team-timeline__track">{periods.map(({ team, segment, context, instanceKey: key }) => {
            return <button
              className={`team-timeline__segment${context ? ' team-timeline__segment--context' : ''}`}
              type="button"
              key={key}
              style={{ gridRow: 1, gridColumn: `${segment.startSeason - startSeason + 1} / span ${segment.endSeason - segment.startSeason + 1}`, '--team-color': colorForTeam?.(team) ?? team.color ?? '#738795' } as CSSProperties}
              aria-expanded={selectedKey === key}
              aria-controls={selectedKey === key ? 'team-timeline-details' : undefined}
              onClick={(event) => { openerRef.current = event.currentTarget; setSelectedKey((current) => current === key ? null : key); }}
              title={`${segment.name}, ${seasonRange(segment.startSeason, segment.endSeason)}${context ? ' — другой период участия' : ''}`}
            ><span>{segment.name}</span><small>{seasonRange(segment.startSeason, segment.endSeason)}</small></button>;
          })}</div>
        </article>;
        })}</div>
      </div>
    </div>
  </section>;
}
