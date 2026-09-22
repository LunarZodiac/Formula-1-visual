BEGIN;

-- Редакционный пакет 14: датированные показатели этапов и история площадок.
-- Дата доступа ко всем источникам: 2026-09-21.
INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('formula1_essarts_1952_result', 'Formula 1 — 1952 FRENCH GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1952/races/112/france/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 6 июля 1952 года на Rouen les Essarts: 77 кругов и победа Альберто Аскари; уверенность высокая'),
    ('formula1_george_1962_result', 'Formula 1 — 1962 SOUTH AFRICAN GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1962/races/204/south-africa/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 29 декабря 1962 года на Prince George Circuit: 82 круга и победа Грэма Хилла; уверенность высокая'),
    ('formula1_lemans_1967_result', 'Formula 1 — 1967 FRENCH GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1967/races/248/france/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 2 июля 1967 года на Bugatti Au Mans: 80 кругов и победа Джека Брэбема; уверенность высокая'),
    ('formula1_pedralbes_1951_result', 'Formula 1 — 1951 SPANISH GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1951/races/108/spain/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 28 октября 1951 года на Circuit de Pedralbes: 70 кругов и победа Хуана Мануэля Фанхио; уверенность высокая'),
    ('formula1_reims_1950_result', 'Formula 1 — 1950 FRENCH GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1950/races/99/france/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 2 июля 1950 года на Circuit de Reims-Gueux: 64 круга и победа Хуана Мануэля Фанхио; уверенность высокая')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('essarts', 'george', 'lemans', 'pedralbes', 'reims');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('essarts', 'highlight', 1, 'Гран-при Франции · 1952', NULL, NULL, NULL, 'formula1_essarts_1952_result'),
    ('essarts', 'highlight', 2, '77 кругов', NULL, 'Этап 1952 года', NULL, 'formula1_essarts_1952_result'),
    ('essarts', 'metric', 1, 'Дата этапа', '6 июля 1952', NULL, NULL, 'formula1_essarts_1952_result'),
    ('essarts', 'metric', 2, 'Победитель', 'Альберто Аскари', 'Ferrari', NULL, 'formula1_essarts_1952_result'),
    ('essarts', 'metric', 3, 'Круги', '77', NULL, NULL, 'formula1_essarts_1952_result'),
    ('essarts', 'stat_bar', 1, 'Год этапа чемпионата мира', '1952', NULL, 'debut', 'formula1_essarts_1952_result'),
    ('essarts', 'stat_bar', 2, 'Круги', '77', 'Гран-при Франции 1952 года', NULL, 'formula1_essarts_1952_result'),
    ('essarts', 'stat_bar', 3, 'Время победителя', '3:00:00.000', 'Альберто Аскари · 1952', NULL, 'formula1_essarts_1952_result'),

    ('george', 'highlight', 1, 'Гран-при Южной Африки · 1962', NULL, NULL, NULL, 'formula1_george_1962_result'),
    ('george', 'highlight', 2, '82 круга', NULL, 'Этап 1962 года', NULL, 'formula1_george_1962_result'),
    ('george', 'metric', 1, 'Дата этапа', '29 декабря 1962', NULL, NULL, 'formula1_george_1962_result'),
    ('george', 'metric', 2, 'Победитель', 'Грэм Хилл', 'BRM', NULL, 'formula1_george_1962_result'),
    ('george', 'metric', 3, 'Круги', '82', NULL, NULL, 'formula1_george_1962_result'),
    ('george', 'stat_bar', 1, 'Год этапа чемпионата мира', '1962', NULL, 'debut', 'formula1_george_1962_result'),
    ('george', 'stat_bar', 2, 'Круги', '82', 'Гран-при Южной Африки 1962 года', NULL, 'formula1_george_1962_result'),
    ('george', 'stat_bar', 3, 'Время победителя', '2:08:03.300', 'Грэм Хилл · 1962', NULL, 'formula1_george_1962_result'),

    ('lemans', 'highlight', 1, 'Гран-при Франции · 1967', NULL, NULL, NULL, 'formula1_lemans_1967_result'),
    ('lemans', 'highlight', 2, '80 кругов', NULL, 'Этап 1967 года', NULL, 'formula1_lemans_1967_result'),
    ('lemans', 'metric', 1, 'Дата этапа', '2 июля 1967', NULL, NULL, 'formula1_lemans_1967_result'),
    ('lemans', 'metric', 2, 'Победитель', 'Джек Брэбем', 'Brabham Repco', NULL, 'formula1_lemans_1967_result'),
    ('lemans', 'metric', 3, 'Круги', '80', NULL, NULL, 'formula1_lemans_1967_result'),
    ('lemans', 'stat_bar', 1, 'Год этапа чемпионата мира', '1967', NULL, 'debut', 'formula1_lemans_1967_result'),
    ('lemans', 'stat_bar', 2, 'Круги', '80', 'Гран-при Франции 1967 года', NULL, 'formula1_lemans_1967_result'),
    ('lemans', 'stat_bar', 3, 'Время победителя', '2:13:21.300', 'Джек Брэбем · 1967', NULL, 'formula1_lemans_1967_result'),

    ('pedralbes', 'highlight', 1, 'Гран-при Испании · 1951', NULL, NULL, NULL, 'formula1_pedralbes_1951_result'),
    ('pedralbes', 'highlight', 2, '70 кругов', NULL, 'Этап 1951 года', NULL, 'formula1_pedralbes_1951_result'),
    ('pedralbes', 'metric', 1, 'Дата этапа', '28 октября 1951', NULL, NULL, 'formula1_pedralbes_1951_result'),
    ('pedralbes', 'metric', 2, 'Победитель', 'Хуан Мануэль Фанхио', 'Alfa Romeo', NULL, 'formula1_pedralbes_1951_result'),
    ('pedralbes', 'metric', 3, 'Круги', '70', NULL, NULL, 'formula1_pedralbes_1951_result'),
    ('pedralbes', 'stat_bar', 1, 'Год этапа чемпионата мира', '1951', NULL, 'debut', 'formula1_pedralbes_1951_result'),
    ('pedralbes', 'stat_bar', 2, 'Круги', '70', 'Гран-при Испании 1951 года', NULL, 'formula1_pedralbes_1951_result'),
    ('pedralbes', 'stat_bar', 3, 'Время победителя', '2:46:54.100', 'Хуан Мануэль Фанхио · 1951', NULL, 'formula1_pedralbes_1951_result'),

    ('reims', 'highlight', 1, 'Гран-при Франции · 1950', NULL, NULL, NULL, 'formula1_reims_1950_result'),
    ('reims', 'highlight', 2, '64 круга', NULL, 'Этап 1950 года', NULL, 'formula1_reims_1950_result'),
    ('reims', 'metric', 1, 'Дата этапа', '2 июля 1950', NULL, NULL, 'formula1_reims_1950_result'),
    ('reims', 'metric', 2, 'Победитель', 'Хуан Мануэль Фанхио', 'Alfa Romeo', NULL, 'formula1_reims_1950_result'),
    ('reims', 'metric', 3, 'Круги', '64', NULL, NULL, 'formula1_reims_1950_result'),
    ('reims', 'stat_bar', 1, 'Год этапа чемпионата мира', '1950', NULL, 'debut', 'formula1_reims_1950_result'),
    ('reims', 'stat_bar', 2, 'Круги', '64', 'Гран-при Франции 1950 года', NULL, 'formula1_reims_1950_result'),
    ('reims', 'stat_bar', 3, 'Время победителя', '2:57:52.800', 'Хуан Мануэль Фанхио · 1950', NULL, 'formula1_reims_1950_result');

