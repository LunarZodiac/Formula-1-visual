BEGIN;

-- Редакционный пакет 01: проверяемые показатели современной конфигурации
-- и краткая история площадок. Дата доступа ко всем источникам: 2026-09-19.
INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('monza_official_history', 'Autodromo Nazionale Monza — History',
     'https://www.monzanet.it/en/history/',
     'Official circuit website', '2026-09-19T00:00:00Z',
     'История автодрома: строительство за 110 дней и открытие 3 сентября 1922 года; уверенность высокая'),
    ('formula1_monza_history', 'Formula 1 — Italy: Autodromo Nazionale Monza',
     'https://www.formula1.com/en/information/italy-autodromo-nazionalemonza.FiJN1jnQlRLeHqOxIt13m',
     'Official website', '2026-09-19T00:00:00Z',
     'История этапа: участие Монцы в первом сезоне чемпионата мира; уверенность высокая'),
    ('silverstone_official_history', 'Silverstone — Our History',
     'https://www.silverstone.co.uk/about/our-history',
     'Official circuit website', '2026-09-19T00:00:00Z',
     'История площадки: первый Гран-при Великобритании на бывшей базе RAF 2 октября 1948 года; уверенность высокая'),
    ('silverstone_official_grand_prix_history', 'Silverstone — 75 years of F1 at Silverstone',
     'https://www.silverstone.co.uk/news/75-years-f1-silverstone-drives-generation',
     'Official circuit website', '2026-09-19T00:00:00Z',
     'История этапа: первая гонка чемпионата мира Формулы-1 13 мая 1950 года; уверенность высокая'),
    ('acm_monaco_history', 'Automobile Club de Monaco — History',
     'https://acm.mc/en/automobile-club/the-club/lautomobile-club-de-monaco/history/',
     'Official organiser website', '2026-09-19T00:00:00Z',
     'История этапа: открытие трассы первого Гран-при Монако 14 апреля 1929 года; уверенность высокая'),
    ('formula1_monaco_history', 'Formula 1 — Monaco: Circuit de Monaco',
     'https://www.formula1.com/en/information/monaco-circuit-de-monaco-monte-carlo.2ZWRtIcSI6ZzVGX1uGRpkJ',
     'Official website', '2026-09-19T00:00:00Z',
     'История этапа: первая гонка в 1929 году и участие в первом сезоне чемпионата мира; уверенность высокая'),
    ('formula1_suzuka_history', 'Formula 1 — Japan: Suzuka International Racing Course',
     'https://www.formula1.com/en/information/japan-suzuka-international-racing-course.2XjOiKgIHRRBVVpp5N3S5t',
     'Official website', '2026-09-19T00:00:00Z',
     'История трассы: открытие испытательной трассы Honda в 1962 году и первый этап чемпионата мира в 1987 году; уверенность высокая'),
    ('interlagos_prefeitura_history', 'Prefeitura de Sao Paulo — Historia do Autodromo de Interlagos',
     'https://autodromodeinterlagos.prefeitura.sp.gov.br/historia',
     'Official municipal website', '2026-09-19T00:00:00Z',
     'История автодрома: открытие 12 мая 1940 года и первый зачётный Гран-при Формулы-1 11 февраля 1973 года; уверенность высокая')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

-- Источники показателей заведены предыдущими пакетами 008–012. Здесь дата
-- доступа и оценка уверенности фиксируются повторно для автономного аудита seed.
UPDATE atlas.data_sources SET
    retrieved_at = '2026-09-19T00:00:00Z',
    notes = CASE id
        WHEN 'formula1_monza_2026' THEN 'Параметры этапа и современной конфигурации 2026; уверенность высокая'
        WHEN 'fia_monza_2025_map' THEN 'Официальная карта FIA 2025 с нумерацией 11 поворотов; относится только к конфигурации 2025 года; уверенность высокая'
        WHEN 'formula1_silverstone_2026_guide' THEN 'Параметры конфигурации и этапа 2026; уверенность высокая'
        WHEN 'formula1_monaco_2026_guide' THEN 'Параметры конфигурации и этапа 2026; уверенность высокая'
        WHEN 'formula1_suzuka_2026_guide' THEN 'Параметры конфигурации и этапа 2026; уверенность высокая'
        WHEN 'formula1_interlagos_2026' THEN 'Параметры конфигурации и этапа 2026; уверенность высокая'
        WHEN 'formula1_interlagos_turns' THEN 'Число поворотов для этапа 2025; относится только к конфигурации 2025 года; уверенность высокая'
    END
WHERE id IN (
    'formula1_monza_2026', 'fia_monza_2025_map',
    'formula1_silverstone_2026_guide', 'formula1_monaco_2026_guide',
    'formula1_suzuka_2026_guide', 'formula1_interlagos_2026',
    'formula1_interlagos_turns'
);

