import type { TeamListItem } from './competitor-contract';

export type TeamTimelineSegment = {
  name: string;
  startSeason: number;
  endSeason: number;
  seasons: number[];
};

export type TeamTimelineRow = {
  team: TeamListItem;
  segments: TeamTimelineSegment[];
};

export type TeamTimelineModel = {
  startSeason: number | null;
  endSeason: number | null;
  yearCount: number;
  years: number[];
  rows: TeamTimelineRow[];
};

export type TeamTimelineParticipationEra = {
  teamId: string;
  startSeason: number;
  endSeason: number;
};

export type TeamTimelineLineage = {
  relationshipType: TeamListItem['lineages'][number]['relationshipType'];
  descriptionRu: string | null;
  sourceUrl: string;
  transitionYear: number;
  predecessor: TeamTimelineParticipationEra;
  successor: TeamTimelineParticipationEra;
};

export type TeamTimelineFamilyMember = {
  team: TeamListItem;
  era: TeamTimelineParticipationEra;
  segments: TeamTimelineSegment[];
};

export type TeamTimelineFamilyRow = {
  key: string;
  members: TeamTimelineFamilyMember[];
};

export type TeamTimelineContextSegment = {
  team: TeamListItem;
  segment: TeamTimelineSegment;
};

export function lineageAppliesToSegment(lineage: TeamListItem['lineages'][number], segment: TeamTimelineSegment) {
  if (lineage.validFromYear === null && lineage.validToYear === null) return false;
  const rangeStart = lineage.validFromYear ?? -Infinity;
  const rangeEnd = lineage.validToYear ?? Infinity;
  const segmentBoundary = segment.endSeason + (lineage.direction === 'successor' ? 1 : 0);
  return rangeStart <= segmentBoundary && rangeEnd >= segment.startSeason;
}

