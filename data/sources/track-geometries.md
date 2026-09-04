# Геометрии трасс

Дата проверки: 26 августа 2026 года

## Локальный исходный набор

- исходный файл: `F1_v1/F1_v1/circuits.geojson`;
- количество объектов: 40;
- тип геометрии: `LineString`;
- трассы календаря 2024 года: 24 из 24;
- связь с календарём выполняется через поле `geometryId`.

Копия набора, используемая приложением, хранится в
`apps/web/app/data/circuits.json`. При выборе этапа атлас извлекает нужную
геометрию по `geometryId` и показывает контур после приближения.

## Ограничение публикации

Владелец проекта подтвердил, что контуры `circuits.json` оцифрованы
самостоятельно. В реестре они фиксируются как `user_digitized` с лицензией
`Provided by project owner`. Это относится к самой линии; длина, число
поворотов, период конфигурации и другие факты всё равно требуют отдельного
официального источника.
Для новых или исправленных контуров обязательно фиксировать источник, дату
получения, лицензию и способ обработки.

Если трасса меняла конфигурацию, периоды её использования фиксируются в
`circuitGeometryPeriods`. Атлас выбирает контур по сезону; неизвестный вариант
не подменяется современной схемой. Эти же периоды станут источником анимации
изменения трассы во вкладке «История»

Машиночитаемый отчёт о покрытии и происхождении геометрий создаётся командой
`node scripts/audit-track-geometry-coverage.mjs` и сохраняется в
`data/review/track-geometry-coverage.json`.

Геометрии актуального календаря переносятся в PostGIS командой:

```powershell
node --env-file=.env.database.local scripts/import-circuit-page-track-layouts.mjs --season=2026 --apply
```

## Дополнительный набор OpenStreetMap

26 августа 2026 года добавлен воспроизводимый импорт пятнадцати геометрий:

- Buddh International Circuit
- Korean International Circuit
- Okayama International Circuit
- Donington Park Grand Prix Circuit
- Circuito de Jerez Grand Prix Circuit
- Valencia Street Circuit
- Brands Hatch Grand Prix Circuit
- Fuji Speedway
- Circuito del Jarama
- Circuit Zolder
- Circuit Dijon-Prenois
- Anderstorp Raceway
- Mosport International Raceway
- Circuit de Montjuïc
- Circuit Mont-Tremblant

Файл приложения: `apps/web/app/data/circuits-openstreetmap.json`

Источник: OpenStreetMap contributors. Лицензия: ODbL 1.0. Скрипт импорта
`scripts/import-osm-track-geometries.mjs` сохраняет идентификаторы исходных
линий, проверяет замыкание контуров и сравнивает измеренную длину с известной
длиной конфигурации

## Историческая реконструкция Финикса

Контур Phoenix Street Circuit 1989–1990 восстановлен по опубликованной в
общественном достоянии схеме Wikimedia Commons и географически привязан к
указанным на ней улицам центра Финикса. Полученная длина центральной линии —
3 756 м при справочной длине конфигурации 3 798 м

Источник схемы:
`https://commons.wikimedia.org/wiki/File:Phoenix_Grand_Prix_Route_-_1989,_1990.svg`

## Исторические контуры OpenHistoricalMap

26 августа 2026 года добавлены две географически привязанные конфигурации:

- Riverside International Raceway Long Course 1957–1963 — используется для
  Гран-при США 1960 года, измеренная длина 5 255 м
- Sebring Second Circuit 1952–1966 — используется для Гран-при США 1959 года,
  измеренная длина 8 382 м
- Circuit Bremgarten 1931–1955 — используется для Гран-при Швейцарии
  1950–1954 годов, измеренная длина 7 216 м
- Reims-Gueux 1953 — отдельная конфигурация сезона 1953 года, 8 258 м
- Reims-Gueux 1954–1972 — используется для этапов 1954–1966 годов, 8 024 м

Источник: OpenHistoricalMap contributors. Лицензия: CC0 1.0. Исходные связи
`2660779` и `2687146`, а также исторические участки Бремгартена и Реймса
загружаются воспроизводимым импортом и собираются из упорядоченных участков
центральной линии
