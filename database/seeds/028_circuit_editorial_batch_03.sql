BEGIN;

-- Редакционный пакет 03: показатели конфигураций и краткая история площадок.
-- Дата доступа ко всем источникам: 2026-09-20.
INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('formula1_catalunya_history', 'Formula 1 — Spain: Circuit de Barcelona-Catalunya',
     'https://www.formula1.com/en/information/spain-circuit-de-barcelona-catalunya-barcelona.6F5mWJGRuYkQ1XPX48pl8',
     'Official website', '2026-09-20T00:00:00Z',
     'Закладка трассы в 1989 году и первый этап Формулы-1 в 1991 году; уверенность высокая'),
    ('formula1_red_bull_ring_history', 'Formula 1 — Austria: Red Bull Ring',
     'https://www.formula1.com/en/information/red-bull-ring-spielberg.1s7EC2bGta7o1thZkVPbbq',
     'Official website', '2026-09-20T00:00:00Z',
     'Первый этап Формулы-1 на Остеррайхринге в 1970 году и перестройка трассы зимой 1995–1996 годов; уверенность высокая'),
    ('formula1_hungaroring_history', 'Formula 1 — Hungary: Hungaroring',
     'https://www.formula1.com/en/information/hungary-hungaroring-budapest.3Sz0BTKiIf7ov9bnezZ5dU',
     'Official website', '2026-09-20T00:00:00Z',
     'Начало строительства в 1985 году и первый этап Формулы-1 в 1986 году; уверенность высокая'),
    ('formula1_zandvoort_history', 'Formula 1 — Zandvoort destination guide',
     'https://www.formula1.com/en/latest/article/destination-guide-what-fans-can-eat-see-and-do-when-they-visit-zandvoort-for.5cvYcm9fuQ54aM0Ib8aXvU',
     'Official website', '2026-09-20T00:00:00Z',
     'Открытие трассы в 1948 году и первый этап чемпионата мира в 1952 году; уверенность высокая'),
    ('formula1_marina_bay_history', 'Formula 1 — Singapore: Marina Bay Street Circuit',
     'https://www.formula1.com/en/information/singapore-marina-baystreetcircuit.7LXNQUCHTyR5yMQPlIk7Lv',
     'Official website', '2026-09-20T00:00:00Z',
     'Первый Гран-при Сингапура на Marina Bay и первая ночная гонка Формулы-1 в 2008 году; уверенность высокая'),
    ('formula1_marina_bay_2023_layout', 'Formula 1 — Singapore revised track layout for 2023',
     'https://www.formula1.com/en/latest/article/singapore-grand-prix-set-to-feature-revised-track-layout-in-2023.6KsrU6hQw3hxrVJ6zKeJ74',
     'Official website', '2026-09-20T00:00:00Z',
     'Причина и состав изменения конфигурации 2023 года: прямая вместо поворотов 16–19 прежней схемы; уверенность высокая')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

-- Источники показателей заведены пакетами 009–011. Здесь фиксируются свежая
-- дата доступа и явная редакционная оценка уверенности.
UPDATE atlas.data_sources SET
    retrieved_at = '2026-09-20T00:00:00Z',
    notes = CASE id
        WHEN 'formula1_barcelona_2026_guide' THEN 'Параметры конфигурации без финальной шиканы и этапа 2026; уверенность высокая'
        WHEN 'formula1_red_bull_ring_2026_guide' THEN 'Параметры конфигурации и этапа 2026; уверенность высокая'
        WHEN 'formula1_hungaroring_2026_guide' THEN 'Параметры конфигурации и этапа 2026; уверенность высокая'
        WHEN 'formula1_zandvoort_2026_guide' THEN 'Параметры конфигурации и этапа 2026; уверенность высокая'
        WHEN 'formula1_singapore_2026' THEN 'Параметры укороченной конфигурации Marina Bay и этапа 2026; уверенность высокая'
    END
