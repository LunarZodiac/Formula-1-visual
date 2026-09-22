BEGIN;

-- Редакционный пакет 08: датированные показатели этапов и история площадок.
-- Дата доступа ко всем источникам: 2026-09-20.
INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('formula1_detroit_1982_result', 'Formula 1 — USA East Grand Prix 1982 race result',
     'https://www.formula1.com/en/results/1982/races/443/detroit/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 6 июня 1982 года на Detroit Street Circuit: 62 круга и победа Джона Уотсона; уверенность высокая'),
    ('formula1_fuji_1976_result', 'Formula 1 — Japanese Grand Prix 1976 race result',
     'https://www.formula1.com/en/results/1976/races/373/japan/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 24 октября 1976 года на Fuji Speedway: 73 круга и победа Марио Андретти; уверенность высокая'),
    ('formula1_hockenheim_1970_result', 'Formula 1 — German Grand Prix 1970 race result',
     'https://www.formula1.com/en/results/1970/races/285/germany/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 2 августа 1970 года на Hockenheimring: 50 кругов и победа Йохена Риндта; уверенность высокая'),
    ('formula1_indianapolis_2000_result', 'Formula 1 — United States Grand Prix 2000 race result',
     'https://www.formula1.com/en/results/2000/races/61/united-states/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 24 сентября 2000 года на Indianapolis Motor Speedway: 73 круга и победа Михаэля Шумахера; уверенность высокая'),
    ('formula1_istanbul_2005_result', 'Formula 1 — Turkish Grand Prix 2005 race result',
     'https://www.formula1.com/en/results/2005/races/784/turkey/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 21 августа 2005 года на Intercity Istanbul Park: 58 кругов и победа Кими Райкконена; уверенность высокая')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('detroit', 'fuji', 'hockenheimring', 'indianapolis', 'istanbul');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('detroit', 'highlight', 1, 'Гран-при Детройта · 1982', NULL, NULL, NULL, 'formula1_detroit_1982_result'),
    ('detroit', 'highlight', 2, '62 круга', NULL, 'Этап 1982 года', NULL, 'formula1_detroit_1982_result'),
    ('detroit', 'metric', 1, 'Дата этапа', '6 июня 1982', NULL, NULL, 'formula1_detroit_1982_result'),
    ('detroit', 'metric', 2, 'Победитель', 'Джон Уотсон', 'McLaren Ford', NULL, 'formula1_detroit_1982_result'),
    ('detroit', 'metric', 3, 'Круги', '62', NULL, NULL, 'formula1_detroit_1982_result'),
    ('detroit', 'stat_bar', 1, 'Год этапа чемпионата мира', '1982', NULL, 'debut', 'formula1_detroit_1982_result'),
    ('detroit', 'stat_bar', 2, 'Круги', '62', 'Гран-при Детройта 1982 года', NULL, 'formula1_detroit_1982_result'),
    ('detroit', 'stat_bar', 3, 'Время победителя', '1:58:41.043', 'Джон Уотсон · 1982', NULL, 'formula1_detroit_1982_result'),

    ('fuji', 'highlight', 1, 'Гран-при Японии · 1976', NULL, NULL, NULL, 'formula1_fuji_1976_result'),
    ('fuji', 'highlight', 2, '73 круга', NULL, 'Этап 1976 года', NULL, 'formula1_fuji_1976_result'),
    ('fuji', 'metric', 1, 'Дата этапа', '24 октября 1976', NULL, NULL, 'formula1_fuji_1976_result'),
    ('fuji', 'metric', 2, 'Победитель', 'Марио Андретти', 'Lotus Ford', NULL, 'formula1_fuji_1976_result'),
    ('fuji', 'metric', 3, 'Круги', '73', NULL, NULL, 'formula1_fuji_1976_result'),
    ('fuji', 'stat_bar', 1, 'Год этапа чемпионата мира', '1976', NULL, 'debut', 'formula1_fuji_1976_result'),
    ('fuji', 'stat_bar', 2, 'Круги', '73', 'Гран-при Японии 1976 года', NULL, 'formula1_fuji_1976_result'),
    ('fuji', 'stat_bar', 3, 'Время победителя', '1:43:58.860', 'Марио Андретти · 1976', NULL, 'formula1_fuji_1976_result'),

    ('hockenheimring', 'highlight', 1, 'Гран-при Германии · 1970', NULL, NULL, NULL, 'formula1_hockenheim_1970_result'),
    ('hockenheimring', 'highlight', 2, '50 кругов', NULL, 'Этап 1970 года', NULL, 'formula1_hockenheim_1970_result'),
    ('hockenheimring', 'metric', 1, 'Дата этапа', '2 августа 1970', NULL, NULL, 'formula1_hockenheim_1970_result'),
    ('hockenheimring', 'metric', 2, 'Победитель', 'Йохен Риндт', 'Lotus Ford', NULL, 'formula1_hockenheim_1970_result'),
    ('hockenheimring', 'metric', 3, 'Круги', '50', NULL, NULL, 'formula1_hockenheim_1970_result'),
    ('hockenheimring', 'stat_bar', 1, 'Год этапа чемпионата мира', '1970', NULL, 'debut', 'formula1_hockenheim_1970_result'),
    ('hockenheimring', 'stat_bar', 2, 'Круги', '50', 'Гран-при Германии 1970 года', NULL, 'formula1_hockenheim_1970_result'),
    ('hockenheimring', 'stat_bar', 3, 'Время победителя', '1:42:00.300', 'Йохен Риндт · 1970', NULL, 'formula1_hockenheim_1970_result'),

    ('indianapolis', 'highlight', 1, 'Гран-при США · 2000', NULL, NULL, NULL, 'formula1_indianapolis_2000_result'),
    ('indianapolis', 'highlight', 2, '73 круга', NULL, 'Этап 2000 года', NULL, 'formula1_indianapolis_2000_result'),
    ('indianapolis', 'metric', 1, 'Дата этапа', '24 сентября 2000', NULL, NULL, 'formula1_indianapolis_2000_result'),
    ('indianapolis', 'metric', 2, 'Победитель', 'Михаэль Шумахер', 'Ferrari', NULL, 'formula1_indianapolis_2000_result'),
    ('indianapolis', 'metric', 3, 'Круги', '73', NULL, NULL, 'formula1_indianapolis_2000_result'),
    ('indianapolis', 'stat_bar', 1, 'Год этапа чемпионата мира', '2000', NULL, 'debut', 'formula1_indianapolis_2000_result'),
    ('indianapolis', 'stat_bar', 2, 'Круги', '73', 'Гран-при США 2000 года', NULL, 'formula1_indianapolis_2000_result'),
    ('indianapolis', 'stat_bar', 3, 'Время победителя', '1:36:30.883', 'Михаэль Шумахер · 2000', NULL, 'formula1_indianapolis_2000_result'),

    ('istanbul', 'highlight', 1, 'Гран-при Турции · 2005', NULL, NULL, NULL, 'formula1_istanbul_2005_result'),
    ('istanbul', 'highlight', 2, '58 кругов', NULL, 'Этап 2005 года', NULL, 'formula1_istanbul_2005_result'),
    ('istanbul', 'metric', 1, 'Дата этапа', '21 августа 2005', NULL, NULL, 'formula1_istanbul_2005_result'),
    ('istanbul', 'metric', 2, 'Победитель', 'Кими Райкконен', 'McLaren Mercedes', NULL, 'formula1_istanbul_2005_result'),
    ('istanbul', 'metric', 3, 'Круги', '58', NULL, NULL, 'formula1_istanbul_2005_result'),
    ('istanbul', 'stat_bar', 1, 'Год этапа чемпионата мира', '2005', NULL, 'debut', 'formula1_istanbul_2005_result'),
    ('istanbul', 'stat_bar', 2, 'Круги', '58', 'Гран-при Турции 2005 года', NULL, 'formula1_istanbul_2005_result'),
    ('istanbul', 'stat_bar', 3, 'Время победителя', '1:24:34.454', 'Кими Райкконен · 2005', NULL, 'formula1_istanbul_2005_result');

