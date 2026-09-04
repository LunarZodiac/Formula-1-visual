import { season2024, type Circuit } from './season-2024';

export type SeasonIndexItem = {
  year: number;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  roundsPlanned: number | null;
  racesAvailable: number;
};

export type SeasonIndex = {
  exportedAt: string;
  sourceChangedAt?: string;
  seasons: SeasonIndexItem[];
};

export type SnapshotDriverStanding = {
  position: number;
  driverId: string;
  givenName: string;
  familyName: string;
  code: string | null;
  countryCode: string | null;
  points: number;
  wins: number;
  constructorId: string | null;
  constructorName: string | null;
  teamColor: string | null;
  teamLogoUrl: string | null;
};

export type SnapshotConstructorStanding = {
  position: number;
  constructorId: string;
  name: string;
  engineName: string | null;
  points: number;
  wins: number;
  teamColor: string | null;
  logoImageUrl: string | null;
  carModel: string | null;
  carImageUrl: string | null;
};

export type SnapshotSessionResult = {
  position: number;
  positionText: string;
  driverId: string;
  givenName: string;
  familyName: string;
  code: string | null;
  countryCode: string | null;
  constructorId: string | null;
  constructorName: string | null;
  teamColor: string | null;
  teamLogoUrl: string | null;
  points: number;
  laps: number | null;
  status: string | null;
  elapsedMs: number | null;
  gapMs: number | null;
  gapText: string | null;
  fastestLapRank: number | null;
  fastestLapNumber: number | null;
  fastestLapMs: number | null;
  details: {
    q1?: string | null;
    q2?: string | null;
    q3?: string | null;
    sq1?: string | null;
    sq2?: string | null;
    sq3?: string | null;
  };
};

export type SnapshotRaceResult = SnapshotSessionResult;

export type SeasonSnapshot = {
  exportedAt: string;
  sourceChangedAt?: string;
  season: number;
  calendar: Array<{
    id: string;
    round: number;
    name: string;
    date: string | null;
    status: 'scheduled' | 'live' | 'completed' | 'cancelled' | 'postponed';
    circuit: {
      id: string;
      name: string;
      shortName: string | null;
      locality: string | null;
      countryCode: string;
      type: 'permanent' | 'street' | 'hybrid' | 'temporary';
      coordinates: [number, number];
    };
  }>;
  standings: {
    drivers: SnapshotDriverStanding[];
    constructors: SnapshotConstructorStanding[];
  };
  raceResults?: Record<string, SnapshotRaceResult[]>;
  qualifyingResults?: Record<string, SnapshotSessionResult[]>;
  sprintQualifyingResults?: Record<string, SnapshotSessionResult[]>;
  sprintResults?: Record<string, SnapshotSessionResult[]>;
};

const seasonStatuses = new Set(['planned', 'active', 'completed', 'cancelled']);
const raceStatuses = new Set(['scheduled', 'live', 'completed', 'cancelled', 'postponed']);
const circuitKinds = new Set(['permanent', 'street', 'hybrid', 'temporary']);

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Некорректный snapshot: ${path} должен быть объектом`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Некорректный snapshot: ${path} должен быть массивом`);
  return value;
}

function string(value: unknown, path: string) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Некорректный snapshot: ${path} должен быть строкой`);
}

function number(value: unknown, path: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Некорректный snapshot: ${path} должен быть числом`);
}

export function parseSeasonIndex(value: unknown): SeasonIndex {
  const root = record(value, 'index');
  string(root.exportedAt, 'index.exportedAt');
  if (root.sourceChangedAt !== undefined) string(root.sourceChangedAt, 'index.sourceChangedAt');
  const seasons = array(root.seasons, 'index.seasons');
  seasons.forEach((item, index) => {
    const season = record(item, `index.seasons[${index}]`);
    number(season.year, `index.seasons[${index}].year`);
    if (!seasonStatuses.has(String(season.status))) throw new Error(`Некорректный snapshot: неизвестный статус сезона ${season.status}`);
    if (season.roundsPlanned !== null) number(season.roundsPlanned, `index.seasons[${index}].roundsPlanned`);
    number(season.racesAvailable, `index.seasons[${index}].racesAvailable`);
  });
  return value as SeasonIndex;
}

