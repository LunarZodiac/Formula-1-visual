import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(repositoryRoot, 'data/templates/f1-track-digitizing-worklist.geojson');

const tasks = [
  ['au-adelaide-1985', 'adelaide', 'Adelaide Street Circuit', 'Аделаида', 'Конфигурация Formula 1', '1985-1995', 1985, 1995, 138.617, -34.9272, 3780],
  ['ma-ain-diab-1958', 'ain-diab', 'Ain-Diab Circuit', 'Айн-Диаб', 'Конфигурация Formula 1', '1958', 1958, 1958, -7.6875, 33.5786, 7618],
  ['gb-aintree-1955', 'aintree', 'Aintree Motor Racing Circuit', 'Эйнтри', 'Конфигурация Formula 1', '1955, 1957, 1959, 1961-1962', 1955, 1962, -2.94056, 53.4769, 4828],
  ['de-avus-1959', 'avus', 'AVUS', 'АВУС', 'Конфигурация Formula 1', '1959', 1959, 1959, 13.2514, 52.4806, 8300],
  ['pt-boavista-1958', 'boavista', 'Circuito da Boavista', 'Боавишта', 'Конфигурация Formula 1', '1958, 1960', 1958, 1960, -8.67325, 41.1705, 7407],
  ['fr-charade-1965', 'charade', 'Charade Circuit', 'Шарада', 'Большое дорожное кольцо', '1965, 1969-1970, 1972', 1965, 1972, 3.03889, 45.7472, 8055],
  ['us-dallas-1984', 'dallas', 'Dallas Fair Park', 'Даллас, Фэйр-Парк', 'Конфигурация Formula 1', '1984', 1984, 1984, -96.7587, 32.7774, 3901],
  ['us-detroit-1982', 'detroit', 'Detroit Street Circuit', 'Детройт', 'Первоначальная конфигурация', '1982', 1982, 1982, -83.0401, 42.3298, 4012],
  ['us-detroit-1983', 'detroit', 'Detroit Street Circuit', 'Детройт', 'Изменённая конфигурация', '1983-1988', 1983, 1988, -83.0401, 42.3298, 4023],
  ['fr-rouen-1952', 'essarts', 'Rouen-Les-Essarts', 'Руан-Ле-Эссар', 'Короткая конфигурация', '1952', 1952, 1952, 1.00458, 49.3306, 5100],
  ['fr-rouen-1957', 'essarts', 'Rouen-Les-Essarts', 'Руан-Ле-Эссар', 'Большое дорожное кольцо', '1957, 1962, 1964, 1968', 1957, 1968, 1.00458, 49.3306, 6542],
  ['us-caesars-palace-1981', 'las_vegas', 'Caesars Palace Grand Prix Circuit', 'Сизарс-Пэлас', 'Конфигурация Formula 1', '1981-1982', 1981, 1982, -115.174, 36.1162, 3650],
  ['fr-bugatti-1967', 'lemans', 'Bugatti Circuit', 'Трасса Бугатти', 'Конфигурация Formula 1', '1967', 1967, 1967, 0.224231, 47.95, 4430],
  ['us-long-beach-1976', 'long_beach', 'Long Beach Street Circuit', 'Лонг-Бич', 'Первая конфигурация', '1976-1981', 1976, 1981, -118.189, 33.7651, 3251],
  ['us-long-beach-1982', 'long_beach', 'Long Beach Street Circuit', 'Лонг-Бич', 'Конфигурация 1982 года', '1982', 1982, 1982, -118.189, 33.7651, 3428],
  ['us-long-beach-1983', 'long_beach', 'Long Beach Street Circuit', 'Лонг-Бич', 'Конфигурация 1983 года', '1983', 1983, 1983, -118.189, 33.7651, 3275],
  ['pt-monsanto-1959', 'monsanto', 'Circuito de Monsanto', 'Монсанту', 'Конфигурация Formula 1', '1959', 1959, 1959, -9.20306, 38.7197, 5440],
  ['be-nivelles-1972', 'nivelles', 'Nivelles-Baulers', 'Нивель-Болер', 'Конфигурация Formula 1', '1972, 1974', 1972, 1974, 4.32694, 50.6211, 3724],
  ['es-pedralbes-1951', 'pedralbes', 'Pedralbes Circuit', 'Педральбес', 'Конфигурация Formula 1', '1951, 1954', 1951, 1954, 2.11667, 41.3903, 6316],
  ['it-pescara-1957', 'pescara', 'Pescara Circuit', 'Пескара', 'Конфигурация Formula 1', '1957', 1957, 1957, 14.1508, 42.475, 25979],
  ['at-zeltweg-1964', 'zeltweg', 'Zeltweg Airfield', 'Цельтвег', 'Конфигурация аэродрома', '1964', 1964, 1964, 14.7478, 47.2039, 3200],
  ['bh-bahrain-endurance-2010', 'bahrain', 'Bahrain International Circuit', 'Сахир', 'Endurance Circuit', '2010', 2010, 2010, 50.5106, 26.0325, 6299],
  ['jp-fuji-1976', 'fuji', 'Fuji Speedway', 'Фудзи', 'Историческая конфигурация Formula 1', '1976-1977', 1976, 1977, 138.927, 35.3717, 4359],
  ['us-phoenix-1991', 'phoenix', 'Phoenix Street Circuit', 'Финикс', 'Конфигурация 1991 года', '1991', 1991, 1991, -112.075, 33.4479, 3719],
  ['fr-reims-1950', 'reims', 'Reims-Gueux', 'Реймс-Гё', 'Исходная конфигурация через Гё', '1950-1951', 1950, 1951, 3.93083, 49.2542, 7815],
];

function placeholder(longitude, latitude) {
  const longitudeOffset = 0.00012 / Math.max(Math.cos(latitude * Math.PI / 180), 0.2);
  const latitudeOffset = 0.00008;
  return [
    [longitude - longitudeOffset, latitude - latitudeOffset],
    [longitude + longitudeOffset, latitude - latitudeOffset],
    [longitude, latitude + latitudeOffset],
    [longitude - longitudeOffset, latitude - latitudeOffset],
  ];
}

const features = tasks.map(([
  id, circuitId, name, nameRu, configuration, seasons,
  fromSeason, toSeason, longitude, latitude, expectedLength,
]) => ({
  type: 'Feature',
  properties: {
    id,
    circuitId,
    name,
    nameRu,
    configuration,
    seasons,
    fromSeason,
    toSeason,
    eventIds: [],
    expectedLength,
    direction: 'pending',
    source: 'pending',
    sourceUrl: '',
    license: 'pending',
    checkedAt: null,
    status: 'todo',
    placeholder: true,
    instructions: 'Замените маленький треугольник полным замкнутым контуром по центру трассы',
  },
  geometry: {
    type: 'LineString',
    coordinates: placeholder(longitude, latitude),
  },
}));

const collection = {
  type: 'FeatureCollection',
  name: 'f1-track-digitizing-worklist',
  crs: {
    type: 'name',
    properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
  },
  properties: {
    coordinateOrder: '[longitude, latitude]',
    geometryType: 'LineString',
    taskCount: features.length,
    instructions: 'Выберите объект по id и замените его маленькую линию полным замкнутым контуром. Атрибуты не изменяйте',
  },
  features,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');
console.log(`Подготовлено заданий: ${features.length}`);
console.log(outputPath);
