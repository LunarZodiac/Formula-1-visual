BEGIN;

-- Редакционный пакет 02: показатели конфигураций и краткая история площадок.
-- Дата доступа ко всем источникам: 2026-09-20.
INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('formula1_americas_history', 'Formula 1 — United States: Circuit of The Americas',
     'https://www.formula1.com/en/information/united-states-circuit-of-the-americas-austin.5RpZ6us0a3FoaoRxTMpbxI',
     'Official website', '2026-09-20T00:00:00Z',
     'Открытие трассы 21 октября 2012 года и первый этап Формулы-1 в Остине; уверенность высокая'),
    ('formula1_imola_2025', 'Formula 1 — Emilia-Romagna Grand Prix 2025',
     'https://www.formula1.com/en/racing/2025/emiliaromagna',
     'Official website', '2026-09-20T00:00:00Z',
     'Параметры конфигурации 2025 и история автодрома: закладка в 1950 году, начало гонок в 1953 году; уверенность высокая'),
    ('formula1_imola_history', 'Formula 1 — Imola circuit guide',
     'https://www.formula1.com/en/latest/article/imola-all-you-need-to-know-about-the-returning-italian-circuit.6ZtC4Qfqy4WKcUi3rgaDhD',
     'Official website', '2026-09-20T00:00:00Z',
     'Первый незачётный старт Формулы-1 в 1963 году и первый зачётный Гран-при в 1980 году; уверенность высокая'),
    ('formula1_jeddah_2025', 'Formula 1 — Saudi Arabian Grand Prix 2025',
     'https://www.formula1.com/en/racing/2025/saudi-arabia',
     'Official website', '2026-09-20T00:00:00Z',
     'Параметры конфигурации 2025 и первый Гран-при Саудовской Аравии в 2021 году; уверенность высокая'),
    ('formula1_jeddah_design_history', 'Formula 1 — How the Jeddah street track was designed',
     'https://www.formula1.com/en/latest/article/exclusive-the-inside-story-on-how-the-worlds-fastest-street-track-was.6YxLwaGrdFVsvLkgfyNZoi',
     'Official website', '2026-09-20T00:00:00Z',
     'Выбор площадки на Корнише после официального визита в январе 2020 года и совместная разработка трассы; уверенность высокая'),
    ('formula1_yas_marina_history', 'Formula 1 — Abu Dhabi: Yas Marina Circuit',
     'https://www.formula1.com/en/information/abu-dhabi-yas-marina-circuit-yas-island.4YtOtpaWvaxWvDBTItP7s6',
     'Official website', '2026-09-20T00:00:00Z',
     'Планы 2006 года, завершение строительства в октябре 2009 года и первый Гран-при в 2009 году; уверенность высокая'),
    ('formula1_yas_marina_first_gp', 'Formula 1 — I was there for the first Abu Dhabi Grand Prix',
     'https://www.formula1.com/en/latest/article/i-was-there-for-the-very-first-abu-dhabi-gp.5mMuK2M5fs5pMWkpH4nnnK',
     'Official website', '2026-09-20T00:00:00Z',
     'Первый Гран-при Абу-Даби 1 ноября 2009 года; уверенность высокая')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

-- Источники показателей, созданные пакетами 008 и 012, получают свежую дату
-- доступа и явную редакционную оценку уверенности.
UPDATE atlas.data_sources SET
    retrieved_at = '2026-09-20T00:00:00Z',
    notes = CASE id
        WHEN 'formula1_albert_park_2026_guide' THEN 'Параметры конфигурации и этапа 2026, а также история площадки; уверенность высокая'
        WHEN 'formula1_americas_2026' THEN 'Параметры Circuit of The Americas для этапа 2026; уверенность высокая'
        WHEN 'formula1_americas_turns' THEN 'Официальное подтверждение 20 поворотов; уверенность высокая'
        WHEN 'formula1_yas_marina_2026' THEN 'Параметры Yas Marina Circuit для этапа 2026; уверенность высокая'
        WHEN 'fia_yas_marina_2025_map' THEN 'Официальная карта FIA 2025 с поворотами 1–16; относится только к конфигурации 2025 года; уверенность высокая'
    END
