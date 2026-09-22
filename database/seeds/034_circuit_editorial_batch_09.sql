BEGIN;

-- Редакционный пакет 09: датированные показатели этапов и история площадок.
-- Дата доступа ко всем источникам: 2026-09-20.
INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('formula1_kyalami_1976_result', 'Formula 1 — South African Grand Prix 1976 race result',
     'https://www.formula1.com/en/results/1976/races/359/south-africa/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 6 марта 1976 года на Kyalami Grand Prix Circuit: 78 кругов и победа Ники Лауды; уверенность высокая'),
    ('formula1_long_beach_1976_result', 'Formula 1 — USA West Grand Prix 1976 race result',
     'https://www.formula1.com/en/results/1976/races/360/usa-west/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 28 марта 1976 года на Long Beach Street Circuit: 80 кругов и победа Клея Регаццони; уверенность высокая'),
    ('formula1_magny_cours_1991_result', 'Formula 1 — French Grand Prix 1991 race result',
     'https://www.formula1.com/en/results/1991/races/565/france/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 7 июля 1991 года на Circuit de Nevers Magny-Cours: 72 круга и победа Найджела Мэнселла; уверенность высокая'),
    ('formula1_mosport_1967_result', 'Formula 1 — Canadian Grand Prix 1967 race result',
     'https://www.formula1.com/en/results/1967/races/251/canada/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 27 августа 1967 года на Mosport International Raceway: 90 кругов и победа Джека Брэбема; уверенность высокая'),
    ('formula1_nurburgring_1984_result', 'Formula 1 — European Grand Prix 1984 race result',
     'https://www.formula1.com/en/results/1984/races/480/europe/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 7 октября 1984 года на Nürburgring: 67 кругов и победа Алена Проста; уверенность высокая')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('kyalami', 'long_beach', 'magny_cours', 'mosport', 'nurburgring');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('kyalami', 'highlight', 1, 'Гран-при ЮАР · 1976', NULL, NULL, NULL, 'formula1_kyalami_1976_result'),
    ('kyalami', 'highlight', 2, '78 кругов', NULL, 'Этап 1976 года', NULL, 'formula1_kyalami_1976_result'),
    ('kyalami', 'metric', 1, 'Дата этапа', '6 марта 1976', NULL, NULL, 'formula1_kyalami_1976_result'),
    ('kyalami', 'metric', 2, 'Победитель', 'Ники Лауда', 'Ferrari', NULL, 'formula1_kyalami_1976_result'),
    ('kyalami', 'metric', 3, 'Круги', '78', NULL, NULL, 'formula1_kyalami_1976_result'),
    ('kyalami', 'stat_bar', 1, 'Год этапа чемпионата мира', '1976', NULL, 'debut', 'formula1_kyalami_1976_result'),
    ('kyalami', 'stat_bar', 2, 'Круги', '78', 'Гран-при ЮАР 1976 года', NULL, 'formula1_kyalami_1976_result'),
    ('kyalami', 'stat_bar', 3, 'Время победителя', '1:42:18.400', 'Ники Лауда · 1976', NULL, 'formula1_kyalami_1976_result'),

    ('long_beach', 'highlight', 1, 'Гран-при США-Запад · 1976', NULL, NULL, NULL, 'formula1_long_beach_1976_result'),
    ('long_beach', 'highlight', 2, '80 кругов', NULL, 'Этап 1976 года', NULL, 'formula1_long_beach_1976_result'),
    ('long_beach', 'metric', 1, 'Дата этапа', '28 марта 1976', NULL, NULL, 'formula1_long_beach_1976_result'),
    ('long_beach', 'metric', 2, 'Победитель', 'Клей Регаццони', 'Ferrari', NULL, 'formula1_long_beach_1976_result'),
    ('long_beach', 'metric', 3, 'Круги', '80', NULL, NULL, 'formula1_long_beach_1976_result'),
    ('long_beach', 'stat_bar', 1, 'Год этапа чемпионата мира', '1976', NULL, 'debut', 'formula1_long_beach_1976_result'),
    ('long_beach', 'stat_bar', 2, 'Круги', '80', 'Гран-при США-Запад 1976 года', NULL, 'formula1_long_beach_1976_result'),
    ('long_beach', 'stat_bar', 3, 'Время победителя', '1:53:18.471', 'Клей Регаццони · 1976', NULL, 'formula1_long_beach_1976_result'),

    ('magny_cours', 'highlight', 1, 'Гран-при Франции · 1991', NULL, NULL, NULL, 'formula1_magny_cours_1991_result'),
    ('magny_cours', 'highlight', 2, '72 круга', NULL, 'Этап 1991 года', NULL, 'formula1_magny_cours_1991_result'),
    ('magny_cours', 'metric', 1, 'Дата этапа', '7 июля 1991', NULL, NULL, 'formula1_magny_cours_1991_result'),
    ('magny_cours', 'metric', 2, 'Победитель', 'Найджел Мэнселл', 'Williams Renault', NULL, 'formula1_magny_cours_1991_result'),
    ('magny_cours', 'metric', 3, 'Круги', '72', NULL, NULL, 'formula1_magny_cours_1991_result'),
    ('magny_cours', 'stat_bar', 1, 'Год этапа чемпионата мира', '1991', NULL, 'debut', 'formula1_magny_cours_1991_result'),
    ('magny_cours', 'stat_bar', 2, 'Круги', '72', 'Гран-при Франции 1991 года', NULL, 'formula1_magny_cours_1991_result'),
    ('magny_cours', 'stat_bar', 3, 'Время победителя', '1:38:00.056', 'Найджел Мэнселл · 1991', NULL, 'formula1_magny_cours_1991_result'),

    ('mosport', 'highlight', 1, 'Гран-при Канады · 1967', NULL, NULL, NULL, 'formula1_mosport_1967_result'),
    ('mosport', 'highlight', 2, '90 кругов', NULL, 'Этап 1967 года', NULL, 'formula1_mosport_1967_result'),
    ('mosport', 'metric', 1, 'Дата этапа', '27 августа 1967', NULL, NULL, 'formula1_mosport_1967_result'),
    ('mosport', 'metric', 2, 'Победитель', 'Джек Брэбем', 'Brabham Repco', NULL, 'formula1_mosport_1967_result'),
    ('mosport', 'metric', 3, 'Круги', '90', NULL, NULL, 'formula1_mosport_1967_result'),
    ('mosport', 'stat_bar', 1, 'Год этапа чемпионата мира', '1967', NULL, 'debut', 'formula1_mosport_1967_result'),
    ('mosport', 'stat_bar', 2, 'Круги', '90', 'Гран-при Канады 1967 года', NULL, 'formula1_mosport_1967_result'),
    ('mosport', 'stat_bar', 3, 'Время победителя', '2:40:40.000', 'Джек Брэбем · 1967', NULL, 'formula1_mosport_1967_result'),

    ('nurburgring', 'highlight', 1, 'Гран-при Европы · 1984', NULL, NULL, NULL, 'formula1_nurburgring_1984_result'),
    ('nurburgring', 'highlight', 2, '67 кругов', NULL, 'Этап 1984 года', NULL, 'formula1_nurburgring_1984_result'),
    ('nurburgring', 'metric', 1, 'Дата этапа', '7 октября 1984', NULL, NULL, 'formula1_nurburgring_1984_result'),
    ('nurburgring', 'metric', 2, 'Победитель', 'Ален Прост', 'McLaren TAG', NULL, 'formula1_nurburgring_1984_result'),
    ('nurburgring', 'metric', 3, 'Круги', '67', NULL, NULL, 'formula1_nurburgring_1984_result'),
    ('nurburgring', 'stat_bar', 1, 'Год этапа чемпионата мира', '1984', NULL, 'debut', 'formula1_nurburgring_1984_result'),
    ('nurburgring', 'stat_bar', 2, 'Круги', '67', 'Гран-при Европы 1984 года', NULL, 'formula1_nurburgring_1984_result'),
    ('nurburgring', 'stat_bar', 3, 'Время победителя', '1:35:13.284', 'Ален Прост · 1984', NULL, 'formula1_nurburgring_1984_result');