DELETE FROM atlas.circuit_history_entries
WHERE circuit_id IN ('detroit', 'fuji', 'hockenheimring', 'indianapolis', 'istanbul');

INSERT INTO atlas.circuit_history_entries (
    id, circuit_id, sort_order, year_label, title_ru, description_ru,
    media_asset_id, source_id
) VALUES
    ('detroit-1982', 'detroit', 1, '6 июня 1982', 'Гран-при Детройта 1982 года',
     'Джон Уотсон выиграл 62-круговую гонку чемпионата мира на Detroit Street Circuit за McLaren Ford',
     NULL, 'formula1_detroit_1982_result'),
    ('fuji-1976', 'fuji', 1, '24 октября 1976', 'Гран-при Японии 1976 года',
     'Марио Андретти выиграл 73-круговую гонку чемпионата мира на Fuji Speedway за Lotus Ford',
     NULL, 'formula1_fuji_1976_result'),
    ('hockenheimring-1970', 'hockenheimring', 1, '2 августа 1970', 'Гран-при Германии 1970 года',
     'Йохен Риндт выиграл 50-круговую гонку чемпионата мира на Hockenheimring за Lotus Ford',
     NULL, 'formula1_hockenheim_1970_result'),
    ('indianapolis-2000', 'indianapolis', 1, '24 сентября 2000', 'Гран-при США 2000 года',
     'Михаэль Шумахер выиграл 73-круговую гонку чемпионата мира на Indianapolis Motor Speedway за Ferrari',
     NULL, 'formula1_indianapolis_2000_result'),
    ('istanbul-2005', 'istanbul', 1, '21 августа 2005', 'Гран-при Турции 2005 года',
     'Кими Райкконен выиграл 58-круговую гонку чемпионата мира на Intercity Istanbul Park за McLaren Mercedes',
     NULL, 'formula1_istanbul_2005_result');

COMMIT;
