export type Circuit = {
  id: string;
  geometryId: string;
  order: number;
  raceName: string;
  name: string;
  officialName: string;
  city: string;
  country: string;
  date: string;
  type: string;
  coordinates: [number, number];
};

export const season2024: Circuit[] = [
  {
    id: 'bahrain', geometryId: 'bh-2002', order: 1,
    raceName: 'Bahrain Grand Prix', name: 'Бахрейн',
    officialName: 'Bahrain International Circuit', city: 'Сахир',
    country: 'Бахрейн', date: '2024-03-02', type: 'Стационарная трасса',
    coordinates: [50.5106, 26.0325],
  },
  {
    id: 'jeddah', geometryId: 'sa-2021', order: 2,
    raceName: 'Saudi Arabian Grand Prix', name: 'Джидда',
    officialName: 'Jeddah Corniche Circuit', city: 'Джидда',
    country: 'Саудовская Аравия', date: '2024-03-09', type: 'Городская трасса',
    coordinates: [39.1044, 21.6319],
  },
  {
    id: 'albert_park', geometryId: 'au-1953', order: 3,
    raceName: 'Australian Grand Prix', name: 'Альберт-Парк',
    officialName: 'Albert Park Grand Prix Circuit', city: 'Мельбурн',
    country: 'Австралия', date: '2024-03-24', type: 'Смешанная трасса',
    coordinates: [144.968, -37.8497],
  },
  {
    id: 'suzuka', geometryId: 'jp-1962', order: 4,
    raceName: 'Japanese Grand Prix', name: 'Сузука',
    officialName: 'Suzuka Circuit', city: 'Сузука',
    country: 'Япония', date: '2024-04-07', type: 'Стационарная трасса',
    coordinates: [136.541, 34.8431],
  },
  {
    id: 'shanghai', geometryId: 'cn-2004', order: 5,
    raceName: 'Chinese Grand Prix', name: 'Шанхай',
    officialName: 'Shanghai International Circuit', city: 'Шанхай',
    country: 'Китай', date: '2024-04-21', type: 'Стационарная трасса',
    coordinates: [121.22, 31.3389],
  },
  {
    id: 'miami', geometryId: 'us-2022', order: 6,
    raceName: 'Miami Grand Prix', name: 'Майами',
    officialName: 'Miami International Autodrome', city: 'Майами',
    country: 'США', date: '2024-05-05', type: 'Смешанная трасса',
    coordinates: [-80.2389, 25.9581],
  },
  {
    id: 'imola', geometryId: 'it-1953', order: 7,
    raceName: 'Emilia Romagna Grand Prix', name: 'Имола',
    officialName: 'Autodromo Enzo e Dino Ferrari', city: 'Имола',
    country: 'Италия', date: '2024-05-19', type: 'Стационарная трасса',
    coordinates: [11.7167, 44.3439],
  },
  {
    id: 'monaco', geometryId: 'mc-1929', order: 8,
    raceName: 'Monaco Grand Prix', name: 'Монако',
    officialName: 'Circuit de Monaco', city: 'Монте-Карло',
    country: 'Монако', date: '2024-05-26', type: 'Городская трасса',
    coordinates: [7.42056, 43.7347],
  },
  {
    id: 'villeneuve', geometryId: 'ca-1978', order: 9,
    raceName: 'Canadian Grand Prix', name: 'Жиль Вильнёв',
    officialName: 'Circuit Gilles Villeneuve', city: 'Монреаль',
    country: 'Канада', date: '2024-06-09', type: 'Смешанная трасса',
    coordinates: [-73.5228, 45.5],
  },
  {
    id: 'catalunya', geometryId: 'es-1991', order: 10,
    raceName: 'Spanish Grand Prix', name: 'Барселона-Каталунья',
    officialName: 'Circuit de Barcelona-Catalunya', city: 'Монтмело',
    country: 'Испания', date: '2024-06-23', type: 'Стационарная трасса',
    coordinates: [2.26111, 41.57],
  },
  {
    id: 'red_bull_ring', geometryId: 'at-1969', order: 11,
    raceName: 'Austrian Grand Prix', name: 'Ред Булл Ринг',
    officialName: 'Red Bull Ring', city: 'Шпильберг',
    country: 'Австрия', date: '2024-06-30', type: 'Стационарная трасса',
    coordinates: [14.7647, 47.2197],
  },
  {
    id: 'silverstone', geometryId: 'gb-1948', order: 12,
    raceName: 'British Grand Prix', name: 'Сильверстоун',
    officialName: 'Silverstone Circuit', city: 'Сильверстоун',
    country: 'Великобритания', date: '2024-07-07', type: 'Стационарная трасса',
    coordinates: [-1.01694, 52.0786],
  },
  {
    id: 'hungaroring', geometryId: 'hu-1986', order: 13,
    raceName: 'Hungarian Grand Prix', name: 'Хунгароринг',
    officialName: 'Hungaroring', city: 'Будапешт',
    country: 'Венгрия', date: '2024-07-21', type: 'Стационарная трасса',
    coordinates: [19.2486, 47.5789],
  },
  {
    id: 'spa', geometryId: 'be-1925', order: 14,
    raceName: 'Belgian Grand Prix', name: 'Спа-Франкоршам',
    officialName: 'Circuit de Spa-Francorchamps', city: 'Спа',
    country: 'Бельгия', date: '2024-07-28', type: 'Стационарная трасса',
    coordinates: [5.97139, 50.4372],
  },
  {
    id: 'zandvoort', geometryId: 'nl-1948', order: 15,
    raceName: 'Dutch Grand Prix', name: 'Зандворт',
    officialName: 'Circuit Park Zandvoort', city: 'Зандворт',
    country: 'Нидерланды', date: '2024-08-25', type: 'Стационарная трасса',
    coordinates: [4.54092, 52.3888],
  },
  {
    id: 'monza', geometryId: 'it-1922', order: 16,
    raceName: 'Italian Grand Prix', name: 'Монца',
    officialName: 'Autodromo Nazionale di Monza', city: 'Монца',
    country: 'Италия', date: '2024-09-01', type: 'Стационарная трасса',
    coordinates: [9.28111, 45.6156],
  },
  {
    id: 'baku', geometryId: 'az-2016', order: 17,
    raceName: 'Azerbaijan Grand Prix', name: 'Баку',
    officialName: 'Baku City Circuit', city: 'Баку',
    country: 'Азербайджан', date: '2024-09-15', type: 'Городская трасса',
    coordinates: [49.8533, 40.3725],
  },
  {
    id: 'marina_bay', geometryId: 'sg-2008', order: 18,
    raceName: 'Singapore Grand Prix', name: 'Марина-Бей',
    officialName: 'Marina Bay Street Circuit', city: 'Сингапур',
    country: 'Сингапур', date: '2024-09-22', type: 'Городская трасса',
    coordinates: [103.864, 1.2914],
  },
  {
    id: 'americas', geometryId: 'us-2012', order: 19,
    raceName: 'United States Grand Prix', name: 'Трасса Америк',
    officialName: 'Circuit of the Americas', city: 'Остин',
    country: 'США', date: '2024-10-20', type: 'Стационарная трасса',
    coordinates: [-97.6411, 30.1328],
  },
  {
    id: 'rodriguez', geometryId: 'mx-1962', order: 20,
    raceName: 'Mexico City Grand Prix', name: 'Эрманос Родригес',
    officialName: 'Autódromo Hermanos Rodríguez', city: 'Мехико',
    country: 'Мексика', date: '2024-10-27', type: 'Стационарная трасса',
    coordinates: [-99.0907, 19.4042],
  },
  {
    id: 'interlagos', geometryId: 'br-1940', order: 21,
    raceName: 'São Paulo Grand Prix', name: 'Интерлагос',
    officialName: 'Autódromo José Carlos Pace', city: 'Сан-Паулу',
    country: 'Бразилия', date: '2024-11-03', type: 'Стационарная трасса',
    coordinates: [-46.6997, -23.7036],
  },
  {
    id: 'vegas', geometryId: 'us-2023', order: 22,
    raceName: 'Las Vegas Grand Prix', name: 'Лас-Вегас',
    officialName: 'Las Vegas Strip Street Circuit', city: 'Лас-Вегас',
    country: 'США', date: '2024-11-23', type: 'Городская трасса',
    coordinates: [-115.173, 36.1147],
  },
  {
    id: 'losail', geometryId: 'qa-2004', order: 23,
    raceName: 'Qatar Grand Prix', name: 'Лусаил',
    officialName: 'Losail International Circuit', city: 'Эд-Даайен',
    country: 'Катар', date: '2024-12-01', type: 'Стационарная трасса',
    coordinates: [51.4542, 25.49],
  },
  {
    id: 'yas_marina', geometryId: 'ae-2009', order: 24,
    raceName: 'Abu Dhabi Grand Prix', name: 'Яс-Марина',
    officialName: 'Yas Marina Circuit', city: 'Абу-Даби',
    country: 'ОАЭ', date: '2024-12-08', type: 'Смешанная трасса',
    coordinates: [54.6031, 24.4672],
  },
];
