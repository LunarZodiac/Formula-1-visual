/**
 * Связывает идентификаторы трасс из сезонных снимков с проверенными
 * геометриями в circuits.json. Новые и исторические конфигурации добавляются
 * сюда только после проверки направления движения и периода использования.
 */
export const circuitGeometryRegistry = {
  yas_marina: 'ae-2009', galvez: 'ar-1952', red_bull_ring: 'at-1969', zeltweg: 'at-zeltweg-1964',
  adelaide: 'au-adelaide-1985', albert_park: 'au-1953', baku: 'az-2016', spa: 'be-1925',
  zolder: 'be-1963-zolder', nivelles: 'be-nivelles-1972', bahrain: 'bh-2002', interlagos: 'br-1940',
  jacarepagua: 'br-1977', villeneuve: 'ca-1978', mosport: 'ca-1961-mosport', tremblant: 'ca-1964-mont-tremblant',
  shanghai: 'cn-2004', bremgarten: 'ch-1931-bremgarten', nurburgring: 'de-1927', hockenheimring: 'de-1932',
  avus: 'de-avus-1959', catalunya: 'es-1991', jarama: 'es-1967-jarama', jerez: 'es-1985-jerez',
  valencia: 'es-2008-valencia', montjuic: 'es-1933-montjuic', madring: 'es-2026', pedralbes: 'es-pedralbes-1951',
  magny_cours: 'fr-1960', reims: 'fr-1954-reims', dijon: 'fr-1972-dijon', ricard: 'fr-1969',
  charade: 'fr-charade-1965', essarts: 'fr-rouen-1957', lemans: 'fr-bugatti-1967',
  brands_hatch: 'gb-1950-brands-hatch-gp', silverstone: 'gb-1948', donington: 'gb-1931-donington', aintree: 'gb-aintree-1955',
  hungaroring: 'hu-1986', buddh: 'in-2011', mugello: 'it-1914', monza: 'it-1922', imola: 'it-1953',
  pescara: 'it-pescara-1957', suzuka: 'jp-1962', fuji: 'jp-2005-fuji', okayama: 'jp-1990',
  yeongam: 'kr-2010', 'ain-diab': 'ma-ain-diab-1958', monaco: 'mc-1929', rodriguez: 'mx-1962',
  sepang: 'my-1999', zandvoort: 'nl-1948', estoril: 'pt-1972', portimao: 'pt-2008',
  boavista: 'pt-boavista-1958', monsanto: 'pt-monsanto-1959', losail: 'qa-2004', sochi: 'ru-2014',
  anderstorp: 'se-1968-anderstorp', george: 'za-1934-prince-george', jeddah: 'sa-2021', marina_bay: 'sg-2008',
  istanbul: 'tr-2005', indianapolis: 'us-1909', phoenix: 'us-1989-phoenix', riverside: 'us-1957-riverside-long',
  sebring: 'us-1952-sebring', watkins_glen: 'us-1956', americas: 'us-2012', miami: 'us-2022',
  vegas: 'us-2023', dallas: 'us-dallas-1984', detroit: 'us-detroit-1983', las_vegas: 'us-caesars-palace-1981',
  long_beach: 'us-long-beach-1983', kyalami: 'za-1961',
} as const;

export type RegisteredCircuitId = keyof typeof circuitGeometryRegistry;

export type CircuitGeometryPeriod = {
  geometryId: string;
  from: number;
  to: number;
  label: string;
  eventIds?: readonly string[];
};

/**
 * Периоды нужны трассам, чья конфигурация заметно менялась. Если сезон не
 * попадает ни в один известный период, контур не показывается как исторически
 * точный до добавления соответствующей геометрии.
 */
export const circuitGeometryPeriods: Partial<
  Record<RegisteredCircuitId, readonly CircuitGeometryPeriod[]>
> = {
  bahrain: [
    { geometryId: 'bh-2020-outer', from: 2020, to: 2020, label: 'Внешняя конфигурация', eventIds: ['2020-16'] },
    { geometryId: 'bh-2002', from: 2004, to: 2009, label: 'Конфигурация Гран-при' },
    { geometryId: 'bh-bahrain-endurance-2010', from: 2010, to: 2010, label: 'Конфигурация Endurance' },
    { geometryId: 'bh-2002', from: 2011, to: 2026, label: 'Конфигурация Гран-при' },
  ],
  detroit: [
    { geometryId: 'us-detroit-1982', from: 1982, to: 1982, label: 'Конфигурация 1982 года' },
    { geometryId: 'us-detroit-1983', from: 1983, to: 1988, label: 'Конфигурация 1983–1988 годов' },
  ],
  essarts: [
    { geometryId: 'fr-rouen-1952', from: 1952, to: 1952, label: 'Конфигурация 1952 года' },
    { geometryId: 'fr-rouen-1957', from: 1957, to: 1968, label: 'Конфигурация 1957–1968 годов' },
  ],
  fuji: [
    { geometryId: 'jp-fuji-1976', from: 1976, to: 1977, label: 'Историческая конфигурация' },
    { geometryId: 'jp-2005-fuji', from: 2007, to: 2008, label: 'Конфигурация 2005 года' },
  ],
  indianapolis: [
    { geometryId: 'us-1909-indianapolis-oval', from: 1950, to: 1960, label: 'Овал Indianapolis 500' },
    { geometryId: 'us-1909', from: 2000, to: 2007, label: 'Дорожная конфигурация Formula 1' },
  ],
  phoenix: [
    { geometryId: 'us-1989-phoenix', from: 1989, to: 1990, label: 'Конфигурация 1989–1990 годов' },
    { geometryId: 'us-phoenix-1991', from: 1991, to: 1991, label: 'Конфигурация 1991 года' },
  ],
  reims: [
    { geometryId: 'fr-reims-1950', from: 1950, to: 1951, label: 'Конфигурация 1950–1951 годов' },
    { geometryId: 'fr-1953-reims', from: 1953, to: 1953, label: 'Конфигурация 1953 года' },
    { geometryId: 'fr-1954-reims', from: 1954, to: 1966, label: 'Конфигурация 1954–1972 годов' },
  ],
  long_beach: [
    { geometryId: 'us-long-beach-1976', from: 1976, to: 1981, label: 'Конфигурация 1976–1981 годов' },
    { geometryId: 'us-long-beach-1982', from: 1982, to: 1982, label: 'Конфигурация 1982 года' },
    { geometryId: 'us-long-beach-1983', from: 1983, to: 1983, label: 'Конфигурация 1983 года' },
  ],
};

export function getCircuitGeometryId(circuitId: string, season?: number, eventId?: string) {
  const defaultGeometryId = circuitGeometryRegistry[circuitId as RegisteredCircuitId];
  if (!season) return defaultGeometryId;

  const periods = circuitGeometryPeriods[circuitId as RegisteredCircuitId];
  if (!periods) return defaultGeometryId;

  const seasonPeriods = periods.filter((period) => season >= period.from && season <= period.to);
  const eventPeriod = eventId
    ? seasonPeriods.find((period) => period.eventIds?.includes(eventId))
    : undefined;
  return eventPeriod?.geometryId
    ?? seasonPeriods.find((period) => !period.eventIds)?.geometryId;
}