DELETE FROM atlas.circuit_history_entries
WHERE circuit_id IN ('essarts', 'george', 'lemans', 'pedralbes', 'reims');

INSERT INTO atlas.circuit_history_entries (
    id, circuit_id, sort_order, year_label, title_ru, description_ru,
    media_asset_id, source_id
) VALUES
    ('essarts-1952', 'essarts', 1, '6 июля 1952', 'Гран-при Франции 1952 года',
     'Альберто Аскари выиграл 77-круговую гонку чемпионата мира на Rouen les Essarts за Ferrari',
     NULL, 'formula1_essarts_1952_result'),
    ('george-1962', 'george', 1, '29 декабря 1962', 'Гран-при Южной Африки 1962 года',
     'Грэм Хилл выиграл 82-круговую гонку чемпионата мира на Prince George Circuit за BRM',
     NULL, 'formula1_george_1962_result'),
    ('lemans-1967', 'lemans', 1, '2 июля 1967', 'Гран-при Франции 1967 года',
     'Джек Брэбем выиграл 80-круговую гонку чемпионата мира на Bugatti Au Mans за Brabham Repco',
     NULL, 'formula1_lemans_1967_result'),
    ('pedralbes-1951', 'pedralbes', 1, '28 октября 1951', 'Гран-при Испании 1951 года',
     'Хуан Мануэль Фанхио выиграл 70-круговую гонку чемпионата мира на Circuit de Pedralbes за Alfa Romeo',
     NULL, 'formula1_pedralbes_1951_result'),
    ('reims-1950', 'reims', 1, '2 июля 1950', 'Гран-при Франции 1950 года',
     'Хуан Мануэль Фанхио выиграл 64-круговую гонку чемпионата мира на Circuit de Reims-Gueux за Alfa Romeo',
     NULL, 'formula1_reims_1950_result');

COMMIT;