export function parseSeasonSnapshot(value: unknown, expectedSeason?: number): SeasonSnapshot {
  const root = record(value, 'season');
  string(root.exportedAt, 'season.exportedAt');
  if (root.sourceChangedAt !== undefined) string(root.sourceChangedAt, 'season.sourceChangedAt');
  number(root.season, 'season.season');
  if (expectedSeason !== undefined && root.season !== expectedSeason) {
    throw new Error(`Некорректный snapshot: ожидался сезон ${expectedSeason}, получен ${root.season}`);
  }

  const rounds = new Set<number>();
  array(root.calendar, 'season.calendar').forEach((item, index) => {
    const race = record(item, `season.calendar[${index}]`);
    string(race.id, `season.calendar[${index}].id`);
    number(race.round, `season.calendar[${index}].round`);
    if (rounds.has(race.round as number)) throw new Error(`Некорректный snapshot: повтор этапа ${race.round}`);
    rounds.add(race.round as number);
    string(race.name, `season.calendar[${index}].name`);
    if (!raceStatuses.has(String(race.status))) throw new Error(`Некорректный snapshot: неизвестный статус этапа ${race.status}`);
    const circuit = record(race.circuit, `season.calendar[${index}].circuit`);
    string(circuit.id, `season.calendar[${index}].circuit.id`);
    string(circuit.name, `season.calendar[${index}].circuit.name`);
    string(circuit.countryCode, `season.calendar[${index}].circuit.countryCode`);
    if (!circuitKinds.has(String(circuit.type))) throw new Error(`Некорректный snapshot: неизвестный тип трассы ${circuit.type}`);
    const coordinates = array(circuit.coordinates, `season.calendar[${index}].circuit.coordinates`);
    if (coordinates.length !== 2) throw new Error(`Некорректный snapshot: координаты трассы ${circuit.id} должны содержать два числа`);
    coordinates.forEach((coordinate, coordinateIndex) => number(coordinate, `season.calendar[${index}].circuit.coordinates[${coordinateIndex}]`));
  });

  const standings = record(root.standings, 'season.standings');
  array(standings.drivers, 'season.standings.drivers');
  array(standings.constructors, 'season.standings.constructors').forEach((item, index) => {
    const constructor = record(item, `season.standings.constructors[${index}]`);
    string(constructor.constructorId, `season.standings.constructors[${index}].constructorId`);
    string(constructor.name, `season.standings.constructors[${index}].name`);
    if (constructor.logoImageUrl !== null) string(constructor.logoImageUrl, `season.standings.constructors[${index}].logoImageUrl`);
    if (constructor.carImageUrl !== null) string(constructor.carImageUrl, `season.standings.constructors[${index}].carImageUrl`);
  });

  for (const key of ['raceResults', 'qualifyingResults', 'sprintQualifyingResults', 'sprintResults']) {
    if (root[key] === undefined) continue;
    const sessions = record(root[key], `season.${key}`);
    Object.entries(sessions).forEach(([round, results]) => array(results, `season.${key}.${round}`));
  }
  return value as SeasonSnapshot;
}

const countryNames = new Intl.DisplayNames(['ru'], { type: 'region' });
const localizedCircuits = new Map(season2024.map((circuit) => [circuit.id, circuit]));

