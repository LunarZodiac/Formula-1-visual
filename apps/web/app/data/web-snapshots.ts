import { season2024, type Circuit } from './season-2024';

export type SeasonIndexItem = {
  year: number;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  roundsPlanned: number | null;
  racesAvailable: number;
};

export type SeasonIndex = {
  exportedAt: string;
  seasons: SeasonIndexItem[];
};

export type SnapshotDriverStanding = {
  position: number;
  driverId: string;
  givenName: string;
  familyName: string;
  code: string | null;
  points: number;
  wins: number;
  constructorId: string | null;
  constructorName: string | null;
  teamColor: string | null;
};

export type SnapshotConstructorStanding = {
  position: number;
  constructorId: string;
  name: string;
  engineName: string | null;
  points: number;
  wins: number;
  teamColor: string | null;
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
  constructorId: string | null;
  constructorName: string | null;
  teamColor: string | null;
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
  temporary: 'Временная трасса',
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
      city: localized?.city ?? race.circuit.locality ?? 'Не указано',
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