-- Показатели уже подтверждены официальными материалами сезона 2026 и картой FIA.
-- Повторная загрузка оставляет для каждой трассы один детерминированный набор строк.
DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('monza', 'silverstone', 'monaco', 'suzuka', 'interlagos');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('monza', 'highlight', 1, '11 поворотов', NULL, NULL, NULL, 'fia_monza_2025_map'),
    ('monza', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_monza_2026'),
    ('monza', 'metric', 1, 'Длина', '5,793 км', NULL, NULL, 'formula1_monza_2026'),
    ('monza', 'metric', 2, 'Круги', '53', NULL, NULL, 'formula1_monza_2026'),
    ('monza', 'metric', 3, 'Повороты', '11', NULL, NULL, 'fia_monza_2025_map'),
    ('monza', 'metric', 4, 'Дебют', '1950', NULL, NULL, 'formula1_monza_2026'),
    ('monza', 'stat_bar', 1, 'Длина трассы', '5,793 км', NULL, 'length', 'formula1_monza_2026'),
    ('monza', 'stat_bar', 2, 'Повороты', '11', NULL, 'turns', 'fia_monza_2025_map'),
    ('monza', 'stat_bar', 3, 'Дебют в F1', '1950', NULL, 'debut', 'formula1_monza_2026'),
    ('monza', 'stat_bar', 4, 'Рекорд круга F1', '1:20.901', 'Ландо Норрис · 2025', 'record', 'formula1_monza_2026'),
    ('monza', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_monza_2026'),

    ('silverstone', 'highlight', 1, '18 поворотов', NULL, NULL, NULL, 'formula1_silverstone_2026_guide'),
    ('silverstone', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_silverstone_2026_guide'),
    ('silverstone', 'metric', 1, 'Длина', '5,891 км', NULL, NULL, 'formula1_silverstone_2026_guide'),
    ('silverstone', 'metric', 2, 'Круги', '52', NULL, NULL, 'formula1_silverstone_2026_guide'),
    ('silverstone', 'metric', 3, 'Повороты', '18', NULL, NULL, 'formula1_silverstone_2026_guide'),
    ('silverstone', 'metric', 4, 'Дебют', '1950', NULL, NULL, 'formula1_silverstone_2026_guide'),
    ('silverstone', 'stat_bar', 1, 'Длина трассы', '5,891 км', NULL, 'length', 'formula1_silverstone_2026_guide'),
    ('silverstone', 'stat_bar', 2, 'Повороты', '18', NULL, 'turns', 'formula1_silverstone_2026_guide'),
    ('silverstone', 'stat_bar', 3, 'Дебют в F1', '1950', NULL, 'debut', 'formula1_silverstone_2026_guide'),
    ('silverstone', 'stat_bar', 4, 'Рекорд круга F1', '1:27.097', 'Макс Ферстаппен · 2020', 'record', 'formula1_silverstone_2026_guide'),
    ('silverstone', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_silverstone_2026_guide'),

    ('monaco', 'highlight', 1, '19 поворотов', NULL, NULL, NULL, 'formula1_monaco_2026_guide'),
    ('monaco', 'highlight', 2, 'Городская трасса', NULL, NULL, NULL, 'formula1_monaco_2026_guide'),
    ('monaco', 'metric', 1, 'Длина', '3,337 км', NULL, NULL, 'formula1_monaco_2026_guide'),
    ('monaco', 'metric', 2, 'Круги', '78', NULL, NULL, 'formula1_monaco_2026_guide'),
    ('monaco', 'metric', 3, 'Повороты', '19', NULL, NULL, 'formula1_monaco_2026_guide'),
    ('monaco', 'metric', 4, 'Дебют', '1950', NULL, NULL, 'formula1_monaco_2026_guide'),
    ('monaco', 'stat_bar', 1, 'Длина трассы', '3,337 км', NULL, 'length', 'formula1_monaco_2026_guide'),
    ('monaco', 'stat_bar', 2, 'Повороты', '19', NULL, 'turns', 'formula1_monaco_2026_guide'),
    ('monaco', 'stat_bar', 3, 'Дебют в F1', '1950', NULL, 'debut', 'formula1_monaco_2026_guide'),
    ('monaco', 'stat_bar', 4, 'Рекорд круга F1', '1:12.909', 'Льюис Хэмилтон · 2021', 'record', 'formula1_monaco_2026_guide'),
    ('monaco', 'stat_bar', 5, 'Тип трассы', 'Городская', NULL, 'type', 'formula1_monaco_2026_guide'),

    ('suzuka', 'highlight', 1, '18 поворотов', NULL, NULL, NULL, 'formula1_suzuka_2026_guide'),
    ('suzuka', 'highlight', 2, 'Конфигурация «восьмёрка»', NULL, NULL, NULL, 'formula1_suzuka_2026_guide'),
    ('suzuka', 'highlight', 3, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_suzuka_2026_guide'),
    ('suzuka', 'metric', 1, 'Длина', '5,807 км', NULL, NULL, 'formula1_suzuka_2026_guide'),
    ('suzuka', 'metric', 2, 'Круги', '53', NULL, NULL, 'formula1_suzuka_2026_guide'),
    ('suzuka', 'metric', 3, 'Повороты', '18', NULL, NULL, 'formula1_suzuka_2026_guide'),
    ('suzuka', 'metric', 4, 'Дебют', '1987', NULL, NULL, 'formula1_suzuka_2026_guide'),
    ('suzuka', 'stat_bar', 1, 'Длина трассы', '5,807 км', NULL, 'length', 'formula1_suzuka_2026_guide'),
    ('suzuka', 'stat_bar', 2, 'Повороты', '18', NULL, 'turns', 'formula1_suzuka_2026_guide'),
    ('suzuka', 'stat_bar', 3, 'Дебют в F1', '1987', NULL, 'debut', 'formula1_suzuka_2026_guide'),
    ('suzuka', 'stat_bar', 4, 'Рекорд круга F1', '1:30.965', 'Кими Антонелли · 2025', 'record', 'formula1_suzuka_2026_guide'),
    ('suzuka', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_suzuka_2026_guide'),

    ('interlagos', 'highlight', 1, '15 поворотов', NULL, NULL, NULL, 'formula1_interlagos_turns'),
    ('interlagos', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_interlagos_2026'),
    ('interlagos', 'metric', 1, 'Длина', '4,309 км', NULL, NULL, 'formula1_interlagos_2026'),
    ('interlagos', 'metric', 2, 'Круги', '71', NULL, NULL, 'formula1_interlagos_2026'),
    ('interlagos', 'metric', 3, 'Повороты', '15', NULL, NULL, 'formula1_interlagos_turns'),
    ('interlagos', 'metric', 4, 'Дебют', '1973', NULL, NULL, 'formula1_interlagos_2026'),
    ('interlagos', 'stat_bar', 1, 'Длина трассы', '4,309 км', NULL, 'length', 'formula1_interlagos_2026'),
    ('interlagos', 'stat_bar', 2, 'Повороты', '15', NULL, 'turns', 'formula1_interlagos_turns'),
    ('interlagos', 'stat_bar', 3, 'Дебют в F1', '1973', NULL, 'debut', 'formula1_interlagos_2026'),
    ('interlagos', 'stat_bar', 4, 'Рекорд круга F1', '1:10.540', 'Валттери Боттас · 2018', 'record', 'formula1_interlagos_2026'),
    ('interlagos', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_interlagos_2026');

DELETE FROM atlas.circuit_history_entries
WHERE circuit_id IN ('monza', 'silverstone', 'monaco', 'suzuka', 'interlagos');

INSERT INTO atlas.circuit_history_entries (
    id, circuit_id, sort_order, year_label, title_ru, description_ru,
    media_asset_id, source_id
) VALUES
    ('monza-1922', 'monza', 1, '1922', 'Открытие автодрома',
     'Автодром построили за 110 дней и открыли 3 сентября — за неделю до Гран-при Италии',
     NULL, 'monza_official_history'),
    ('monza-1950', 'monza', 2, '1950', 'Первый сезон чемпионата мира',
     'Монца вошла в календарь первого чемпионата мира Формулы-1 и приняла Гран-при Италии',
     NULL, 'formula1_monza_history'),

    ('silverstone-1948', 'silverstone', 1, '2 октября 1948', 'Первый Гран-при Великобритании',
     'Королевский автомобильный клуб провёл первую гонку Гран-при на бывшей базе RAF; победил Луиджи Виллорези',
     NULL, 'silverstone_official_history'),
    ('silverstone-1950', 'silverstone', 2, '13 мая 1950', 'Старт чемпионата мира',
     'Сильверстоун принял первый этап чемпионата мира Формулы-1',
     NULL, 'silverstone_official_grand_prix_history'),

    ('monaco-1929', 'monaco', 1, '1929', 'Первый Гран-при Монако',
     'По инициативе Антони Ноге и Автомобильного клуба Монако в княжестве впервые провели автомобильную гонку',
     NULL, 'acm_monaco_history'),
    ('monaco-1950', 'monaco', 2, '1950', 'В первом календаре Формулы-1',
     'Гран-при Монако стал одним из этапов первого сезона чемпионата мира Формулы-1',
     NULL, 'formula1_monaco_history'),

    ('suzuka-1962', 'suzuka', 1, '1962', 'Испытательная трасса Honda',
     'По решению Соитиро Хонды открылась испытательная трасса с проектом Джона Хугенхольца и характерным пересечением уровней',
     NULL, 'formula1_suzuka_history'),
    ('suzuka-1987', 'suzuka', 2, '1987', 'Дебют в чемпионате мира',
     'Сузука впервые приняла этап Формулы-1; авария Найджела Мэнселла в квалификации досрочно принесла титул Нельсону Пике',
     NULL, 'formula1_suzuka_history'),

    ('interlagos-1940', 'interlagos', 1, '12 мая 1940', 'Открытие Интерлагоса',
     'Автодром открыли мотоциклетной гонкой и Гран-при Сан-Паулу при 15 тысячах зрителей',
     NULL, 'interlagos_prefeitura_history'),
    ('interlagos-1973', 'interlagos', 2, '11 февраля 1973', 'Первый зачётный Гран-при Формулы-1',
     'Первый бразильский этап чемпионата мира на Интерлагосе выиграл Эмерсон Фиттипальди',
     NULL, 'interlagos_prefeitura_history');

COMMIT;