DELETE FROM atlas.circuit_history_entries
WHERE circuit_id IN ('kyalami', 'long_beach', 'magny_cours', 'mosport', 'nurburgring');

INSERT INTO atlas.circuit_history_entries (
    id, circuit_id, sort_order, year_label, title_ru, description_ru,
    media_asset_id, source_id
) VALUES
    ('kyalami-1976', 'kyalami', 1, '6 марта 1976', 'Гран-при ЮАР 1976 года',
     'Ники Лауда выиграл 78-круговую гонку чемпионата мира на Kyalami Grand Prix Circuit за Ferrari',
     NULL, 'formula1_kyalami_1976_result'),
    ('long-beach-1976', 'long_beach', 1, '28 марта 1976', 'Гран-при США-Запад 1976 года',
     'Клей Регаццони выиграл 80-круговую гонку чемпионата мира на Long Beach Street Circuit за Ferrari',
     NULL, 'formula1_long_beach_1976_result'),
    ('magny-cours-1991', 'magny_cours', 1, '7 июля 1991', 'Гран-при Франции 1991 года',
     'Найджел Мэнселл выиграл 72-круговую гонку чемпионата мира на Circuit de Nevers Magny-Cours за Williams Renault',
     NULL, 'formula1_magny_cours_1991_result'),
    ('mosport-1967', 'mosport', 1, '27 августа 1967', 'Гран-при Канады 1967 года',
     'Джек Брэбем выиграл 90-круговую гонку чемпионата мира на Mosport International Raceway за Brabham Repco',
     NULL, 'formula1_mosport_1967_result'),
    ('nurburgring-1984', 'nurburgring', 1, '7 октября 1984', 'Гран-при Европы 1984 года',
     'Ален Прост выиграл 67-круговую гонку чемпионата мира на Nürburgring за McLaren TAG',
     NULL, 'formula1_nurburgring_1984_result');

COMMIT;
