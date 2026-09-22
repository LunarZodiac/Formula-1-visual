BEGIN;

-- Редакционный пакет 15: датированные показатели этапов и история площадок.
-- Дата доступа ко всем источникам: 2026-09-21.
INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('formula1_caesars_1981_result', 'Formula 1 — 1981 CAESAR''S PALACE GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1981/races/436/las-vegas/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 17 октября 1981 года на Caesars Palace: 75 кругов и победа Алана Джонса; уверенность высокая'),
    ('formula1_monsanto_1959_result', 'Formula 1 — 1959 PORTUGUESE GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1959/races/175/portugal/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 23 августа 1959 года на Monsanto Park: 62 круга и победа Стирлинга Мосса; уверенность высокая'),
    ('formula1_ricard_1971_result', 'Formula 1 — 1971 FRENCH GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1971/races/295/france/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 4 июля 1971 года на Circuit Paul Ricard: 55 кругов и победа Джеки Стюарта; уверенность высокая'),
    ('formula1_sebring_1959_result', 'Formula 1 — 1959 UNITED STATES GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1959/races/177/united-states/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 12 декабря 1959 года на Sebring Raceway: 42 круга и победа Брюса Макларена; уверенность высокая'),
    ('formula1_sochi_2021_race', 'Formula 1 — FORMULA 1 VTB RUSSIAN GRAND PRIX 2021',
     'https://www.formula1.com/en/racing/2021/russia',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальная страница этапа 26 сентября 2021 года на Sochi Autodrom: 53 круга и победа Льюиса Хэмилтона; уверенность высокая')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('las_vegas', 'monsanto', 'ricard', 'sebring', 'sochi');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('las_vegas', 'highlight', 1, 'Гран-при Сизарс-Пэлас · 1981', NULL, NULL, NULL, 'formula1_caesars_1981_result'),
    ('las_vegas', 'highlight', 2, '75 кругов', NULL, 'Этап 1981 года', NULL, 'formula1_caesars_1981_result'),
    ('las_vegas', 'metric', 1, 'Дата этапа', '17 октября 1981', NULL, NULL, 'formula1_caesars_1981_result'),
    ('las_vegas', 'metric', 2, 'Победитель', 'Алан Джонс', 'Williams Ford', NULL, 'formula1_caesars_1981_result'),
    ('las_vegas', 'metric', 3, 'Круги', '75', NULL, NULL, 'formula1_caesars_1981_result'),
    ('las_vegas', 'stat_bar', 1, 'Год этапа чемпионата мира', '1981', NULL, 'debut', 'formula1_caesars_1981_result'),
    ('las_vegas', 'stat_bar', 2, 'Круги', '75', 'Гран-при Сизарс-Пэлас 1981 года', NULL, 'formula1_caesars_1981_result'),
    ('las_vegas', 'stat_bar', 3, 'Время победителя', '1:44:09.077', 'Алан Джонс · 1981', NULL, 'formula1_caesars_1981_result'),

    ('monsanto', 'highlight', 1, 'Гран-при Португалии · 1959', NULL, NULL, NULL, 'formula1_monsanto_1959_result'),
    ('monsanto', 'highlight', 2, '62 круга', NULL, 'Этап 1959 года', NULL, 'formula1_monsanto_1959_result'),
    ('monsanto', 'metric', 1, 'Дата этапа', '23 августа 1959', NULL, NULL, 'formula1_monsanto_1959_result'),
    ('monsanto', 'metric', 2, 'Победитель', 'Стирлинг Мосс', 'Cooper Climax', NULL, 'formula1_monsanto_1959_result'),
    ('monsanto', 'metric', 3, 'Круги', '62', NULL, NULL, 'formula1_monsanto_1959_result'),
    ('monsanto', 'stat_bar', 1, 'Год этапа чемпионата мира', '1959', NULL, 'debut', 'formula1_monsanto_1959_result'),
    ('monsanto', 'stat_bar', 2, 'Круги', '62', 'Гран-при Португалии 1959 года', NULL, 'formula1_monsanto_1959_result'),
    ('monsanto', 'stat_bar', 3, 'Время победителя', '2:11:55.410', 'Стирлинг Мосс · 1959', NULL, 'formula1_monsanto_1959_result'),

    ('ricard', 'highlight', 1, 'Гран-при Франции · 1971', NULL, NULL, NULL, 'formula1_ricard_1971_result'),
    ('ricard', 'highlight', 2, '55 кругов', NULL, 'Этап 1971 года', NULL, 'formula1_ricard_1971_result'),
    ('ricard', 'metric', 1, 'Дата этапа', '4 июля 1971', NULL, NULL, 'formula1_ricard_1971_result'),
    ('ricard', 'metric', 2, 'Победитель', 'Джеки Стюарт', 'Tyrrell Ford', NULL, 'formula1_ricard_1971_result'),
    ('ricard', 'metric', 3, 'Круги', '55', NULL, NULL, 'formula1_ricard_1971_result'),
    ('ricard', 'stat_bar', 1, 'Год этапа чемпионата мира', '1971', NULL, 'debut', 'formula1_ricard_1971_result'),
    ('ricard', 'stat_bar', 2, 'Круги', '55', 'Гран-при Франции 1971 года', NULL, 'formula1_ricard_1971_result'),
    ('ricard', 'stat_bar', 3, 'Время победителя', '1:46:41.680', 'Джеки Стюарт · 1971', NULL, 'formula1_ricard_1971_result'),

    ('sebring', 'highlight', 1, 'Гран-при США · 1959', NULL, NULL, NULL, 'formula1_sebring_1959_result'),
    ('sebring', 'highlight', 2, '42 круга', NULL, 'Этап 1959 года', NULL, 'formula1_sebring_1959_result'),
    ('sebring', 'metric', 1, 'Дата этапа', '12 декабря 1959', NULL, NULL, 'formula1_sebring_1959_result'),
    ('sebring', 'metric', 2, 'Победитель', 'Брюс Макларен', 'Cooper Climax', NULL, 'formula1_sebring_1959_result'),
    ('sebring', 'metric', 3, 'Круги', '42', NULL, NULL, 'formula1_sebring_1959_result'),
    ('sebring', 'stat_bar', 1, 'Год этапа чемпионата мира', '1959', NULL, 'debut', 'formula1_sebring_1959_result'),
    ('sebring', 'stat_bar', 2, 'Круги', '42', 'Гран-при США 1959 года', NULL, 'formula1_sebring_1959_result'),
    ('sebring', 'stat_bar', 3, 'Время победителя', '2:12:35.700', 'Брюс Макларен · 1959', NULL, 'formula1_sebring_1959_result'),

    ('sochi', 'highlight', 1, 'Гран-при России · 2021', NULL, NULL, NULL, 'formula1_sochi_2021_race'),
    ('sochi', 'highlight', 2, '53 круга', NULL, 'Этап 2021 года', NULL, 'formula1_sochi_2021_race'),
    ('sochi', 'metric', 1, 'Дата этапа', '26 сентября 2021', NULL, NULL, 'formula1_sochi_2021_race'),
    ('sochi', 'metric', 2, 'Победитель', 'Льюис Хэмилтон', 'Mercedes', NULL, 'formula1_sochi_2021_race'),
    ('sochi', 'metric', 3, 'Круги', '53', NULL, NULL, 'formula1_sochi_2021_race'),
    ('sochi', 'stat_bar', 1, 'Год этапа чемпионата мира', '2021', NULL, 'debut', 'formula1_sochi_2021_race'),
    ('sochi', 'stat_bar', 2, 'Круги', '53', 'Гран-при России 2021 года', NULL, 'formula1_sochi_2021_race'),
    ('sochi', 'stat_bar', 3, 'Время победителя', '1:30:41.001', 'Льюис Хэмилтон · 2021', NULL, 'formula1_sochi_2021_race');

DELETE FROM atlas.circuit_history_entries
WHERE circuit_id IN ('las_vegas', 'monsanto', 'ricard', 'sebring', 'sochi');

INSERT INTO atlas.circuit_history_entries (
    id, circuit_id, sort_order, year_label, title_ru, description_ru,
    media_asset_id, source_id
) VALUES
    ('las-vegas-1981', 'las_vegas', 1, '17 октября 1981', 'Гран-при Сизарс-Пэлас 1981 года',
     'Алан Джонс выиграл 75-круговую гонку чемпионата мира на Caesars Palace за Williams Ford',
     NULL, 'formula1_caesars_1981_result'),
    ('monsanto-1959', 'monsanto', 1, '23 августа 1959', 'Гран-при Португалии 1959 года',
     'Стирлинг Мосс выиграл 62-круговую гонку чемпионата мира на Monsanto Park за Cooper Climax',
     NULL, 'formula1_monsanto_1959_result'),
    ('ricard-1971', 'ricard', 1, '4 июля 1971', 'Гран-при Франции 1971 года',
     'Джеки Стюарт выиграл 55-круговую гонку чемпионата мира на Circuit Paul Ricard за Tyrrell Ford',
     NULL, 'formula1_ricard_1971_result'),
    ('sebring-1959', 'sebring', 1, '12 декабря 1959', 'Гран-при США 1959 года',
     'Брюс Макларен выиграл 42-круговую гонку чемпионата мира на Sebring Raceway за Cooper Climax',
     NULL, 'formula1_sebring_1959_result'),
    ('sochi-2021', 'sochi', 1, '26 сентября 2021', 'Гран-при России 2021 года',
     'Льюис Хэмилтон выиграл 53-круговую гонку чемпионата мира на Sochi Autodrom за Mercedes',
     NULL, 'formula1_sochi_2021_race');

COMMIT;
