BEGIN;

-- Редакционный пакет 13: датированные показатели этапов и история площадок.
-- Дата доступа ко всем источникам: 2026-09-21.
INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('formula1_riverside_1960_result', 'Formula 1 — 1960 UNITED STATES GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1960/races/187/united-states/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 20 ноября 1960 года на Riverside International Raceway: 75 кругов и победа Стирлинга Мосса; уверенность высокая'),
    ('formula1_mugello_2020_result', 'Formula 1 — FORMULA 1 PIRELLI GRAN PREMIO DELLA TOSCANA FERRARI 1000 2020 - RACE RESULT',
     'https://www.formula1.com/en/results/2020/races/1053/italy/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 13 сентября 2020 года на Mugello: 59 кругов и победа Льюиса Хэмилтона; уверенность высокая'),
    ('formula1_zeltweg_1964_result', 'Formula 1 — 1964 AUSTRIAN GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1964/races/221/austria/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 23 августа 1964 года на Zeltweg Airfield: 105 кругов и победа Лоренцо Бандини; уверенность высокая'),
    ('formula1_pescara_1957_result', 'Formula 1 — 1957 PESCARA GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1957/races/156/pescara/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 18 августа 1957 года на Pescara Circuit: 18 кругов и победа Стирлинга Мосса; уверенность высокая'),
    ('formula1_montjuic_1969_result', 'Formula 1 — 1969 SPANISH GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1969/races/268/spain/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 4 мая 1969 года на Montjuïc Circuit: 90 кругов и победа Джеки Стюарта; уверенность высокая')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('riverside', 'mugello', 'zeltweg', 'pescara', 'montjuic');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('riverside', 'highlight', 1, 'Гран-при США · 1960', NULL, NULL, NULL, 'formula1_riverside_1960_result'),
    ('riverside', 'highlight', 2, '75 кругов', NULL, 'Этап 1960 года', NULL, 'formula1_riverside_1960_result'),
    ('riverside', 'metric', 1, 'Дата этапа', '20 ноября 1960', NULL, NULL, 'formula1_riverside_1960_result'),
    ('riverside', 'metric', 2, 'Победитель', 'Стирлинг Мосс', 'Lotus Climax', NULL, 'formula1_riverside_1960_result'),
    ('riverside', 'metric', 3, 'Круги', '75', NULL, NULL, 'formula1_riverside_1960_result'),
    ('riverside', 'stat_bar', 1, 'Год этапа чемпионата мира', '1960', NULL, 'debut', 'formula1_riverside_1960_result'),
    ('riverside', 'stat_bar', 2, 'Круги', '75', 'Гран-при США 1960 года', NULL, 'formula1_riverside_1960_result'),
    ('riverside', 'stat_bar', 3, 'Время победителя', '2:28:52.200', 'Стирлинг Мосс · 1960', NULL, 'formula1_riverside_1960_result'),

    ('mugello', 'highlight', 1, 'Гран-при Тосканы · 2020', NULL, NULL, NULL, 'formula1_mugello_2020_result'),
    ('mugello', 'highlight', 2, '59 кругов', NULL, 'Этап 2020 года', NULL, 'formula1_mugello_2020_result'),
    ('mugello', 'metric', 1, 'Дата этапа', '13 сентября 2020', NULL, NULL, 'formula1_mugello_2020_result'),
    ('mugello', 'metric', 2, 'Победитель', 'Льюис Хэмилтон', 'Mercedes', NULL, 'formula1_mugello_2020_result'),
    ('mugello', 'metric', 3, 'Круги', '59', NULL, NULL, 'formula1_mugello_2020_result'),
    ('mugello', 'stat_bar', 1, 'Год этапа чемпионата мира', '2020', NULL, 'debut', 'formula1_mugello_2020_result'),
    ('mugello', 'stat_bar', 2, 'Круги', '59', 'Гран-при Тосканы 2020 года', NULL, 'formula1_mugello_2020_result'),
    ('mugello', 'stat_bar', 3, 'Время победителя', '2:19:35.060', 'Льюис Хэмилтон · 2020', NULL, 'formula1_mugello_2020_result'),

    ('zeltweg', 'highlight', 1, 'Гран-при Австрии · 1964', NULL, NULL, NULL, 'formula1_zeltweg_1964_result'),
    ('zeltweg', 'highlight', 2, '105 кругов', NULL, 'Этап 1964 года', NULL, 'formula1_zeltweg_1964_result'),
    ('zeltweg', 'metric', 1, 'Дата этапа', '23 августа 1964', NULL, NULL, 'formula1_zeltweg_1964_result'),
    ('zeltweg', 'metric', 2, 'Победитель', 'Лоренцо Бандини', 'Ferrari', NULL, 'formula1_zeltweg_1964_result'),
    ('zeltweg', 'metric', 3, 'Круги', '105', NULL, NULL, 'formula1_zeltweg_1964_result'),
    ('zeltweg', 'stat_bar', 1, 'Год этапа чемпионата мира', '1964', NULL, 'debut', 'formula1_zeltweg_1964_result'),
    ('zeltweg', 'stat_bar', 2, 'Круги', '105', 'Гран-при Австрии 1964 года', NULL, 'formula1_zeltweg_1964_result'),
    ('zeltweg', 'stat_bar', 3, 'Время победителя', '2:06:18.230', 'Лоренцо Бандини · 1964', NULL, 'formula1_zeltweg_1964_result'),

    ('pescara', 'highlight', 1, 'Гран-при Пескары · 1957', NULL, NULL, NULL, 'formula1_pescara_1957_result'),
    ('pescara', 'highlight', 2, '18 кругов', NULL, 'Этап 1957 года', NULL, 'formula1_pescara_1957_result'),
    ('pescara', 'metric', 1, 'Дата этапа', '18 августа 1957', NULL, NULL, 'formula1_pescara_1957_result'),
    ('pescara', 'metric', 2, 'Победитель', 'Стирлинг Мосс', 'Vanwall', NULL, 'formula1_pescara_1957_result'),
    ('pescara', 'metric', 3, 'Круги', '18', NULL, NULL, 'formula1_pescara_1957_result'),
    ('pescara', 'stat_bar', 1, 'Год этапа чемпионата мира', '1957', NULL, 'debut', 'formula1_pescara_1957_result'),
    ('pescara', 'stat_bar', 2, 'Круги', '18', 'Гран-при Пескары 1957 года', NULL, 'formula1_pescara_1957_result'),
    ('pescara', 'stat_bar', 3, 'Время победителя', '2:59:22.700', 'Стирлинг Мосс · 1957', NULL, 'formula1_pescara_1957_result'),

    ('montjuic', 'highlight', 1, 'Гран-при Испании · 1969', NULL, NULL, NULL, 'formula1_montjuic_1969_result'),
    ('montjuic', 'highlight', 2, '90 кругов', NULL, 'Этап 1969 года', NULL, 'formula1_montjuic_1969_result'),
    ('montjuic', 'metric', 1, 'Дата этапа', '4 мая 1969', NULL, NULL, 'formula1_montjuic_1969_result'),
    ('montjuic', 'metric', 2, 'Победитель', 'Джеки Стюарт', 'Matra Ford', NULL, 'formula1_montjuic_1969_result'),
    ('montjuic', 'metric', 3, 'Круги', '90', NULL, NULL, 'formula1_montjuic_1969_result'),
    ('montjuic', 'stat_bar', 1, 'Год этапа чемпионата мира', '1969', NULL, 'debut', 'formula1_montjuic_1969_result'),
    ('montjuic', 'stat_bar', 2, 'Круги', '90', 'Гран-при Испании 1969 года', NULL, 'formula1_montjuic_1969_result'),
    ('montjuic', 'stat_bar', 3, 'Время победителя', '2:16:53.990', 'Джеки Стюарт · 1969', NULL, 'formula1_montjuic_1969_result');

