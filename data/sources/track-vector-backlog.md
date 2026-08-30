# Реестр недостающих векторов трасс

Дата проверки: 26 августа 2026 года

## Покрытие

- уникальных трасс в сезонных снимках 1950–2026: 78
- подключённых проверенных геометрий: 61
- недостающих геометрий: 17
- календарь 2026 года: покрыт полностью, включая Madring
- у 33 существующих трасс отсутствуют отдельные исторические конфигурации
- ближайшая рабочая очередь: 25 объектов — 21 конфигурация для 17 отсутствующих
  трасс и 4 обязательные конфигурации уже подключённых трасс
- полный музейный каталог дополнительно учитывает 96 исторических вариантов;
  это долгосрочный объём для раздела «История», а не текущий пакет

`apps/web/app/data/track-geometry-registry.ts` является единой таблицей связи
между идентификатором трассы в календаре и объектом GeoJSON. Контур считается
готовым только после проверки источника, лицензии, направления движения,
стартовой линии и периода использования конфигурации

Чтобы ускорить заполнение, новые контуры принимаются одним общим
`FeatureCollection`: каждая конфигурация хранится отдельной `Feature`, а не в
отдельном файле. Проверка пакета выполняется скриптом
`scripts/validate-track-geometry-batch.mjs`

Для трасс с заметными перестройками используется сезонный реестр периодов.
Например, конфигурация Фудзи 2005 года показывается для сезонов 2007–2008, а
контур Финикса 1989–1990 не подменяет изменённую трассу 1991 года

## Очередь 1 — поздние и современные трассы

| ID | Трасса | Сезоны Formula 1 |
|---|---|---:|
| `long_beach` | Long Beach | 1976–1983 |
| `las_vegas` | Las Vegas Street Circuit | 1981–1982 |
| `detroit` | Detroit Street Circuit | 1982–1988 |
| `dallas` | Fair Park | 1984 |
| `adelaide` | Adelaide Street Circuit | 1985–1995 |

## Добавлено из OpenStreetMap

| ID | Трасса | Геометрия | Проверка длины |
|---|---|---|---:|
| `buddh` | Buddh International Circuit | `in-2011` | 5 136 м |
| `yeongam` | Korean International Circuit | `kr-2010` | 5 596 м |
| `okayama` | Okayama International Circuit | `jp-1990` | 3 700 м |
| `donington` | Donington Park Grand Prix Circuit | `gb-1931-donington` | 3 995 м |
| `jerez` | Circuito de Jerez Grand Prix Circuit | `es-1985-jerez` | 4 426 м |
| `valencia` | Valencia Street Circuit | `es-2008-valencia` | 5 313 м |
| `brands_hatch` | Brands Hatch Grand Prix Circuit | `gb-1950-brands-hatch-gp` | 3 895 м |
| `fuji` | Fuji Speedway | `jp-2005-fuji` | 4 554 м |
| `jarama` | Circuito del Jarama | `es-1967-jarama` | 3 906 м |
| `zolder` | Circuit Zolder | `be-1963-zolder` | 4 001 м |
| `dijon` | Circuit Dijon-Prenois | `fr-1972-dijon` | 3 723 м |
| `anderstorp` | Anderstorp Raceway | `se-1968-anderstorp` | 4 017 м |
| `mosport` | Mosport International Raceway | `ca-1961-mosport` | 3 943 м |
| `montjuic` | Circuit de Montjuïc | `es-1933-montjuic` | 3 787 м |
| `tremblant` | Circuit Mont-Tremblant | `ca-1964-mont-tremblant` | 4 234 м |
| `george` | Prince George Circuit | `za-1934-prince-george` | 3 920 м |
| `bahrain` | Outer Circuit, Sakhir GP 2020 | `bh-2020-outer` | 3 562 м |
| `indianapolis` | Indianapolis Motor Speedway Oval 1950–1960 | `us-1909-indianapolis-oval` | 4 071 м |

Источник: OpenStreetMap contributors, лицензия ODbL 1.0. Контуры импортируются
воспроизводимым скриптом `scripts/import-osm-track-geometries.mjs`

## Добавлено по исторической схеме

| ID | Трасса | Геометрия | Проверка длины |
|---|---|---|---:|
| `phoenix` | Phoenix Street Circuit 1989–1990 | `us-1989-phoenix` | 3 756 м |

Схема Wikimedia Commons находится в общественном достоянии; контур привязан к
указанным на ней улицам центра Финикса

## Очередь 2 — классические трассы

| ID | Трасса | Сезоны Formula 1 |
|---|---|---:|
| `nivelles` | Nivelles-Baulers | 1972–1974 |
| `charade` | Charade Circuit | 1965–1972 |

## Очередь 3 — ранние и единичные конфигурации

| ID | Трасса | Сезоны Formula 1 |
|---|---|---:|
| `pedralbes` | Circuit de Pedralbes | 1951–1954 |
| `essarts` | Rouen-Les-Essarts | 1952–1968 |
| `aintree` | Aintree | 1955–1962 |
| `pescara` | Pescara Circuit | 1957 |
| `boavista` | Circuito da Boavista | 1958–1960 |
| `ain-diab` | Ain Diab | 1958 |
| `avus` | AVUS | 1959 |
| `monsanto` | Monsanto Park Circuit | 1959 |
| `zeltweg` | Zeltweg | 1964 |
| `lemans` | Le Mans | 1967 |

## Добавлено из OpenHistoricalMap

| ID | Трасса | Геометрия | Проверка длины |
|---|---|---|---:|
| `riverside` | Riverside Long Course 1957–1963 | `us-1957-riverside-long` | 5 255 м |
| `sebring` | Sebring Second Circuit 1952–1966 | `us-1952-sebring` | 8 382 м |
| `bremgarten` | Circuit Bremgarten 1931–1955 | `ch-1931-bremgarten` | 7 216 м |
| `reims` | Reims-Gueux 1953 | `fr-1953-reims` | 8 258 м |
| `reims` | Reims-Gueux 1954–1972 | `fr-1954-reims` | 8 024 м |

Источник: OpenHistoricalMap contributors, лицензия CC0 1.0. Для Formula 1
используются соответственно конфигурации Гран-при США 1960 года и Гран-при США
1959 года

Для Reims-Gueux пока не хватает исходной конфигурации 1950–1951 годов,
проходившей через деревню Гё. Контуры 1953 и 1954–1966 выбираются по сезону
автоматически

## Порядок приёмки одной геометрии

1. Зафиксировать первичный источник и лицензию
2. Сопоставить контур с конфигурацией нужного периода
3. Удалить лишние служебные и подъездные участки
4. Проверить направление движения и замыкание линии
5. Указать старт-финиш и, если доступны, номера поворотов
6. Проверить контур на карте и на мобильном экране
7. Добавить связь в `track-geometry-registry.ts`
