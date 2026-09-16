export type CompetitorSource = { id: string; name: string; url: string | null; licence: string | null; retrievedAt: string | null };

/** raceEntries counts distinct Grand Prix sessions with a result, not race starts. */
export type RaceStatistics = {
  raceEntries: number; wins: number; podiums: number; points: number;
  circuits: number; countries: number; winningCircuits: number;
  firstSeason: number | null; lastSeason: number | null; throughRound: number | null;
};
export type ResultGeography = {
  id: string; name: string; slug: string | null; isPublished: boolean;
  countryCode: string; coordinates: [number, number];
  raceEntries: number; wins: number; podiums: number; points: number;
};
export type CompetitorStanding = {
  season: number; position: number | null; points: number; wins: number;
  afterRound: number; isFinal: boolean; status: string;
  standingAvailable?: boolean;
  numbers?: number[];
};
export type DriverNumberEntry = {
  raceId: string; round: number; raceName: string; number: number;
  numberType: 'permanent' | 'season' | 'event' | 'champion' | 'shared_car' | 'unknown';
  reviewStatus: 'imported' | 'candidate' | 'reviewed' | 'verified' | 'rejected';
  team: { id: string; name: string } | null;
};
export type DriverNickname = {
  id: string; nameRu: string; nameOriginal: string | null; contextRu: string | null;
  sourceUrl: string; sortOrder: number;
};
export type DriverQuote = {
  id: string; quoteRu: string; quoteOriginal: string | null; attributionRu: string;
  contextRu: string | null; quoteDate: string | null; sourceUrl: string; sortOrder: number;
};
type CompetitorHistory = {
  careerTitles: number; sourceIds: string[];
  raceStatistics: RaceStatistics; seasonRaceStatistics: RaceStatistics;
  resultGeography: ResultGeography[];
  successfulCircuits: { id: string; name: string; slug: string | null; isPublished: boolean; wins: number }[];
};
export type DriverCatalogItem = CompetitorHistory & {
  id: string; nameRu: string; nameEn: string; code: string | null; number: number | null;
  permanentNumber?: number | null;
  numberEntries?: DriverNumberEntry[];
  nationality: string | null; position: number | null; points: number; wins: number;
  standingAvailable?: boolean;
  biography?: string | null; birthDate?: string | null; deathDate?: string | null; birthPlace?: string | null;
  nicknames?: DriverNickname[]; quotes?: DriverQuote[];
  heightCm?: number | null; weightKg?: number | null;
  photoUrl?: string | null;
  team: { id: string; name: string; color: string | null; logoUrl: string | null } | null;
  seasonHistory: (CompetitorStanding & { teams: { id: string; name: string; raceEntries: number; points: number }[] })[];
};
export type DriverListItem = Pick<DriverCatalogItem, 'id' | 'nameRu' | 'nameEn' | 'code' | 'number' | 'permanentNumber' | 'nationality' | 'position' | 'points' | 'wins' | 'team'> & {
  latestSeason?: number;
  firstSeason?: number;
  seasonCount?: number;
  seasonHistory?: { season: number; numbers?: number[] }[];
};
export type TeamCatalogItem = CompetitorHistory & {
  id: string; name: string; nationality: string | null; position: number; points: number; wins: number;
  driverCount: number; engineName: string | null; color: string | null; logoUrl: string | null;
  carModel: string | null; carImageUrl: string | null;
  drivers: { id: string; nameRu: string; code: string | null; position: number | null; points: number; raceEntries: number; teamPoints: number }[];
  seasonHistory: (CompetitorStanding & { name: string })[];
};
type CatalogMetadata = { schemaVersion: 2; season: number; generatedAt: string; seasonStatus: string; afterRound: number; sources: CompetitorSource[] };
export type DriverCatalogData = CatalogMetadata & { drivers: DriverCatalogItem[] };
export type TeamCatalogData = CatalogMetadata & { teams: TeamCatalogItem[] };
export type TeamListItem = {
  id: string; name: string; nationality: string | null; firstSeason: number; latestSeason: number;
  seasonCount: number; aliases: string[]; careerTitles: number; raceEntries: number;
  wins: number; podiums: number; points: number; color: string | null; logoUrl: string | null;
  carImageUrl: string | null;
  lineages: { direction: 'predecessor' | 'successor'; teamId: string; teamName: string;
    relationshipType: 'rename' | 'ownership_change' | 'factory_takeover' | 'licence_transfer' | 'continuation' | 'other';
    validFromYear: number | null; validToYear: number | null; descriptionRu: string | null; sourceUrl: string }[];
  seasons: { season: number; name: string; position: number | null; points: number; wins: number; isFinal: boolean }[];
};
export type AllTeamCatalogData = { schemaVersion: 1; generatedAt: string; teams: TeamListItem[] };