export function groupTeamTimelineSeasons(team: Pick<TeamListItem, 'seasons'>): TeamTimelineSegment[] {
  const seen = new Set<string>();
  const seasons = team.seasons
    .filter((row) => {
      const key = `${row.season}\u0000${row.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.season - b.season || a.name.localeCompare(b.name, 'ru'));

  return seasons.reduce<TeamTimelineSegment[]>((segments, row) => {
    const current = segments.at(-1);
    if (current && current.name === row.name && current.endSeason + 1 === row.season) {
      current.endSeason = row.season;
      current.seasons.push(row.season);
      return segments;
    }
    segments.push({ name: row.name, startSeason: row.season, endSeason: row.season, seasons: [row.season] });
    return segments;
  }, []);
}

function groupParticipationEras(team: Pick<TeamListItem, 'id' | 'seasons'>): TeamTimelineParticipationEra[] {
  const years = [...new Set(team.seasons.map((row) => row.season))].sort((a, b) => a - b);

  return years.reduce<TeamTimelineParticipationEra[]>((eras, year) => {
    const current = eras.at(-1);
    if (current && current.endSeason + 1 === year) {
      current.endSeason = year;
      return eras;
    }
    eras.push({ teamId: team.id, startSeason: year, endSeason: year });
    return eras;
  }, []);
}

/**
 * Resolves published successor links to the two concrete participation eras on
 * either side of their effective season. A shared constructor ID can therefore
 * appear in several independent historical chains without joining across gaps.
 */
export function buildTeamTimelineLineages(teams: TeamListItem[]): TeamTimelineLineage[] {
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const erasByTeamId = new Map(teams.map((team) => [team.id, groupParticipationEras(team)]));
  const seen = new Set<string>();
  const resolved: TeamTimelineLineage[] = [];

  for (const predecessor of teams) {
    for (const lineage of predecessor.lineages) {
      if (lineage.direction !== 'successor' || lineage.validFromYear === null) continue;

      const transitionYear = lineage.validFromYear;
      if (!teamsById.has(lineage.teamId)) continue;

      const predecessorEra = erasByTeamId.get(predecessor.id)
        ?.find((era) => era.startSeason <= transitionYear - 1 && era.endSeason >= transitionYear - 1);
      const successorEra = erasByTeamId.get(lineage.teamId)
        ?.find((era) => era.startSeason <= transitionYear && era.endSeason >= transitionYear);
      if (!predecessorEra || !successorEra) continue;

      const identity = [predecessor.id, lineage.teamId, transitionYear, lineage.relationshipType].join('\u0000');
      if (seen.has(identity)) continue;
      seen.add(identity);
      resolved.push({
        relationshipType: lineage.relationshipType,
        descriptionRu: lineage.descriptionRu,
        sourceUrl: lineage.sourceUrl,
        transitionYear,
        predecessor: { ...predecessorEra },
        successor: { ...successorEra },
      });
    }
  }

  return resolved.sort((a, b) => a.transitionYear - b.transitionYear
    || a.predecessor.teamId.localeCompare(b.predecessor.teamId)
    || a.successor.teamId.localeCompare(b.successor.teamId)
    || a.relationshipType.localeCompare(b.relationshipType));
}

function participationEraKey(era: TeamTimelineParticipationEra) {
  return `${era.teamId}:${era.startSeason}-${era.endSeason}`;
}

/**
 * Groups visible participation eras into unambiguous, chronological lineage
 * families. Hidden identities never act as bridges. Components which would
 * require branches or overlapping tracks deliberately fall back to singleton
 * rows until the timeline has a multi-lane representation.
 */
export function buildTeamTimelineFamilies(
  teams: TeamListItem[],
  allTeams: TeamListItem[] = teams,
): TeamTimelineFamilyRow[] {
  const visibleTeamIds = new Set(teams.map((team) => team.id));
  const teamOrder = new Map(teams.map((team, index) => [team.id, index]));
  const membersByKey = new Map<string, TeamTimelineFamilyMember>();

  for (const team of teams) {
    const segments = groupTeamTimelineSeasons(team);
    for (const era of groupParticipationEras(team)) {
      const member = {
        team,
        era,
        segments: segments.filter((segment) => (
          segment.startSeason >= era.startSeason && segment.endSeason <= era.endSeason
        )),
      };
      membersByKey.set(participationEraKey(era), member);
    }
  }

  const parents = new Map([...membersByKey.keys()].map((key) => [key, key]));
  const find = (key: string): string => {
    const parent = parents.get(key);
    if (parent === undefined || parent === key) return key;
    const root = find(parent);
    parents.set(key, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents.set(rightRoot, leftRoot);
  };

  const edges = new Map<string, { predecessorKey: string; successorKey: string }>();
  for (const lineage of buildTeamTimelineLineages(allTeams)) {
    if (!visibleTeamIds.has(lineage.predecessor.teamId) || !visibleTeamIds.has(lineage.successor.teamId)) continue;
    const predecessorKey = participationEraKey(lineage.predecessor);
    const successorKey = participationEraKey(lineage.successor);
    if (!membersByKey.has(predecessorKey) || !membersByKey.has(successorKey)) continue;
    const edgeKey = `${predecessorKey}\u0000${successorKey}`;
    if (!edges.has(edgeKey)) edges.set(edgeKey, { predecessorKey, successorKey });
    union(predecessorKey, successorKey);
  }

  const components = new Map<string, TeamTimelineFamilyMember[]>();
  for (const [key, member] of membersByKey) {
    const root = find(key);
    const component = components.get(root) ?? [];
    component.push(member);
    components.set(root, component);
  }

  const chronological = (left: TeamTimelineFamilyMember, right: TeamTimelineFamilyMember) => (
    left.era.startSeason - right.era.startSeason
    || left.era.endSeason - right.era.endSeason
    || left.team.id.localeCompare(right.team.id)
  );
  const rows: TeamTimelineFamilyRow[] = [];

  for (const members of components.values()) {
    members.sort(chronological);
    const memberKeys = new Set(members.map((member) => participationEraKey(member.era)));
    const componentEdges = [...edges.values()].filter((edge) => (
      memberKeys.has(edge.predecessorKey) && memberKeys.has(edge.successorKey)
    ));
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    for (const edge of componentEdges) {
      outgoing.set(edge.predecessorKey, (outgoing.get(edge.predecessorKey) ?? 0) + 1);
      incoming.set(edge.successorKey, (incoming.get(edge.successorKey) ?? 0) + 1);
    }
    const overlaps = members.some((member, index) => {
      const next = members[index + 1];
      return next !== undefined && member.era.endSeason >= next.era.startSeason;
    });
    const isLinear = componentEdges.length === Math.max(0, members.length - 1)
      && members.every((member) => {
        const key = participationEraKey(member.era);
        return (incoming.get(key) ?? 0) <= 1 && (outgoing.get(key) ?? 0) <= 1;
      });

    if (!isLinear || overlaps) {
      for (const member of members) {
        rows.push({ key: participationEraKey(member.era), members: [member] });
      }
      continue;
    }

    rows.push({
      key: members.map((member) => participationEraKey(member.era)).join('>'),
      members,
    });
  }

  return rows.sort((left, right) => {
    const leftStart = left.members[0]?.era.startSeason ?? Infinity;
    const rightStart = right.members[0]?.era.startSeason ?? Infinity;
    const leftOrder = Math.min(...left.members.map((member) => teamOrder.get(member.team.id) ?? Infinity));
    const rightOrder = Math.min(...right.members.map((member) => teamOrder.get(member.team.id) ?? Infinity));
    return leftStart - rightStart || leftOrder - rightOrder || left.key.localeCompare(right.key);
  });
}

function segmentsOverlap(left: TeamTimelineSegment, right: TeamTimelineSegment) {
  return left.startSeason <= right.endSeason && right.startSeason <= left.endSeason;
}

/**
 * Returns disconnected eras of identities already present in a family. These
 * segments are context only: they never introduce a filtered-out identity and
 * are discarded whenever they would occupy the same seasons as a real family
 * segment or an earlier retained context segment.
 */
export function buildTeamTimelineContextSegments(
  family: TeamTimelineFamilyRow,
  rows: TeamTimelineRow[],
): TeamTimelineContextSegment[] {
  const memberTeamIds = new Set(family.members.map((member) => member.team.id));
  const realSegments = family.members.flatMap((member) => member.segments);
  const ownErasByTeamId = new Map<string, TeamTimelineParticipationEra[]>();
  for (const member of family.members) {
    const eras = ownErasByTeamId.get(member.team.id) ?? [];
    eras.push(member.era);
    ownErasByTeamId.set(member.team.id, eras);
  }

  const rowOrder = new Map(rows.map((row, index) => [row.team.id, index]));
  const candidates = rows.flatMap((row) => {
    if (!memberTeamIds.has(row.team.id)) return [];
    const ownEras = ownErasByTeamId.get(row.team.id) ?? [];
    return row.segments.flatMap((segment) => {
      const belongsToFamilyEra = ownEras.some((era) => (
        segment.startSeason >= era.startSeason && segment.endSeason <= era.endSeason
      ));
      return belongsToFamilyEra ? [] : [{ team: row.team, segment }];
    });
  }).sort((left, right) => (
    left.segment.startSeason - right.segment.startSeason
    || left.segment.endSeason - right.segment.endSeason
    || (rowOrder.get(left.team.id) ?? Infinity) - (rowOrder.get(right.team.id) ?? Infinity)
    || left.team.id.localeCompare(right.team.id)
    || left.segment.name.localeCompare(right.segment.name, 'ru')
  ));

  const seen = new Set<string>();
  const retained: TeamTimelineContextSegment[] = [];
  for (const candidate of candidates) {
    const key = [candidate.team.id, candidate.segment.startSeason, candidate.segment.endSeason, candidate.segment.name].join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    if (realSegments.some((segment) => segmentsOverlap(segment, candidate.segment))) continue;
    if (retained.some(({ segment }) => segmentsOverlap(segment, candidate.segment))) continue;
    retained.push(candidate);
  }
  return retained;
}

export function buildTeamTimelineModel(teams: TeamListItem[]): TeamTimelineModel {
  const sourceYears = teams.flatMap((team) => team.seasons.map((row) => row.season));
  const startSeason = sourceYears.length ? Math.min(...sourceYears) : null;
  const endSeason = sourceYears.length ? Math.max(...sourceYears) : null;
  const years = startSeason === null || endSeason === null
    ? []
    : Array.from({ length: endSeason - startSeason + 1 }, (_, index) => startSeason + index);

  return {
    startSeason,
    endSeason,
    yearCount: years.length,
    years,
    rows: teams.map((team) => ({ team, segments: groupTeamTimelineSeasons(team) })),
  };
}
