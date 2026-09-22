BEGIN;

-- Редакционный пакет 07: датированные показатели этапов и история площадок.
-- Дата доступа ко всем источникам: 2026-09-20.
INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('formula1_boavista_1958_result', 'Formula 1 — Portuguese Grand Prix 1958 race result',
     'https://www.formula1.com/en/results/1958/races/166/portugal/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 24 августа 1958 года на Circuit da Boavista: 50 кругов и победа Стирлинга Мосса; уверенность высокая'),
    ('formula1_boavista_1960_result', 'Formula 1 — Portuguese Grand Prix 1960 race result',
     'https://www.formula1.com/en/results/1960/races/185/portugal/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 14 августа 1960 года на Circuit da Boavista: 55 кругов и победа Джека Брэбема; уверенность высокая'),
    ('formula1_buddh_2011_result', 'Formula 1 — Indian Grand Prix 2011 race result',
     'https://www.formula1.com/en/results/2011/races/44/india/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 30 октября 2011 года на Buddh International Circuit: 60 кругов и победа Себастьяна Феттеля; уверенность высокая'),
    ('formula1_buddh_2013_result', 'Formula 1 — Indian Grand Prix 2013 race result',
     'https://www.formula1.com/en/results/2013/races/894/india/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 27 октября 2013 года на Buddh International Circuit: 60 кругов и победа Себастьяна Феттеля; уверенность высокая'),
    ('formula1_galvez_1953_result', 'Formula 1 — Argentine Grand Prix 1953 race result',
     'https://www.formula1.com/en/results/1953/races/117/argentina/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 18 января 1953 года на Autódromo Juan y Oscar Gálvez: 97 кругов и победа Альберто Аскари; уверенность высокая'),
    ('formula1_galvez_1998_result', 'Formula 1 — Argentine Grand Prix 1998 race result',
     'https://www.formula1.com/en/results/1998/races/673/argentina/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 12 апреля 1998 года на Autódromo Juan y Oscar Gálvez: 72 круга и победа Михаэля Шумахера; уверенность высокая'),
    ('formula1_valencia_2008_result', 'Formula 1 — European Grand Prix 2008 race result',
     'https://www.formula1.com/en/results/2008/races/836/europe/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 24 августа 2008 года на Valencia Street Circuit: 57 кругов и победа Фелипе Массы; уверенность высокая'),
    ('formula1_valencia_2012_result', 'Formula 1 — European Grand Prix 2012 race result',
     'https://www.formula1.com/en/results/2012/races/17/europe/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 24 июня 2012 года на Valencia Street Circuit: 57 кругов и победа Фернандо Алонсо; уверенность высокая'),
    ('formula1_dallas_1984_result', 'Formula 1 — Dallas Grand Prix 1984 race result',
     'https://www.formula1.com/en/results/1984/races/474/dallas/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 8 июля 1984 года на Dallas Fair Park: 67 кругов и победа Кеке Росберга; уверенность высокая')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('boavista', 'buddh', 'galvez', 'valencia', 'dallas');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('boavista', 'highlight', 1, '50 кругов · 1958', NULL, 'Гран-при Португалии', NULL, 'formula1_boavista_1958_result'),
    ('boavista', 'highlight', 2, '55 кругов · 1960', NULL, 'Гран-при Португалии', NULL, 'formula1_boavista_1960_result'),
    ('boavista', 'metric', 1, 'Этап чемпионата мира', '1958', '24 августа', NULL, 'formula1_boavista_1958_result'),
    ('boavista', 'metric', 2, 'Победитель', 'Стирлинг Мосс', 'Vanwall · 1958', NULL, 'formula1_boavista_1958_result'),
    ('boavista', 'metric', 3, 'Этап чемпионата мира', '1960', '14 августа', NULL, 'formula1_boavista_1960_result'),
    ('boavista', 'metric', 4, 'Победитель', 'Джек Брэбем', 'Cooper Climax · 1960', NULL, 'formula1_boavista_1960_result'),
    ('boavista', 'stat_bar', 1, 'Круги', '50', 'Гран-при Португалии 1958 года', NULL, 'formula1_boavista_1958_result'),
    ('boavista', 'stat_bar', 2, 'Круги', '55', 'Гран-при Португалии 1960 года', NULL, 'formula1_boavista_1960_result'),

    ('buddh', 'highlight', 1, '60 кругов · 2011', NULL, 'Гран-при Индии', NULL, 'formula1_buddh_2011_result'),
    ('buddh', 'highlight', 2, '60 кругов · 2013', NULL, 'Гран-при Индии', NULL, 'formula1_buddh_2013_result'),
    ('buddh', 'metric', 1, 'Этап чемпионата мира', '2011', '30 октября', NULL, 'formula1_buddh_2011_result'),
    ('buddh', 'metric', 2, 'Победитель', 'Себастьян Феттель', 'Red Bull Racing Renault · 2011', NULL, 'formula1_buddh_2011_result'),
    ('buddh', 'metric', 3, 'Этап чемпионата мира', '2013', '27 октября', NULL, 'formula1_buddh_2013_result'),
    ('buddh', 'metric', 4, 'Победитель', 'Себастьян Феттель', 'Red Bull Racing Renault · 2013', NULL, 'formula1_buddh_2013_result'),
    ('buddh', 'stat_bar', 1, 'Круги', '60', 'Гран-при Индии 2011 года', NULL, 'formula1_buddh_2011_result'),
    ('buddh', 'stat_bar', 2, 'Круги', '60', 'Гран-при Индии 2013 года', NULL, 'formula1_buddh_2013_result'),

    ('galvez', 'highlight', 1, '97 кругов · 1953', NULL, 'Гран-при Аргентины', NULL, 'formula1_galvez_1953_result'),
    ('galvez', 'highlight', 2, '72 круга · 1998', NULL, 'Гран-при Аргентины', NULL, 'formula1_galvez_1998_result'),
    ('galvez', 'metric', 1, 'Этап чемпионата мира', '1953', '18 января', NULL, 'formula1_galvez_1953_result'),
    ('galvez', 'metric', 2, 'Победитель', 'Альберто Аскари', 'Ferrari · 1953', NULL, 'formula1_galvez_1953_result'),
    ('galvez', 'metric', 3, 'Этап чемпионата мира', '1998', '12 апреля', NULL, 'formula1_galvez_1998_result'),
    ('galvez', 'metric', 4, 'Победитель', 'Михаэль Шумахер', 'Ferrari · 1998', NULL, 'formula1_galvez_1998_result'),
    ('galvez', 'stat_bar', 1, 'Круги', '97', 'Гран-при Аргентины 1953 года', NULL, 'formula1_galvez_1953_result'),
    ('galvez', 'stat_bar', 2, 'Круги', '72', 'Гран-при Аргентины 1998 года', NULL, 'formula1_galvez_1998_result'),

    ('valencia', 'highlight', 1, '57 кругов · 2008', NULL, 'Гран-при Европы', NULL, 'formula1_valencia_2008_result'),
    ('valencia', 'highlight', 2, '57 кругов · 2012', NULL, 'Гран-при Европы', NULL, 'formula1_valencia_2012_result'),
    ('valencia', 'metric', 1, 'Этап чемпионата мира', '2008', '24 августа', NULL, 'formula1_valencia_2008_result'),
    ('valencia', 'metric', 2, 'Победитель', 'Фелипе Масса', 'Ferrari · 2008', NULL, 'formula1_valencia_2008_result'),
    ('valencia', 'metric', 3, 'Этап чемпионата мира', '2012', '24 июня', NULL, 'formula1_valencia_2012_result'),
    ('valencia', 'metric', 4, 'Победитель', 'Фернандо Алонсо', 'Ferrari · 2012', NULL, 'formula1_valencia_2012_result'),
    ('valencia', 'stat_bar', 1, 'Круги', '57', 'Гран-при Европы 2008 года', NULL, 'formula1_valencia_2008_result'),
    ('valencia', 'stat_bar', 2, 'Круги', '57', 'Гран-при Европы 2012 года', NULL, 'formula1_valencia_2012_result'),

    ('dallas', 'highlight', 1, 'Гран-при Далласа · 1984', NULL, NULL, NULL, 'formula1_dallas_1984_result'),
    ('dallas', 'highlight', 2, '67 кругов', NULL, 'Этап 1984 года', NULL, 'formula1_dallas_1984_result'),
    ('dallas', 'metric', 1, 'Дата этапа', '8 июля 1984', NULL, NULL, 'formula1_dallas_1984_result'),
    ('dallas', 'metric', 2, 'Победитель', 'Кеке Росберг', 'Williams Honda', NULL, 'formula1_dallas_1984_result'),
    ('dallas', 'metric', 3, 'Круги', '67', NULL, NULL, 'formula1_dallas_1984_result'),
    ('dallas', 'stat_bar', 1, 'Год этапа чемпионата мира', '1984', NULL, 'debut', 'formula1_dallas_1984_result'),
    ('dallas', 'stat_bar', 2, 'Круги', '67', 'Гран-при Далласа 1984 года', NULL, 'formula1_dallas_1984_result'),
    ('dallas', 'stat_bar', 3, 'Время победителя', '2:01:22.617', 'Кеке Росберг · 1984', NULL, 'formula1_dallas_1984_result');