WHERE id IN (
    'formula1_barcelona_2026_guide', 'formula1_red_bull_ring_2026_guide',
    'formula1_hungaroring_2026_guide', 'formula1_zandvoort_2026_guide',
    'formula1_singapore_2026'
);

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('catalunya', 'red_bull_ring', 'hungaroring', 'zandvoort', 'marina_bay');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('catalunya', 'highlight', 1, '14 поворотов', NULL, NULL, NULL, 'formula1_barcelona_2026_guide'),
    ('catalunya', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_barcelona_2026_guide'),
    ('catalunya', 'metric', 1, 'Длина', '4,657 км', NULL, NULL, 'formula1_barcelona_2026_guide'),
    ('catalunya', 'metric', 2, 'Круги', '66', NULL, NULL, 'formula1_barcelona_2026_guide'),
    ('catalunya', 'metric', 3, 'Повороты', '14', NULL, NULL, 'formula1_barcelona_2026_guide'),
    ('catalunya', 'metric', 4, 'Дебют площадки в F1', '1991', NULL, NULL, 'formula1_barcelona_2026_guide'),
    ('catalunya', 'stat_bar', 1, 'Длина трассы', '4,657 км', NULL, 'length', 'formula1_barcelona_2026_guide'),
    ('catalunya', 'stat_bar', 2, 'Повороты', '14', NULL, 'turns', 'formula1_barcelona_2026_guide'),
    ('catalunya', 'stat_bar', 3, 'Дебют площадки в F1', '1991', NULL, 'debut', 'formula1_barcelona_2026_guide'),
    ('catalunya', 'stat_bar', 4, 'Рекорд круга F1', '1:15.743', 'Оскар Пиастри · 2025', 'record', 'formula1_barcelona_2026_guide'),
    ('catalunya', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_barcelona_2026_guide'),

    ('red_bull_ring', 'highlight', 1, '10 поворотов', NULL, NULL, NULL, 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'metric', 1, 'Длина', '4,326 км', NULL, NULL, 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'metric', 2, 'Круги', '71', NULL, NULL, 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'metric', 3, 'Повороты', '10', NULL, NULL, 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'metric', 4, 'Дебют площадки в F1', '1970', NULL, NULL, 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'stat_bar', 1, 'Длина трассы', '4,326 км', NULL, 'length', 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'stat_bar', 2, 'Повороты', '10', NULL, 'turns', 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'stat_bar', 3, 'Дебют площадки в F1', '1970', NULL, 'debut', 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'stat_bar', 4, 'Рекорд круга F1', '1:07.924', 'Оскар Пиастри · 2025', 'record', 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_red_bull_ring_2026_guide'),

    ('hungaroring', 'highlight', 1, '14 поворотов', NULL, NULL, NULL, 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'metric', 1, 'Длина', '4,381 км', NULL, NULL, 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'metric', 2, 'Круги', '70', NULL, NULL, 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'metric', 3, 'Повороты', '14', NULL, NULL, 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'metric', 4, 'Дебют площадки в F1', '1986', NULL, NULL, 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'stat_bar', 1, 'Длина трассы', '4,381 км', NULL, 'length', 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'stat_bar', 2, 'Повороты', '14', NULL, 'turns', 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'stat_bar', 3, 'Дебют площадки в F1', '1986', NULL, 'debut', 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'stat_bar', 4, 'Рекорд круга F1', '1:16.627', 'Льюис Хэмилтон · 2020', 'record', 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_hungaroring_2026_guide'),

    ('zandvoort', 'highlight', 1, '14 поворотов', NULL, NULL, NULL, 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'highlight', 2, 'Профилированные повороты', NULL, NULL, NULL, 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'highlight', 3, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'metric', 1, 'Длина', '4,259 км', NULL, NULL, 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'metric', 2, 'Круги', '72', NULL, NULL, 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'metric', 3, 'Повороты', '14', NULL, NULL, 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'metric', 4, 'Дебют площадки в F1', '1952', NULL, NULL, 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'stat_bar', 1, 'Длина трассы', '4,259 км', NULL, 'length', 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'stat_bar', 2, 'Повороты', '14', NULL, 'turns', 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'stat_bar', 3, 'Дебют площадки в F1', '1952', NULL, 'debut', 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'stat_bar', 4, 'Рекорд круга F1', '1:11.097', 'Льюис Хэмилтон · 2021', 'record', 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_zandvoort_2026_guide'),

    ('marina_bay', 'highlight', 1, '19 поворотов', NULL, NULL, NULL, 'formula1_singapore_2026'),
    ('marina_bay', 'highlight', 2, 'Городская трасса', NULL, NULL, NULL, 'formula1_singapore_2026'),
    ('marina_bay', 'metric', 1, 'Длина', '4,927 км', NULL, NULL, 'formula1_singapore_2026'),
    ('marina_bay', 'metric', 2, 'Круги', '62', NULL, NULL, 'formula1_singapore_2026'),
    ('marina_bay', 'metric', 3, 'Повороты', '19', NULL, NULL, 'formula1_singapore_2026'),
    ('marina_bay', 'metric', 4, 'Дебют площадки в F1', '2008', NULL, NULL, 'formula1_singapore_2026'),
    ('marina_bay', 'stat_bar', 1, 'Длина трассы', '4,927 км', NULL, 'length', 'formula1_singapore_2026'),
    ('marina_bay', 'stat_bar', 2, 'Повороты', '19', NULL, 'turns', 'formula1_singapore_2026'),
    ('marina_bay', 'stat_bar', 3, 'Дебют площадки в F1', '2008', NULL, 'debut', 'formula1_singapore_2026'),
    ('marina_bay', 'stat_bar', 4, 'Рекорд круга F1', '1:33.808', 'Льюис Хэмилтон · 2025', 'record', 'formula1_singapore_2026'),
    ('marina_bay', 'stat_bar', 5, 'Тип трассы', 'Городская', NULL, 'type', 'formula1_singapore_2026');

DELETE FROM atlas.circuit_history_entries
WHERE circuit_id IN ('catalunya', 'red_bull_ring', 'hungaroring', 'zandvoort', 'marina_bay');

INSERT INTO atlas.circuit_history_entries (
    id, circuit_id, sort_order, year_label, title_ru, description_ru,
    media_asset_id, source_id
) VALUES
    ('catalunya-1989', 'catalunya', 1, '1989', 'Закладка автодрома',
     'Первый камень трассы заложили в рамках программы развития к Олимпийским играм 1992 года в Барселоне',
     NULL, 'formula1_catalunya_history'),
    ('catalunya-1991', 'catalunya', 2, '1991', 'Первый этап Формулы-1',
     'Через две недели после первой автомобильной гонки автодром принял Гран-при Испании; победил Найджел Мэнселл',
     NULL, 'formula1_catalunya_history'),

    ('red-bull-ring-1970', 'red_bull_ring', 1, '1970', 'Первый этап на Остеррайхринге',
     'Остеррайхринг, созданный в 1969 году вместо аэродромного кольца Цельтвега, впервые принял Формулу-1',
     NULL, 'formula1_red_bull_ring_history'),
    ('red-bull-ring-1996', 'red_bull_ring', 2, '1995–1996', 'Перестройка в A1-Ring',
     'Зимой Герман Тильке сократил и модернизировал прежний Остеррайхринг; обновлённая трасса открылась в 1996 году',
     NULL, 'formula1_red_bull_ring_history'),

    ('hungaroring-1985', 'hungaroring', 1, '1985', 'Начало строительства',
     'Вместо обновления городского кольца Неплигет решили построить новый стационарный автодром, готовый менее чем за девять месяцев',
     NULL, 'formula1_hungaroring_history'),
    ('hungaroring-1986', 'hungaroring', 2, '1986', 'Первый этап Формулы-1',
     'Первую гонку чемпионата мира на Хунгароринге выиграл Нельсон Пике',
     NULL, 'formula1_hungaroring_history'),

    ('zandvoort-1948', 'zandvoort', 1, '1948', 'Открытие трассы',
     'Постоянные участки и общественные дороги объединили в кольцо среди дюн у Северного моря',
     NULL, 'formula1_zandvoort_history'),
    ('zandvoort-1952', 'zandvoort', 2, '1952', 'Первый этап чемпионата мира',
     'Альберто Аскари возглавил финиш Ferrari на первых трёх местах первого зачётного Гран-при в Зандворте',
     NULL, 'formula1_zandvoort_history'),

    ('marina-bay-2008', 'marina_bay', 1, '2008', 'Первая ночная гонка Формулы-1',
     'Городская трасса Marina Bay дебютировала в календаре как первый ночной этап чемпионата мира',
     NULL, 'formula1_marina_bay_history'),
    ('marina-bay-2023', 'marina_bay', 2, '2023', 'Укороченная конфигурация',
     'Из-за строительства комплекса NS Square прежние повороты 16–19 заменили одной прямой, сократив число поворотов с 23 до 19',
     NULL, 'formula1_marina_bay_2023_layout');

COMMIT;
