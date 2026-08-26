# Реестр недостающих векторов трасс

Дата проверки: 26 августа 2026 года

## Покрытие

- уникальных трасс в сезонных снимках 1950–2026: 78
- подключённых проверенных геометрий: 40
- недостающих геометрий: 38
- календарь 2026 года: покрыт полностью, включая Madring

`apps/web/app/data/track-geometry-registry.ts` является единой таблицей связи
между идентификатором трассы в календаре и объектом GeoJSON. Контур считается
готовым только после проверки источника, лицензии, направления движения,
стартовой линии и периода использования конфигурации

## Очередь 1 — поздние и современные трассы

| ID | Трасса | Сезоны Formula 1 |
|---|---|---:|
| `fuji` | Fuji Speedway | 1976–2008 |
| `long_beach` | Long Beach | 1976–1983 |
| `las_vegas` | Las Vegas Street Circuit | 1981–1982 |
| `detroit` | Detroit Street Circuit | 1982–1988 |
| `dallas` | Fair Park | 1984 |
| `adelaide` | Adelaide Street Circuit | 1985–1995 |
| `jerez` | Circuito de Jerez | 1986–1997 |
| `phoenix` | Phoenix street circuit | 1989–1991 |
| `donington` | Donington Park | 1993 |
| `okayama` | Okayama International Circuit | 1994–1995 |
| `valencia` | Valencia Street Circuit | 2008–2012 |
| `yeongam` | Korean International Circuit | 2010–2013 |
| `buddh` | Buddh International Circuit | 2011–2013 |

## Очередь 2 — классические трассы

| ID | Трасса | Сезоны Formula 1 |
|---|---|---:|
| `brands_hatch` | Brands Hatch | 1964–1986 |
| `jarama` | Jarama | 1968–1981 |
| `zolder` | Zolder | 1973–1984 |
| `dijon` | Dijon-Prenois | 1974–1984 |
| `anderstorp` | Scandinavian Raceway | 1973–1978 |
| `mosport` | Mosport International Raceway | 1967–1977 |
| `montjuic` | Montjuïc | 1969–1975 |
| `nivelles` | Nivelles-Baulers | 1972–1974 |
| `charade` | Charade Circuit | 1965–1972 |
| `tremblant` | Circuit Mont-Tremblant | 1968–1970 |

## Очередь 3 — ранние и единичные конфигурации

| ID | Трасса | Сезоны Formula 1 |
|---|---|---:|
| `bremgarten` | Circuit Bremgarten | 1950–1954 |
| `reims` | Reims-Gueux | 1950–1966 |
| `pedralbes` | Circuit de Pedralbes | 1951–1954 |
| `essarts` | Rouen-Les-Essarts | 1952–1968 |
| `aintree` | Aintree | 1955–1962 |
| `pescara` | Pescara Circuit | 1957 |
| `boavista` | Circuito da Boavista | 1958–1960 |
| `ain-diab` | Ain Diab | 1958 |
| `avus` | AVUS | 1959 |
| `monsanto` | Monsanto Park Circuit | 1959 |
| `sebring` | Sebring International Raceway | 1959 |
| `riverside` | Riverside International Raceway | 1960 |
| `george` | Prince George Circuit | 1962–1965 |
| `zeltweg` | Zeltweg | 1964 |
| `lemans` | Le Mans | 1967 |

## Порядок приёмки одной геометрии

1. Зафиксировать первичный источник и лицензию
2. Сопоставить контур с конфигурацией нужного периода
3. Удалить лишние служебные и подъездные участки
4. Проверить направление движения и замыкание линии
5. Указать старт-финиш и, если доступны, номера поворотов
6. Проверить контур на карте и на мобильном экране
7. Добавить связь в `track-geometry-registry.ts`
