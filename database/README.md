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
- `drivers`, `constructors`, `constructor_entries`, `constructor_lineage_links` —
  участники, сезонные названия команд и отдельно проверяемая преемственность
  идентичностей без автоматического объединения статистики;
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
- `circuit_page_map_settings`, `circuit_page_feature_flags`,
  `circuit_page_result_settings` — камера и туристический охват карты,
  доступные режимы и сезон результатов по умолчанию. Список сезонов трассы
  вычисляется из `races`, а не хранится массивом в редакционном JSON.

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

### Что такое миграция

Миграция — это пронумерованный SQL-файл, который последовательно изменяет
структуру базы данных: создаёт таблицу, добавляет колонку, индекс, ограничение
или представление. Это не копия базы и не набор данных конкретной трассы.

Например, `011_circuit_travel_editorial.sql` создаёт место для хранения
туристических сценариев у всех трасс. Сами значения для Спа и Бахрейна затем
загружаются отдельными идемпотентными seed-файлами из `database/seeds`.

Применённые миграции регистрируются в служебной таблице, поэтому повторный
запуск пропускает уже выполненные файлы. Новые миграции добавляются следующим
номером; ранее применённые файлы не переписываются, чтобы разные установки
проекта получали одинаковую схему.

Коротко:

- `migrations` — как устроена база;
- `seeds` — какие проверенные начальные данные в неё загрузить;
- `export-circuit-pages.mjs` — как собрать из базы JSON для веб-приложения;
- `audit-circuit-page-data.mjs` — как найти пропуски, данные без источников и
  проблемы с медиаматериалами.

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
node --env-file=.env.database.local scripts/apply-database-seed.mjs database/seeds/007_2026_circuit_page_drafts.sql --apply
node --env-file=.env.database.local scripts/apply-database-seed.mjs database/seeds/008_2026_circuit_facts_batch_01.sql --apply
node --env-file=.env.database.local scripts/apply-database-seed.mjs database/seeds/009_2026_circuit_facts_batch_02.sql --apply
node --env-file=.env.database.local scripts/apply-database-seed.mjs database/seeds/010_2026_circuit_facts_batch_03.sql --apply
node --env-file=.env.database.local scripts/apply-database-seed.mjs database/seeds/011_2026_circuit_facts_batch_04.sql --apply
node --env-file=.env.database.local scripts/apply-database-seed.mjs database/seeds/012_2026_circuit_facts_batch_05.sql --apply
node --env-file=.env.database.local scripts/apply-database-seed.mjs database/seeds/013_spa_event_access.sql --apply
node --env-file=.env.database.local scripts/apply-database-seed.mjs database/seeds/014_spa_route_presentations.sql --apply
node --env-file=.env.database.local scripts/apply-database-seed.mjs database/seeds/015_spa_parking_2027.sql --apply
node --env-file=.env.database.local scripts/apply-database-seed.mjs database/seeds/016_team_media_registry.sql --apply
node --env-file=.env.database.local scripts/apply-database-seed.mjs database/seeds/017_spa_current_layout_period.sql --apply
node --env-file=.env.database.local scripts/apply-database-seed.mjs database/seeds/018_2026_race_layout_assignments.sql --apply
node --env-file=.env.database.local scripts/apply-database-seed.mjs database/seeds/024_circuit_country_names_ru.sql --apply
node --env-file=.env.database.local scripts/export-circuit-pages.mjs
node --env-file=.env.database.local scripts/export-circuit-pages.mjs --check
node --env-file=.env.database.local scripts/export-circuit-catalog.mjs
node --env-file=.env.database.local scripts/export-competitor-catalogs.mjs
node --env-file=.env.database.local scripts/export-search-index.mjs
```

Файлы `apps/web/app/data/circuit-pages/spa.json` и `bahrain.json` остаются
read-model для сборки Next.js. Редактировать перенесённые поля вручную в них не
следует: экспортёр перезапишет их значениями из базы.

Покрытие профилей и качество источников проверяются отдельным аудитом:

```powershell
node --env-file=.env.database.local scripts/audit-circuit-page-data.mjs
node scripts/audit-circuit-catalog.mjs
node --env-file=.env.database.local scripts/audit-spa-travel-routes.mjs
node --env-file=.env.database.local scripts/audit-media-registry.mjs
node --env-file=.env.database.local scripts/audit-historical-layouts.mjs
node --env-file=.env.database.local scripts/import-runtime-track-layout-inventory.mjs
node --env-file=.env.database.local scripts/import-runtime-track-layout-inventory.mjs --apply
node --env-file=.env.database.local scripts/apply-database-seed.mjs database/seeds/021_historic_circuit_russian_names.sql --apply
node --env-file=.env.database.local scripts/localize-circuit-media.mjs --circuit spa --apply
```

Публичный туристический GeoJSON для одной трассы можно пересобрать вручную:

```powershell
node --env-file=.env.database.local scripts/export-circuit-travel.mjs --circuit spa
```

Без параметра `--circuit` экспортёр последовательно пересобирает туристические слои всех 78 трасс. В публичные файлы попадают только проверенные или опубликованные точки и зоны, а маршруты — только со статусом `published`.

Пакетный сбор до 80 туристических кандидатов для ещё не заполненных трасс запускается так:

```powershell
npm --prefix scripts run travel:import:bulk -- --apply --limit=80 --timeout=12
```

Команда сохраняет только кандидатов, пропускает Спа и другие уже полностью обработанные трассы и может безопасно запускаться повторно для дозаполнения не ответивших групп. Текущий прогресс записывается в `data/review/travel-bulk-import-progress.json`.

После основного прохода неполные группы можно запросить адресно, не повторяя уже успешные категории:

```powershell
npm --prefix scripts run travel:import:bulk -- --apply --limit=80 --timeout=35 --retry-incomplete
npm --prefix scripts run travel:audit:coverage
```

Первой командой выбираются трассы с пустыми, малочисленными или не ответившими группами. Вторая создаёт сводный отчёт `data/review/travel-coverage-audit.json` по всем 78 трассам.

Отчёт сохраняется в `data/review/circuit-page-data-audit.json`. Показатели без
`source_id` остаются видимым редакционным долгом, а не получают выдуманный
источник.

Миграция `010_circuit_page_runtime_settings.sql` переносит параметры камеры,
туристические границы, функциональные флаги и сезон результатов по умолчанию.
Экспортёр проверяет, что сезон по умолчанию действительно связан с этапом этой
трассы в таблице `races`.

Миграция `011_circuit_travel_editorial.sql` переносит вводный текст поездки,
редакционные примечания, полезную информацию, сценарии и представление районов
проживания. Геометрии POI, зон и проверенных маршрутов остаются в отдельных
PostGIS-таблицах и не дублируются в редакционном слое.

Миграция `012_draft_circuit_page_profiles.sql` разрешает оставлять геометрию,
описание и тип трассы пустыми у чернового профиля. Для статуса `published` эти
поля по-прежнему обязательны на уровне ограничения PostgreSQL. Это позволяет
создать очередь наполнения, не подменяя отсутствующие сведения догадками.

Миграция `013_track_layout_provenance.sql` добавляет к конфигурации тип
происхождения, редакционный статус и дату проверки. Самостоятельно
оцифрованные контуры календаря импортируются в `track_layouts` отдельным
скриптом и связываются с черновыми профилями, но не подменяют официальные
источники длины, поворотов и периода использования.

Миграция `014_circuit_page_field_sources.sql` хранит происхождение отдельно для
каждого заполненного поля чернового профиля: источник, статус редакционной
проверки, дату и примечание. Поэтому локализация, описание, тип и геометрия
могут иметь разные достоверные источники, не маскируясь одним `source_id` всей
строки. Аудит считает отсутствие такой связи ошибкой происхождения данных.

Миграция `015_travel_route_presentation.sql` хранит группу, порядок, цвет,
смещение и диапазон масштаба маршрута, а также предоставляет полную и две
упрощённые геометрии для карты. Эти параметры не меняют каноническую линию.

Миграция `016_draft_travel_zones.sql` разрешает кандидату парковочной или иной
туристической зоны временно не иметь геометрии. Для статусов `reviewed` и
`published` полигон остаётся обязательным. Так официальное название сезонной
парковки можно сохранить сразу, не рисуя приблизительную площадку по картинке.

Миграция `017_media_registry_governance.sql` добавляет роль медиа, происхождение,
статусы прав и редакционной проверки, область использования и таблицу
производных файлов. Проверенное или опубликованное медиа нельзя сохранить без
источника, автора, лицензии, alt-текста и даты проверки.

Seed `017_spa_current_layout_period.sql` фиксирует подтверждённую временную
границу современной конфигурации Спа: самостоятельно оцифрованный контур
7,004 км назначается только этапам 2007 года и позднее. Этапы 1950–2005 годов
намеренно остаются без `layout_id`, пока для их конфигураций не появятся
отдельные проверенные геометрии.

Seed `018_2026_race_layout_assignments.sql` связывает все этапы сезона 2026 с
единственной проверенной конфигурацией, импортированной именно для этого
сезона. Перед изменением он проверяет полноту и однозначность соответствий и
останавливается, если у этапа уже указана другая конфигурация.

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