DELETE FROM atlas.circuit_history_entries
WHERE circuit_id IN ('riverside', 'mugello', 'zeltweg', 'pescara', 'montjuic');

INSERT INTO atlas.circuit_history_entries (
    id, circuit_id, sort_order, year_label, title_ru, description_ru,
    media_asset_id, source_id
) VALUES
    ('riverside-1960', 'riverside', 1, '20 ноября 1960', 'Гран-при США 1960 года',
     'Стирлинг Мосс выиграл 75-круговую гонку чемпионата мира на Riverside International Raceway за Lotus Climax',
     NULL, 'formula1_riverside_1960_result'),
    ('mugello-2020', 'mugello', 1, '13 сентября 2020', 'Гран-при Тосканы 2020 года',
     'Льюис Хэмилтон выиграл 59-круговую гонку чемпионата мира на Mugello за Mercedes',
     NULL, 'formula1_mugello_2020_result'),
    ('zeltweg-1964', 'zeltweg', 1, '23 августа 1964', 'Гран-при Австрии 1964 года',
     'Лоренцо Бандини выиграл 105-круговую гонку чемпионата мира на Zeltweg Airfield за Ferrari',
     NULL, 'formula1_zeltweg_1964_result'),
    ('pescara-1957', 'pescara', 1, '18 августа 1957', 'Гран-при Пескары 1957 года',
     'Стирлинг Мосс выиграл 18-круговую гонку чемпионата мира на Pescara Circuit за Vanwall',
     NULL, 'formula1_pescara_1957_result'),
    ('montjuic-1969', 'montjuic', 1, '4 мая 1969', 'Гран-при Испании 1969 года',
     'Джеки Стюарт выиграл 90-круговую гонку чемпионата мира на Montjuïc Circuit за Matra Ford',
     NULL, 'formula1_montjuic_1969_result');

COMMIT;