const circuitNamesRu: Record<string, string> = {
  adelaide: 'Аделаида',
  'ain-diab': 'Айн-Диаб',
  aintree: 'Эйнтри',
  albert_park: 'Альберт-Парк',
  americas: 'Трасса Америк',
  anderstorp: 'Андерсторп',
  avus: 'АФУС',
  bahrain: 'Бахрейн',
  baku: 'Баку',
  boavista: 'Боавишта',
  brands_hatch: 'Брэндс-Хэтч',
  bremgarten: 'Бремгартен',
  buddh: 'Будда',
  catalunya: 'Барселона-Каталунья',
  charade: 'Шарад',
  dallas: 'Даллас',
  detroit: 'Детройт',
  dijon: 'Дижон-Пренуа',
  donington: 'Донингтон-Парк',
  essarts: 'Руан-Лез-Эссар',
  estoril: 'Эшторил',
  fuji: 'Фудзи',
  galvez: 'Оскар и Хуан Гальвес',
  george: 'Принс-Джордж',
  hockenheimring: 'Хоккенхаймринг',
  hungaroring: 'Хунгароринг',
  imola: 'Имола',
  indianapolis: 'Индианаполис',
  interlagos: 'Интерлагос',
  istanbul: 'Истанбул-Парк',
  jacarepagua: 'Жакарепагуа',
  jarama: 'Харама',
  jeddah: 'Джидда',
  jerez: 'Херес',
  kyalami: 'Кьялами',
  las_vegas: 'Лас-Вегас',
  lemans: 'Ле-Ман',
  long_beach: 'Лонг-Бич',
  losail: 'Лусаил',
  madring: 'Мадринг',
  magny_cours: 'Маньи-Кур',
  marina_bay: 'Марина-Бей',
  miami: 'Майами',
  monaco: 'Монако',
  monsanto: 'Монсанту',
  montjuic: 'Монжуик',
  monza: 'Монца',
  mosport: 'Моспорт',
  mugello: 'Муджелло',
  nivelles: 'Нивель-Болер',
  nurburgring: 'Нюрбургринг',
  okayama: 'Окаяма',
  pedralbes: 'Педральбес',
  pescara: 'Пескара',
  phoenix: 'Финикс',
  portimao: 'Алгарве',
  red_bull_ring: 'Ред Булл Ринг',
  reims: 'Реймс-Гу',
  ricard: 'Поль-Рикар',
  riverside: 'Риверсайд',
  rodriguez: 'Эрманос Родригес',
  sebring: 'Себринг',
  sepang: 'Сепанг',
  shanghai: 'Шанхай',
  silverstone: 'Сильверстоун',
  sochi: 'Сочи Автодром',
  spa: 'Спа-Франкоршам',
  suzuka: 'Сузука',
  tremblant: 'Мон-Тремблан',
  valencia: 'Валенсия',
  vegas: 'Лас-Вегас',
  villeneuve: 'Жиль Вильнёв',
  watkins_glen: 'Уоткинс-Глен',
  yas_marina: 'Яс-Марина',
  yeongam: 'Йонам',
  zandvoort: 'Зандворт',
  zeltweg: 'Цельтвег',
  zolder: 'Золдер',
};

const circuitTypes: Record<SeasonSnapshot['calendar'][number]['circuit']['type'], string> = {
  permanent: 'Стационарная трасса',
  street: 'Городская трасса',
  hybrid: 'Смешанная трасса',
  temporary: 'Смешанная трасса',
};

const circuitLocalitiesRu: Record<string, string> = {
  madring: 'Мадрид',
  sepang: 'Куала-Лумпур',
};

export function snapshotToCircuits(snapshot: SeasonSnapshot): Circuit[] {
  return snapshot.calendar.map((race) => {
    const localized = localizedCircuits.get(race.circuit.id);
    return {
      id: race.circuit.id,
      geometryId: localized?.geometryId ?? race.circuit.id,
      order: race.round,
      raceName: race.name,
      name: localized?.name ?? circuitNamesRu[race.circuit.id] ?? race.circuit.shortName ?? race.circuit.name,
      officialName: localized?.officialName ?? race.circuit.name,
      city: localized?.city ?? circuitLocalitiesRu[race.circuit.id] ?? race.circuit.locality ?? 'Не указано',
      country: localized?.country
        ?? countryNames.of(race.circuit.countryCode)
        ?? race.circuit.countryCode,
      date: race.date ?? '',
      type: localized?.type ?? circuitTypes[race.circuit.type],
      status: race.status,
      coordinates: race.circuit.coordinates,
    };
  });
}
