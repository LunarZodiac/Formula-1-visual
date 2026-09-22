BEGIN;

-- Редакционный пакет 11: датированные показатели этапов и история площадок.
-- Дата доступа ко всем источникам: 2026-09-20.
INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('formula1_aintree_1955_result', 'Formula 1 — 1955 BRITISH GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1955/races/140/britain/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 16 июля 1955 года на Aintree Racecourse: 90 кругов и победа Стирлинга Мосса; уверенность высокая'),
    ('formula1_charade_1965_result', 'Formula 1 — 1965 FRENCH GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1965/races/228/france/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 27 июня 1965 года на Charade Circuit: 40 кругов и победа Джима Кларка; уверенность высокая'),
    ('formula1_dijon_1974_result', 'Formula 1 — 1974 FRENCH GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1974/races/337/france/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 7 июля 1974 года на Circuit Dijon-Prenois: 80 кругов и победа Ронни Петерсона; уверенность высокая'),
    ('formula1_donington_1993_result', 'Formula 1 — SEGA EUROPEAN GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1993/races/592/europe/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 11 апреля 1993 года на Donington Park: 76 кругов и победа Айртона Сенны; уверенность высокая'),
    ('formula1_estoril_1984_result', 'Formula 1 — 4. GRANDE PREMIO DE PORTUGAL - RACE RESULT',
     'https://www.formula1.com/en/results/1984/races/481/portugal/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 21 октября 1984 года на Autódromo do Estoril: 70 кругов и победа Алена Проста; уверенность высокая')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('aintree', 'charade', 'dijon', 'donington', 'estoril');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('aintree', 'highlight', 1, 'Гран-при Великобритании · 1955', NULL, NULL, NULL, 'formula1_aintree_1955_result'),
    ('aintree', 'highlight', 2, '90 кругов', NULL, 'Этап 1955 года', NULL, 'formula1_aintree_1955_result'),
    ('aintree', 'metric', 1, 'Дата этапа', '16 июля 1955', NULL, NULL, 'formula1_aintree_1955_result'),
    ('aintree', 'metric', 2, 'Победитель', 'Стирлинг Мосс', 'Mercedes-Benz', NULL, 'formula1_aintree_1955_result'),
    ('aintree', 'metric', 3, 'Круги', '90', NULL, NULL, 'formula1_aintree_1955_result'),
    ('aintree', 'stat_bar', 1, 'Год этапа чемпионата мира', '1955', NULL, 'debut', 'formula1_aintree_1955_result'),
    ('aintree', 'stat_bar', 2, 'Круги', '90', 'Гран-при Великобритании 1955 года', NULL, 'formula1_aintree_1955_result'),
    ('aintree', 'stat_bar', 3, 'Время победителя', '3:07:21.200', 'Стирлинг Мосс · 1955', NULL, 'formula1_aintree_1955_result'),

    ('charade', 'highlight', 1, 'Гран-при Франции · 1965', NULL, NULL, NULL, 'formula1_charade_1965_result'),
    ('charade', 'highlight', 2, '40 кругов', NULL, 'Этап 1965 года', NULL, 'formula1_charade_1965_result'),
    ('charade', 'metric', 1, 'Дата этапа', '27 июня 1965', NULL, NULL, 'formula1_charade_1965_result'),
    ('charade', 'metric', 2, 'Победитель', 'Джим Кларк', 'Lotus Climax', NULL, 'formula1_charade_1965_result'),
    ('charade', 'metric', 3, 'Круги', '40', NULL, NULL, 'formula1_charade_1965_result'),
    ('charade', 'stat_bar', 1, 'Год этапа чемпионата мира', '1965', NULL, 'debut', 'formula1_charade_1965_result'),
    ('charade', 'stat_bar', 2, 'Круги', '40', 'Гран-при Франции 1965 года', NULL, 'formula1_charade_1965_result'),
    ('charade', 'stat_bar', 3, 'Время победителя', '2:14:38.400', 'Джим Кларк · 1965', NULL, 'formula1_charade_1965_result'),

    ('dijon', 'highlight', 1, 'Гран-при Франции · 1974', NULL, NULL, NULL, 'formula1_dijon_1974_result'),
    ('dijon', 'highlight', 2, '80 кругов', NULL, 'Этап 1974 года', NULL, 'formula1_dijon_1974_result'),
    ('dijon', 'metric', 1, 'Дата этапа', '7 июля 1974', NULL, NULL, 'formula1_dijon_1974_result'),
    ('dijon', 'metric', 2, 'Победитель', 'Ронни Петерсон', 'Lotus Ford', NULL, 'formula1_dijon_1974_result'),
    ('dijon', 'metric', 3, 'Круги', '80', NULL, NULL, 'formula1_dijon_1974_result'),
    ('dijon', 'stat_bar', 1, 'Год этапа чемпионата мира', '1974', NULL, 'debut', 'formula1_dijon_1974_result'),
    ('dijon', 'stat_bar', 2, 'Круги', '80', 'Гран-при Франции 1974 года', NULL, 'formula1_dijon_1974_result'),
    ('dijon', 'stat_bar', 3, 'Время победителя', '1:21:55.020', 'Ронни Петерсон · 1974', NULL, 'formula1_dijon_1974_result'),

    ('donington', 'highlight', 1, 'Гран-при Европы · 1993', NULL, NULL, NULL, 'formula1_donington_1993_result'),
    ('donington', 'highlight', 2, '76 кругов', NULL, 'Этап 1993 года', NULL, 'formula1_donington_1993_result'),
    ('donington', 'metric', 1, 'Дата этапа', '11 апреля 1993', NULL, NULL, 'formula1_donington_1993_result'),
    ('donington', 'metric', 2, 'Победитель', 'Айртон Сенна', 'McLaren Ford', NULL, 'formula1_donington_1993_result'),
    ('donington', 'metric', 3, 'Круги', '76', NULL, NULL, 'formula1_donington_1993_result'),
    ('donington', 'stat_bar', 1, 'Год этапа чемпионата мира', '1993', NULL, 'debut', 'formula1_donington_1993_result'),
    ('donington', 'stat_bar', 2, 'Круги', '76', 'Гран-при Европы 1993 года', NULL, 'formula1_donington_1993_result'),
    ('donington', 'stat_bar', 3, 'Время победителя', '1:50:46.570', 'Айртон Сенна · 1993', NULL, 'formula1_donington_1993_result'),

    ('estoril', 'highlight', 1, 'Гран-при Португалии · 1984', NULL, NULL, NULL, 'formula1_estoril_1984_result'),
    ('estoril', 'highlight', 2, '70 кругов', NULL, 'Этап 1984 года', NULL, 'formula1_estoril_1984_result'),
    ('estoril', 'metric', 1, 'Дата этапа', '21 октября 1984', NULL, NULL, 'formula1_estoril_1984_result'),
    ('estoril', 'metric', 2, 'Победитель', 'Ален Прост', 'McLaren TAG', NULL, 'formula1_estoril_1984_result'),
    ('estoril', 'metric', 3, 'Круги', '70', NULL, NULL, 'formula1_estoril_1984_result'),
    ('estoril', 'stat_bar', 1, 'Год этапа чемпионата мира', '1984', NULL, 'debut', 'formula1_estoril_1984_result'),
    ('estoril', 'stat_bar', 2, 'Круги', '70', 'Гран-при Португалии 1984 года', NULL, 'formula1_estoril_1984_result'),
    ('estoril', 'stat_bar', 3, 'Время победителя', '1:41:11.753', 'Ален Прост · 1984', NULL, 'formula1_estoril_1984_result');

