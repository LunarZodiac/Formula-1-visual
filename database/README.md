# PostgreSQL + PostGIS

База данных станет источником истины для исторических, спортивных и
пространственных данных атласа. Веб-приложение пока продолжает читать JSON и
GeoJSON: они будут формироваться импортёром как проверенные снимки базы.

## Почему схема разделяет трассу и конфигурацию

`circuits` описывает географическое место и автодром, а `track_layouts` —
конкретную конфигурацию в определённые годы. Это позволяет корректно показывать
исторические изменения трасс, не перезаписывая современную геометрию.

## Основные группы таблиц

- `seasons`, `races` — календарь с 1950 года;
- `drivers`, `constructors`, `constructor_entries` — участники и сезонные
  названия команд;
- `sessions`, `session_results`, `*_standings` — практики, квалификации,
  спринты, гонки и спортивные результаты;
- `circuits`, `track_layouts`, `track_features` — картографическая основа;
- `tourism_pois`, `circuit_pois` — туристические объекты;
- `circuit_travel_profiles`, `circuit_travel_pois`, `travel_zones`,
  `travel_routes`, `travel_route_stops` — транспорт, размещение,
  достопримечательности и редакционные маршруты этапа;
- `circuit_travel_candidate_queue`, `circuit_travel_recommended_pois` —
  полный рейтинг кандидатов и сбалансированная выборка для редактора;
- `buildings` — контуры, высоты и ссылки на детальные 3D-модели;
- `data_sources`, `media_assets`, `external_identifiers` — происхождение,
  лицензии и связь с внешними API.
- `circuit_page_profiles`, `circuit_page_stats`, `circuit_history_entries`,
  `circuit_media_gallery` — редакционный профиль универсальной страницы трассы,
  её показатели, история и упорядоченная медиатека.

## Пространственная загрузка зданий

Здания выбираются по расстоянию от линии конфигурации, а не от одной точки
трассы. Рекомендуемые начальные пределы:

- городская трасса: 500–800 м от центральной линии;
- стационарная или смешанная: 1,5–2 км;
- туристические POI: 5 км, важные транспортные объекты — отдельной выборкой.

На клиент передаются только объекты внутри текущей области карты. Массовые
контуры отображаются экструзией MapLibre, а `model_url` используется только для
единичных ключевых объектов. В дальнейшем данные следует отдавать векторными
тайлами, а не одним большим GeoJSON.

Пример пространственного фильтра:

```sql
SELECT b.*
FROM atlas.buildings AS b
JOIN atlas.track_layouts AS l ON l.id = 'bahrain-grand-prix-2024'
WHERE ST_DWithin(
    b.footprint::geography,
    l.centerline::geography,
    2000
);
```

## Миграции

Миграция `007_web_query_indexes_and_geometry_lods.sql` добавляет индексы для страниц трасс и туристического редактора, а также view `atlas.track_layout_web_geometries` с полной геометрией и вариантами, упрощёнными в проекции Web Mercator на 25 и 150 метров. Канонический `centerline` при этом не изменяется.

Миграция `008_web_export_freshness.sql` добавляет автоматическое обновление
`updated_at` и view `atlas.web_export_freshness`. Экспортёр записывает его
значение в `sourceChangedAt` и не перечитывает из БД сезоны, источник которых
не менялся. После применения миграции один полный экспорт обновит метаданные
существующих снимков; следующие запуски будут выборочными.

Миграция `009_circuit_page_editorial.sql` выносит Hero, stat bar, исторические
вехи и медиатеку из ручного registry в нормализованные таблицы. Начальные данные
Спа загружаются идемпотентным seed-файлом, после чего JSON страницы собирается
из PostgreSQL:

```powershell
node --env-file=.env.database.local scripts/apply-database-seed.mjs database/seeds/005_spa_circuit_page.sql --apply
node --env-file=.env.database.local scripts/apply-database-seed.mjs database/seeds/006_bahrain_circuit_page.sql --apply
node --env-file=.env.database.local scripts/export-circuit-pages.mjs
node --env-file=.env.database.local scripts/export-circuit-pages.mjs --check
```

Файлы `apps/web/app/data/circuit-pages/spa.json` и `bahrain.json` остаются
read-model для сборки Next.js. Редактировать перенесённые поля вручную в них не
следует: экспортёр перезапишет их значениями из базы.

Покрытие профилей и качество источников проверяются отдельным аудитом:

```powershell
node --env-file=.env.database.local scripts/audit-circuit-page-data.mjs
```

Отчёт сохраняется в `data/review/circuit-page-data-audit.json`. Показатели без
`source_id` остаются видимым редакционным долгом, а не получают выдуманный
источник.

Первая миграция находится в
`database/migrations/001_initial_postgis_schema.sql`. Она рассчитана на
PostgreSQL с установленным расширением PostGIS.

Для уже настроенного проекта миграции запускаются последовательно через скрипт:

```powershell
node --env-file=.env.database.local scripts/apply-database-migrations.mjs --apply
```

Если первая миграция ранее была выполнена вручную через pgAdmin, скрипт распознаёт
существующую схему и регистрирует её как начальную точку. Пароли и строки
подключения нельзя сохранять в Git.

Миграция `003_travel_geography.sql` добавляет расширенную туристическую модель.
Рабочий ориентир для одного этапа — 40–60 проверенных точек, 3–6 зон проживания
и 4–8 маршрутов. Автоматически найденные объекты сохраняются кандидатами и не
публикуются без редакционной проверки.

## Как посмотреть туристическую базу

Для визуальной проверки без SQL сформируйте единый редакционный GeoJSON:

```powershell
node --env-file=.env.database.local scripts/export-spa-travel-review.mjs
```

Файл `data/review/spa-travel-review.geojson` открывается в QGIS обычным
векторным слоем. В нём вместе находятся рекомендованные точки, районы
проживания и маршруты. Районы не входят в лимит 60 POI: внутри них отдельной
связью перечислены гостиницы, включая пять приоритетных примеров.