DELETE FROM atlas.circuit_history_entries
WHERE circuit_id IN ('boavista', 'buddh', 'galvez', 'valencia', 'dallas');

INSERT INTO atlas.circuit_history_entries (
    id, circuit_id, sort_order, year_label, title_ru, description_ru,
    media_asset_id, source_id
) VALUES
    ('boavista-1958', 'boavista', 1, '24 августа 1958', 'Гран-при Португалии 1958 года',
     'Стирлинг Мосс выиграл 50-круговую гонку чемпионата мира на Circuit da Boavista за Vanwall',
     NULL, 'formula1_boavista_1958_result'),
    ('boavista-1960', 'boavista', 2, '14 августа 1960', 'Гран-при Португалии 1960 года',
     'Джек Брэбем выиграл 55-круговую гонку чемпионата мира на Circuit da Boavista за Cooper Climax',
     NULL, 'formula1_boavista_1960_result'),

    ('buddh-2011', 'buddh', 1, '30 октября 2011', 'Гран-при Индии 2011 года',
     'Себастьян Феттель выиграл 60-круговую гонку чемпионата мира на Buddh International Circuit за Red Bull Racing Renault',
     NULL, 'formula1_buddh_2011_result'),
    ('buddh-2013', 'buddh', 2, '27 октября 2013', 'Гран-при Индии 2013 года',
     'Себастьян Феттель выиграл 60-круговую гонку чемпионата мира на Buddh International Circuit за Red Bull Racing Renault',
     NULL, 'formula1_buddh_2013_result'),

    ('galvez-1953', 'galvez', 1, '18 января 1953', 'Гран-при Аргентины 1953 года',
     'Альберто Аскари выиграл 97-круговую гонку чемпионата мира на Autódromo Juan y Oscar Gálvez за Ferrari',
     NULL, 'formula1_galvez_1953_result'),
    ('galvez-1998', 'galvez', 2, '12 апреля 1998', 'Гран-при Аргентины 1998 года',
     'Михаэль Шумахер выиграл 72-круговую гонку чемпионата мира на Autódromo Juan y Oscar Gálvez за Ferrari',
     NULL, 'formula1_galvez_1998_result'),

    ('valencia-2008', 'valencia', 1, '24 августа 2008', 'Гран-при Европы 2008 года',
     'Фелипе Масса выиграл 57-круговую гонку чемпионата мира на Valencia Street Circuit за Ferrari',
     NULL, 'formula1_valencia_2008_result'),
    ('valencia-2012', 'valencia', 2, '24 июня 2012', 'Гран-при Европы 2012 года',
     'Фернандо Алонсо выиграл 57-круговую гонку чемпионата мира на Valencia Street Circuit за Ferrari',
     NULL, 'formula1_valencia_2012_result'),

    ('dallas-1984', 'dallas', 1, '8 июля 1984', 'Гран-при Далласа 1984 года',
     'Кеке Росберг выиграл 67-круговую гонку чемпионата мира в Dallas Fair Park за Williams Honda',
     NULL, 'formula1_dallas_1984_result');

COMMIT;