WHERE id IN (
    'formula1_albert_park_2026_guide', 'formula1_americas_2026',
    'formula1_americas_turns', 'formula1_yas_marina_2026',
    'fia_yas_marina_2025_map'
);

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('albert_park', 'americas', 'imola', 'jeddah', 'yas_marina');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('albert_park', 'highlight', 1, '14 поворотов', NULL, NULL, NULL, 'formula1_albert_park_2026_guide'),
    ('albert_park', 'highlight', 2, 'Временная трасса', NULL, NULL, NULL, 'formula1_albert_park_2026_guide'),
    ('albert_park', 'metric', 1, 'Длина', '5,278 км', NULL, NULL, 'formula1_albert_park_2026_guide'),
    ('albert_park', 'metric', 2, 'Круги', '58', NULL, NULL, 'formula1_albert_park_2026_guide'),
    ('albert_park', 'metric', 3, 'Повороты', '14', NULL, NULL, 'formula1_albert_park_2026_guide'),
    ('albert_park', 'metric', 4, 'Дебют площадки в F1', '1996', NULL, NULL, 'formula1_albert_park_2026_guide'),
    ('albert_park', 'stat_bar', 1, 'Длина трассы', '5,278 км', NULL, 'length', 'formula1_albert_park_2026_guide'),
    ('albert_park', 'stat_bar', 2, 'Повороты', '14', NULL, 'turns', 'formula1_albert_park_2026_guide'),
    ('albert_park', 'stat_bar', 3, 'Дебют площадки в F1', '1996', NULL, 'debut', 'formula1_albert_park_2026_guide'),
    ('albert_park', 'stat_bar', 4, 'Рекорд круга F1', '1:19.813', 'Шарль Леклер · 2024', 'record', 'formula1_albert_park_2026_guide'),
    ('albert_park', 'stat_bar', 5, 'Тип трассы', 'Временная', NULL, 'type', 'formula1_albert_park_2026_guide'),

    ('americas', 'highlight', 1, '20 поворотов', NULL, NULL, NULL, 'formula1_americas_turns'),
    ('americas', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_americas_2026'),
    ('americas', 'metric', 1, 'Длина', '5,513 км', NULL, NULL, 'formula1_americas_2026'),
    ('americas', 'metric', 2, 'Круги', '56', NULL, NULL, 'formula1_americas_2026'),
    ('americas', 'metric', 3, 'Повороты', '20', NULL, NULL, 'formula1_americas_turns'),
    ('americas', 'metric', 4, 'Дебют площадки в F1', '2012', NULL, NULL, 'formula1_americas_2026'),
    ('americas', 'stat_bar', 1, 'Длина трассы', '5,513 км', NULL, 'length', 'formula1_americas_2026'),
    ('americas', 'stat_bar', 2, 'Повороты', '20', NULL, 'turns', 'formula1_americas_turns'),
    ('americas', 'stat_bar', 3, 'Дебют площадки в F1', '2012', NULL, 'debut', 'formula1_americas_2026'),
    ('americas', 'stat_bar', 4, 'Рекорд круга F1', '1:36.169', 'Шарль Леклер · 2019', 'record', 'formula1_americas_2026'),
    ('americas', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_americas_2026'),

    ('imola', 'highlight', 1, 'Против часовой стрелки', NULL, NULL, NULL, 'formula1_imola_history'),
    ('imola', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_imola_2025'),
    ('imola', 'metric', 1, 'Длина', '4,909 км', NULL, NULL, 'formula1_imola_2025'),
    ('imola', 'metric', 2, 'Круги', '63', NULL, NULL, 'formula1_imola_2025'),
    ('imola', 'metric', 3, 'Дебют площадки в F1', '1980', NULL, NULL, 'formula1_imola_2025'),
    ('imola', 'stat_bar', 1, 'Длина трассы', '4,909 км', NULL, 'length', 'formula1_imola_2025'),
    ('imola', 'stat_bar', 2, 'Дебют площадки в F1', '1980', NULL, 'debut', 'formula1_imola_2025'),
    ('imola', 'stat_bar', 3, 'Рекорд круга F1', '1:15.484', 'Льюис Хэмилтон · 2020', 'record', 'formula1_imola_2025'),
    ('imola', 'stat_bar', 4, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_imola_2025'),

    ('jeddah', 'highlight', 1, '27 поворотов', NULL, NULL, NULL, 'formula1_jeddah_2025'),
    ('jeddah', 'highlight', 2, 'Городская трасса', NULL, NULL, NULL, 'formula1_jeddah_2025'),
    ('jeddah', 'metric', 1, 'Длина', '6,174 км', NULL, NULL, 'formula1_jeddah_2025'),
    ('jeddah', 'metric', 2, 'Круги', '50', NULL, NULL, 'formula1_jeddah_2025'),
    ('jeddah', 'metric', 3, 'Повороты', '27', NULL, NULL, 'formula1_jeddah_2025'),
    ('jeddah', 'metric', 4, 'Дебют площадки в F1', '2021', NULL, NULL, 'formula1_jeddah_2025'),
    ('jeddah', 'stat_bar', 1, 'Длина трассы', '6,174 км', NULL, 'length', 'formula1_jeddah_2025'),
    ('jeddah', 'stat_bar', 2, 'Повороты', '27', NULL, 'turns', 'formula1_jeddah_2025'),
    ('jeddah', 'stat_bar', 3, 'Дебют площадки в F1', '2021', NULL, 'debut', 'formula1_jeddah_2025'),
    ('jeddah', 'stat_bar', 4, 'Рекорд круга F1', '1:30.734', 'Льюис Хэмилтон · 2021', 'record', 'formula1_jeddah_2025'),
    ('jeddah', 'stat_bar', 5, 'Тип трассы', 'Городская', 'Временная трасса с постоянными участками', 'type', 'formula1_jeddah_2025'),

    ('yas_marina', 'highlight', 1, '16 поворотов · 2025', NULL, NULL, NULL, 'fia_yas_marina_2025_map'),
    ('yas_marina', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_yas_marina_2026'),
    ('yas_marina', 'metric', 1, 'Длина', '5,281 км', NULL, NULL, 'formula1_yas_marina_2026'),
    ('yas_marina', 'metric', 2, 'Круги', '58', NULL, NULL, 'formula1_yas_marina_2026'),
    ('yas_marina', 'metric', 3, 'Повороты (2025)', '16', NULL, NULL, 'fia_yas_marina_2025_map'),
    ('yas_marina', 'metric', 4, 'Дебют площадки в F1', '2009', NULL, NULL, 'formula1_yas_marina_2026'),
    ('yas_marina', 'stat_bar', 1, 'Длина трассы', '5,281 км', NULL, 'length', 'formula1_yas_marina_2026'),
    ('yas_marina', 'stat_bar', 2, 'Повороты', '16', 'По официальной карте FIA 2025 года', 'turns', 'fia_yas_marina_2025_map'),
    ('yas_marina', 'stat_bar', 3, 'Дебют площадки в F1', '2009', NULL, 'debut', 'formula1_yas_marina_2026'),
    ('yas_marina', 'stat_bar', 4, 'Рекорд круга F1', '1:25.637', 'Кевин Магнуссен · 2024', 'record', 'formula1_yas_marina_2026'),
    ('yas_marina', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_yas_marina_2026');

DELETE FROM atlas.circuit_history_entries
WHERE circuit_id IN ('albert_park', 'americas', 'imola', 'jeddah', 'yas_marina');

INSERT INTO atlas.circuit_history_entries (
    id, circuit_id, sort_order, year_label, title_ru, description_ru,
    media_asset_id, source_id
) VALUES
    ('albert-park-1993', 'albert_park', 1, '1993', 'Решение о переезде в Мельбурн',
     'После соглашения о проведении этапа для трассы выбрали существующие дороги вокруг Альберт-Парка',
     NULL, 'formula1_albert_park_2026_guide'),
    ('albert-park-1996', 'albert_park', 2, '1996', 'Первый Гран-при в Альберт-Парке',
     'Мельбурн впервые принял этап чемпионата мира через четыре месяца после последнего Гран-при Австралии в Аделаиде',
     NULL, 'formula1_albert_park_2026_guide'),

    ('americas-2012-open', 'americas', 1, '21 октября 2012', 'Открытие COTA',
     'Чемпион мира 1978 года Марио Андретти открыл новую стационарную трассу в Остине',
     NULL, 'formula1_americas_history'),
    ('americas-2012-gp', 'americas', 2, '2012', 'Первый Гран-при США в Остине',
     'Первый этап Формулы-1 на Circuit of The Americas выиграл Льюис Хэмилтон',
     NULL, 'formula1_americas_history'),

    ('imola-1953', 'imola', 1, '1953', 'Начало гонок',
     'После закладки первого камня в марте 1950 года трассу подготовили к испытаниям в 1952-м, а гонки начались в 1953 году',
     NULL, 'formula1_imola_2025'),
    ('imola-1980', 'imola', 2, '1980', 'Первый зачётный Гран-при Формулы-1',
     'Имола впервые приняла этап чемпионата мира под коммерческим названием Гран-при Италии',
     NULL, 'formula1_imola_history'),

    ('jeddah-2020', 'jeddah', 1, 'Январь 2020', 'Выбор площадки на Корнише',
     'Делегация Формулы-1 обследовала возможные площадки и выбрала прибрежную зону Корниш в Джидде',
     NULL, 'formula1_jeddah_design_history'),
    ('jeddah-2021', 'jeddah', 2, '2021', 'Первый Гран-при Саудовской Аравии',
     'Городская трасса в Джидде впервые приняла этап чемпионата мира под искусственным освещением',
     NULL, 'formula1_jeddah_2025'),

    ('yas-marina-2009-built', 'yas_marina', 1, 'Октябрь 2009', 'Завершение строительства',
     'Проект трассы на острове Яс, объявленный в 2006 году, завершили в октябре 2009-го',
     NULL, 'formula1_yas_marina_history'),
    ('yas-marina-2009-gp', 'yas_marina', 2, '1 ноября 2009', 'Первый Гран-при Абу-Даби',
     'Yas Marina приняла первый этап Формулы-1 в сумеречном формате',
     NULL, 'formula1_yas_marina_first_gp');

COMMIT;