DELETE FROM atlas.circuit_history_entries
WHERE circuit_id IN ('aintree', 'charade', 'dijon', 'donington', 'estoril');

INSERT INTO atlas.circuit_history_entries (
    id, circuit_id, sort_order, year_label, title_ru, description_ru,
    media_asset_id, source_id
) VALUES
    ('aintree-1955', 'aintree', 1, '16 июля 1955', 'Гран-при Великобритании 1955 года',
     'Стирлинг Мосс выиграл 90-круговую гонку чемпионата мира на Aintree Racecourse за Mercedes-Benz',
     NULL, 'formula1_aintree_1955_result'),
    ('charade-1965', 'charade', 1, '27 июня 1965', 'Гран-при Франции 1965 года',
     'Джим Кларк выиграл 40-круговую гонку чемпионата мира на Charade Circuit за Lotus Climax',
     NULL, 'formula1_charade_1965_result'),
    ('dijon-1974', 'dijon', 1, '7 июля 1974', 'Гран-при Франции 1974 года',
     'Ронни Петерсон выиграл 80-круговую гонку чемпионата мира на Circuit Dijon-Prenois за Lotus Ford',
     NULL, 'formula1_dijon_1974_result'),
    ('donington-1993', 'donington', 1, '11 апреля 1993', 'Гран-при Европы 1993 года',
     'Айртон Сенна выиграл 76-круговую гонку чемпионата мира на Donington Park за McLaren Ford',
     NULL, 'formula1_donington_1993_result'),
    ('estoril-1984', 'estoril', 1, '21 октября 1984', 'Гран-при Португалии 1984 года',
     'Ален Прост выиграл 70-круговую гонку чемпионата мира на Autódromo do Estoril за McLaren TAG',
     NULL, 'formula1_estoril_1984_result');

COMMIT;