/** Shared by the exporter and route loaders: fail early instead of rendering misleading data. */
export function assertCompetitorCatalog(value: unknown, kind: 'drivers' | 'teams'): void {
  const fail = (path: string): never => { throw new Error(`Invalid ${kind} catalog: ${path}`); };
  const object = (input: unknown, path: string): Record<string, unknown> => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(path);
    return input as Record<string, unknown>;
  };
  const text = (input: unknown, path: string): string => {
    if (typeof input !== 'string' || !input.trim()) fail(path);
    return input as string;
  };
  const nullableText = (input: unknown, path: string) => { if (input !== null) text(input, path); };
  const finite = (input: unknown, path: string): number => {
    if (typeof input !== 'number' || !Number.isFinite(input)) fail(path);
    return input as number;
  };
  const integer = (input: unknown, path: string, minimum = 0): number => {
    const result = finite(input, path);
    if (!Number.isInteger(result) || result < minimum) fail(path);
    return result;
  };
  const boolean = (input: unknown, path: string) => { if (typeof input !== 'boolean') fail(path); };
  const list = (input: unknown, path: string): unknown[] => {
    if (!Array.isArray(input)) fail(path);
    return input as unknown[];
  };
  const unique = (rows: unknown[], path: string, key = 'id') => {
    const ids = rows.map((row, index) => object(row, `${path}[${index}]`)[key]);
    if (new Set(ids).size !== ids.length) fail(`${path}: duplicate ${key}`);
  };
  const date = (input: unknown, path: string) => { if (!Number.isFinite(Date.parse(text(input, path)))) fail(path); };
  const catalog = object(value, 'root');
  if (catalog.schemaVersion !== 2) fail('schemaVersion (expected 2)');
  const season = integer(catalog.season, 'season', 1950);
  integer(catalog.afterRound, 'afterRound');
  text(catalog.seasonStatus, 'seasonStatus');
  date(catalog.generatedAt, 'generatedAt');
  const sources = list(catalog.sources, 'sources');
  if (!sources.length) fail('sources (empty)');
  unique(sources, 'sources');
  const sourceIds = new Set(sources.map((source, index) => {
    const row = object(source, `sources[${index}]`);
    for (const key of ['id', 'name']) text(row[key], `sources[${index}].${key}`);
    nullableText(row.licence, `sources[${index}].licence`);
    if (row.url !== null && !/^https?:\/\//.test(text(row.url, `sources[${index}].url`))) fail(`sources[${index}].url`);
    if (row.retrievedAt !== null) date(row.retrievedAt, `sources[${index}].retrievedAt`);
    return row.id;
  }));
  const counts = (row: Record<string, unknown>, path: string) => {
    const entries = integer(row.raceEntries, `${path}.raceEntries`);
    const wins = integer(row.wins, `${path}.wins`);
    const podiums = integer(row.podiums, `${path}.podiums`);
    finite(row.points, `${path}.points`);
    if (wins > entries || podiums < wins || podiums > entries * (kind === 'teams' ? 3 : 1)) fail(`${path}: result counts`);
  };
  const statistics = (input: unknown, path: string) => {
    const row = object(input, path);
    counts(row, path);
    for (const key of ['circuits', 'countries', 'winningCircuits']) integer(row[key], `${path}.${key}`);
    if (Number(row.winningCircuits) > Number(row.circuits) || Number(row.winningCircuits) > Number(row.wins) || Number(row.circuits) > Number(row.raceEntries) || Number(row.countries) > Number(row.circuits)) fail(`${path}: geography counts`);
    for (const key of ['firstSeason', 'lastSeason']) if (row[key] !== null && integer(row[key], `${path}.${key}`, 1950) > season) fail(`${path}.${key}`);
    if ((row.firstSeason === null) !== (row.lastSeason === null) || (row.firstSeason !== null && Number(row.firstSeason) > Number(row.lastSeason))) fail(`${path}: season range`);
    if (row.throughRound !== null) integer(row.throughRound, `${path}.throughRound`);
  };
  const rows = list(catalog[kind], kind);
  unique(rows, kind);
  rows.forEach((item, index) => {
    const path = `${kind}[${index}]`;
    const row = object(item, path);
    text(row.id, `${path}.id`);
    if (kind === 'drivers' && row.position === null) {
      if (row.standingAvailable !== false) fail(`${path}.standingAvailable`);
    } else integer(row.position, `${path}.position`, 1);
    if (kind === 'drivers' && row.standingAvailable !== undefined) boolean(row.standingAvailable, `${path}.standingAvailable`);
    finite(row.points, `${path}.points`);
    integer(row.wins, `${path}.wins`);
    const titles = integer(row.careerTitles, `${path}.careerTitles`);
    nullableText(row.nationality, `${path}.nationality`);
    const references = list(row.sourceIds, `${path}.sourceIds`);
    if (new Set(references).size !== references.length) fail(`${path}.sourceIds`);
    for (const id of references) if (!sourceIds.has(id)) fail(`${path}.sourceIds: unknown source`);
    statistics(row.raceStatistics, `${path}.raceStatistics`);
    statistics(row.seasonRaceStatistics, `${path}.seasonRaceStatistics`);
    const geography = list(row.resultGeography, `${path}.resultGeography`);
    unique(geography, `${path}.resultGeography`);
    geography.forEach((entry, geoIndex) => {
      const geoPath = `${path}.resultGeography[${geoIndex}]`;
      const geo = object(entry, geoPath);
      for (const key of ['id', 'name', 'countryCode']) text(geo[key], `${geoPath}.${key}`);
      nullableText(geo.slug, `${geoPath}.slug`);
      boolean(geo.isPublished, `${geoPath}.isPublished`);
      if (geo.isPublished && !geo.slug) fail(`${geoPath}.slug`);
      const coordinates = list(geo.coordinates, `${geoPath}.coordinates`);
      if (coordinates.length !== 2 || Math.abs(finite(coordinates[0], geoPath)) > 180 || Math.abs(finite(coordinates[1], geoPath)) > 90) fail(`${geoPath}.coordinates`);
      counts(geo, geoPath);
    });
    const successful = list(row.successfulCircuits, `${path}.successfulCircuits`);
    unique(successful, `${path}.successfulCircuits`);
    successful.forEach((entry, circuitIndex) => {
      const circuit = object(entry, `${path}.successfulCircuits[${circuitIndex}]`);
      text(circuit.id, `${path}.successfulCircuits.id`); text(circuit.name, `${path}.successfulCircuits.name`);
      nullableText(circuit.slug, `${path}.successfulCircuits.slug`); boolean(circuit.isPublished, `${path}.successfulCircuits.isPublished`);
      integer(circuit.wins, `${path}.successfulCircuits.wins`, 1);
    });
    const history = list(row.seasonHistory, `${path}.seasonHistory`);
    unique(history, `${path}.seasonHistory`, 'season');
    let confirmedTitles = 0;
    history.forEach((entry, historyIndex) => {
      const historyPath = `${path}.seasonHistory[${historyIndex}]`;
      const standing = object(entry, historyPath);
      if (integer(standing.season, `${historyPath}.season`, 1950) > season) fail(`${historyPath}.season`);
      if (kind === 'drivers' && standing.position === null) {
        if (standing.standingAvailable !== false) fail(`${historyPath}.standingAvailable`);
      } else integer(standing.position, `${historyPath}.position`, 1);
      if (kind === 'drivers' && standing.standingAvailable !== undefined) boolean(standing.standingAvailable, `${historyPath}.standingAvailable`);
      if (kind === 'drivers' && standing.numbers !== undefined) {
        const numbers = list(standing.numbers, `${historyPath}.numbers`);
        for (const number of numbers) integer(number, `${historyPath}.numbers`);
        if (new Set(numbers).size !== numbers.length) fail(`${historyPath}.numbers: duplicate number`);
      }
      finite(standing.points, `${historyPath}.points`);
      integer(standing.wins, `${historyPath}.wins`); integer(standing.afterRound, `${historyPath}.afterRound`);
      boolean(standing.isFinal, `${historyPath}.isFinal`); text(standing.status, `${historyPath}.status`);
      if (standing.isFinal && standing.position === 1) confirmedTitles++;
      if (kind === 'teams') text(standing.name, `${historyPath}.name`);
      else {
        const teams = list(standing.teams, `${historyPath}.teams`);
        unique(teams, `${historyPath}.teams`);
        teams.forEach((team) => {
          const relationship = object(team, `${historyPath}.teams`);
          text(relationship.id, `${historyPath}.teams.id`); text(relationship.name, `${historyPath}.teams.name`);
          integer(relationship.raceEntries, `${historyPath}.teams.raceEntries`); finite(relationship.points, `${historyPath}.teams.points`);
        });
      }
    });
    if (titles !== confirmedTitles) fail(`${path}.careerTitles: not equal to final standings titles`);
    if (kind === 'drivers') {
      text(row.nameRu, `${path}.nameRu`); text(row.nameEn, `${path}.nameEn`); nullableText(row.code, `${path}.code`);
      if (row.number !== null) integer(row.number, `${path}.number`);
      if (row.permanentNumber !== undefined && row.permanentNumber !== null) integer(row.permanentNumber, `${path}.permanentNumber`);
      if (row.numberEntries !== undefined) {
        const entries = list(row.numberEntries, `${path}.numberEntries`);
        entries.forEach((entry, entryIndex) => {
          const entryPath = `${path}.numberEntries[${entryIndex}]`;
          const numberEntry = object(entry, entryPath);
          text(numberEntry.raceId, `${entryPath}.raceId`);
          integer(numberEntry.round, `${entryPath}.round`, 1);
          text(numberEntry.raceName, `${entryPath}.raceName`);
          integer(numberEntry.number, `${entryPath}.number`);
          if (!['permanent', 'season', 'event', 'champion', 'shared_car', 'unknown'].includes(text(numberEntry.numberType, `${entryPath}.numberType`))) fail(`${entryPath}.numberType`);
          if (!['imported', 'candidate', 'reviewed', 'verified', 'rejected'].includes(text(numberEntry.reviewStatus, `${entryPath}.reviewStatus`))) fail(`${entryPath}.reviewStatus`);
          if (numberEntry.team !== null) {
            const team = object(numberEntry.team, `${entryPath}.team`);
            text(team.id, `${entryPath}.team.id`);
            text(team.name, `${entryPath}.team.name`);
          }
        });
      }
      if (row.photoUrl !== undefined && row.photoUrl !== null && !/^(?:\/|https?:\/\/)/.test(text(row.photoUrl, `${path}.photoUrl`))) fail(`${path}.photoUrl`);
      if (row.nicknames !== undefined) {
        const nicknames = list(row.nicknames, `${path}.nicknames`);
        unique(nicknames, `${path}.nicknames`);
        nicknames.forEach((entry, nicknameIndex) => {
          const nicknamePath = `${path}.nicknames[${nicknameIndex}]`;
          const nickname = object(entry, nicknamePath);
          text(nickname.id, `${nicknamePath}.id`); text(nickname.nameRu, `${nicknamePath}.nameRu`);
          nullableText(nickname.nameOriginal, `${nicknamePath}.nameOriginal`); nullableText(nickname.contextRu, `${nicknamePath}.contextRu`);
          if (!/^https?:\/\//.test(text(nickname.sourceUrl, `${nicknamePath}.sourceUrl`))) fail(`${nicknamePath}.sourceUrl`);
          integer(nickname.sortOrder, `${nicknamePath}.sortOrder`);
        });
      }
      if (row.quotes !== undefined) {
        const quotes = list(row.quotes, `${path}.quotes`);
        unique(quotes, `${path}.quotes`);
        quotes.forEach((entry, quoteIndex) => {
          const quotePath = `${path}.quotes[${quoteIndex}]`;
          const quote = object(entry, quotePath);
          text(quote.id, `${quotePath}.id`); text(quote.quoteRu, `${quotePath}.quoteRu`);
          text(quote.attributionRu, `${quotePath}.attributionRu`); nullableText(quote.quoteOriginal, `${quotePath}.quoteOriginal`);
          nullableText(quote.contextRu, `${quotePath}.contextRu`);
          if (quote.quoteDate !== null) date(quote.quoteDate, `${quotePath}.quoteDate`);
          if (!/^https?:\/\//.test(text(quote.sourceUrl, `${quotePath}.sourceUrl`))) fail(`${quotePath}.sourceUrl`);
          integer(quote.sortOrder, `${quotePath}.sortOrder`);
        });
      }
      if (row.team !== null) {
        const team = object(row.team, `${path}.team`);
        text(team.id, `${path}.team.id`); text(team.name, `${path}.team.name`);
        nullableText(team.color, `${path}.team.color`); nullableText(team.logoUrl, `${path}.team.logoUrl`);
      }
    } else {
      text(row.name, `${path}.name`);
      for (const key of ['engineName', 'color', 'logoUrl', 'carModel', 'carImageUrl']) nullableText(row[key], `${path}.${key}`);
      const drivers = list(row.drivers, `${path}.drivers`);
      unique(drivers, `${path}.drivers`);
      if (integer(row.driverCount, `${path}.driverCount`) !== drivers.length) fail(`${path}.driverCount`);
      drivers.forEach((driver) => {
        const participant = object(driver, `${path}.drivers`);
        text(participant.id, `${path}.drivers.id`); text(participant.nameRu, `${path}.drivers.nameRu`); nullableText(participant.code, `${path}.drivers.code`);
        if (participant.position !== null) integer(participant.position, `${path}.drivers.position`, 1);
        finite(participant.points, `${path}.drivers.points`); finite(participant.teamPoints, `${path}.drivers.teamPoints`);
        integer(participant.raceEntries, `${path}.drivers.raceEntries`);
      });
    }
  });
}
