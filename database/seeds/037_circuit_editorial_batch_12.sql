BEGIN;

-- Редакционный пакет 12: датированные показатели этапов и история площадок.
-- Дата доступа ко всем источникам: 2026-09-21.
INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('formula1_jarama_1968_result', 'Formula 1 — 1968 SPANISH GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1968/races/256/spain/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 12 мая 1968 года на Circuito Permanente del Jarama: 90 кругов и победа Грэма Хилла; уверенность высокая'),
    ('formula1_jerez_1986_result', 'Formula 1 — GRAN PREMIO TIO PEPE DE ESPANA - RACE RESULT',
     'https://www.formula1.com/en/results/1986/races/499/spain/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 13 апреля 1986 года на Circuito Permanente de Jerez: 72 круга и победа Айртона Сенны; уверенность высокая'),
    ('formula1_okayama_1994_result', 'Formula 1 — PACIFIC GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1994/races/606/pacific/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 17 апреля 1994 года на TI Circuit Aida: 83 круга и победа Михаэля Шумахера; уверенность высокая'),
    ('formula1_phoenix_1989_result', 'Formula 1 — ICEBERG USA GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/1989/races/547/united-states/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 4 июня 1989 года на Phoenix Street Circuit: 75 кругов и победа Алена Проста; уверенность высокая'),
    ('formula1_yeongam_2010_result', 'Formula 1 — 2010 FORMULA 1 KOREAN GRAND PRIX - RACE RESULT',
     'https://www.formula1.com/en/results/2010/races/876/south-korea/race-result',
     'Official website', '2026-09-21T00:00:00Z',
     'Официальный протокол этапа 24 октября 2010 года на Korean International Circuit: 55 кругов и победа Фернандо Алонсо; уверенность высокая')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('jarama', 'jerez', 'okayama', 'phoenix', 'yeongam');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('jarama', 'highlight', 1, 'Гран-при Испании · 1968', NULL, NULL, NULL, 'formula1_jarama_1968_result'),
    ('jarama', 'highlight', 2, '90 кругов', NULL, 'Этап 1968 года', NULL, 'formula1_jarama_1968_result'),
    ('jarama', 'metric', 1, 'Дата этапа', '12 мая 1968', NULL, NULL, 'formula1_jarama_1968_result'),
    ('jarama', 'metric', 2, 'Победитель', 'Грэм Хилл', 'Lotus Ford', NULL, 'formula1_jarama_1968_result'),
    ('jarama', 'metric', 3, 'Круги', '90', NULL, NULL, 'formula1_jarama_1968_result'),
    ('jarama', 'stat_bar', 1, 'Год этапа чемпионата мира', '1968', NULL, 'debut', 'formula1_jarama_1968_result'),
    ('jarama', 'stat_bar', 2, 'Круги', '90', 'Гран-при Испании 1968 года', NULL, 'formula1_jarama_1968_result'),
    ('jarama', 'stat_bar', 3, 'Время победителя', '2:15:20.100', 'Грэм Хилл · 1968', NULL, 'formula1_jarama_1968_result'),

    ('jerez', 'highlight', 1, 'Гран-при Испании · 1986', NULL, NULL, NULL, 'formula1_jerez_1986_result'),
    ('jerez', 'highlight', 2, '72 круга', NULL, 'Этап 1986 года', NULL, 'formula1_jerez_1986_result'),
    ('jerez', 'metric', 1, 'Дата этапа', '13 апреля 1986', NULL, NULL, 'formula1_jerez_1986_result'),
    ('jerez', 'metric', 2, 'Победитель', 'Айртон Сенна', 'Lotus Renault', NULL, 'formula1_jerez_1986_result'),
    ('jerez', 'metric', 3, 'Круги', '72', NULL, NULL, 'formula1_jerez_1986_result'),
    ('jerez', 'stat_bar', 1, 'Год этапа чемпионата мира', '1986', NULL, 'debut', 'formula1_jerez_1986_result'),
    ('jerez', 'stat_bar', 2, 'Круги', '72', 'Гран-при Испании 1986 года', NULL, 'formula1_jerez_1986_result'),
    ('jerez', 'stat_bar', 3, 'Время победителя', '1:48:47.735', 'Айртон Сенна · 1986', NULL, 'formula1_jerez_1986_result'),

    ('okayama', 'highlight', 1, 'Гран-при Тихого океана · 1994', NULL, NULL, NULL, 'formula1_okayama_1994_result'),
    ('okayama', 'highlight', 2, '83 круга', NULL, 'Этап 1994 года', NULL, 'formula1_okayama_1994_result'),
    ('okayama', 'metric', 1, 'Дата этапа', '17 апреля 1994', NULL, NULL, 'formula1_okayama_1994_result'),
    ('okayama', 'metric', 2, 'Победитель', 'Михаэль Шумахер', 'Benetton Ford', NULL, 'formula1_okayama_1994_result'),
    ('okayama', 'metric', 3, 'Круги', '83', NULL, NULL, 'formula1_okayama_1994_result'),
    ('okayama', 'stat_bar', 1, 'Год этапа чемпионата мира', '1994', NULL, 'debut', 'formula1_okayama_1994_result'),
    ('okayama', 'stat_bar', 2, 'Круги', '83', 'Гран-при Тихого океана 1994 года', NULL, 'formula1_okayama_1994_result'),
    ('okayama', 'stat_bar', 3, 'Время победителя', '1:46:01.693', 'Михаэль Шумахер · 1994', NULL, 'formula1_okayama_1994_result'),

    ('phoenix', 'highlight', 1, 'Гран-при США · 1989', NULL, NULL, NULL, 'formula1_phoenix_1989_result'),
    ('phoenix', 'highlight', 2, '75 кругов', NULL, 'Этап 1989 года', NULL, 'formula1_phoenix_1989_result'),
    ('phoenix', 'metric', 1, 'Дата этапа', '4 июня 1989', NULL, NULL, 'formula1_phoenix_1989_result'),
    ('phoenix', 'metric', 2, 'Победитель', 'Ален Прост', 'McLaren Honda', NULL, 'formula1_phoenix_1989_result'),
    ('phoenix', 'metric', 3, 'Круги', '75', NULL, NULL, 'formula1_phoenix_1989_result'),
    ('phoenix', 'stat_bar', 1, 'Год этапа чемпионата мира', '1989', NULL, 'debut', 'formula1_phoenix_1989_result'),
    ('phoenix', 'stat_bar', 2, 'Круги', '75', 'Гран-при США 1989 года', NULL, 'formula1_phoenix_1989_result'),
    ('phoenix', 'stat_bar', 3, 'Время победителя', '2:01:33.133', 'Ален Прост · 1989', NULL, 'formula1_phoenix_1989_result'),

    ('yeongam', 'highlight', 1, 'Гран-при Кореи · 2010', NULL, NULL, NULL, 'formula1_yeongam_2010_result'),
    ('yeongam', 'highlight', 2, '55 кругов', NULL, 'Этап 2010 года', NULL, 'formula1_yeongam_2010_result'),
    ('yeongam', 'metric', 1, 'Дата этапа', '24 октября 2010', NULL, NULL, 'formula1_yeongam_2010_result'),
    ('yeongam', 'metric', 2, 'Победитель', 'Фернандо Алонсо', 'Ferrari', NULL, 'formula1_yeongam_2010_result'),
    ('yeongam', 'metric', 3, 'Круги', '55', NULL, NULL, 'formula1_yeongam_2010_result'),
    ('yeongam', 'stat_bar', 1, 'Год этапа чемпионата мира', '2010', NULL, 'debut', 'formula1_yeongam_2010_result'),
    ('yeongam', 'stat_bar', 2, 'Круги', '55', 'Гран-при Кореи 2010 года', NULL, 'formula1_yeongam_2010_result'),
    ('yeongam', 'stat_bar', 3, 'Время победителя', '2:48:20.810', 'Фернандо Алонсо · 2010', NULL, 'formula1_yeongam_2010_result');

DELETE FROM atlas.circuit_history_entries
WHERE circuit_id IN ('jarama', 'jerez', 'okayama', 'phoenix', 'yeongam');

INSERT INTO atlas.circuit_history_entries (
    id, circuit_id, sort_order, year_label, title_ru, description_ru,
    media_asset_id, source_id
) VALUES
    ('jarama-1968', 'jarama', 1, '12 мая 1968', 'Гран-при Испании 1968 года',
     'Грэм Хилл выиграл 90-круговую гонку чемпионата мира на Circuito Permanente del Jarama за Lotus Ford',
     NULL, 'formula1_jarama_1968_result'),
    ('jerez-1986', 'jerez', 1, '13 апреля 1986', 'Гран-при Испании 1986 года',
     'Айртон Сенна выиграл 72-круговую гонку чемпионата мира на Circuito Permanente de Jerez за Lotus Renault',
     NULL, 'formula1_jerez_1986_result'),
    ('okayama-1994', 'okayama', 1, '17 апреля 1994', 'Гран-при Тихого океана 1994 года',
     'Михаэль Шумахер выиграл 83-круговую гонку чемпионата мира на TI Circuit Aida за Benetton Ford',
     NULL, 'formula1_okayama_1994_result'),
    ('phoenix-1989', 'phoenix', 1, '4 июня 1989', 'Гран-при США 1989 года',
     'Ален Прост выиграл 75-круговую гонку чемпионата мира на Phoenix Street Circuit за McLaren Honda',
     NULL, 'formula1_phoenix_1989_result'),
    ('yeongam-2010', 'yeongam', 1, '24 октября 2010', 'Гран-при Кореи 2010 года',
     'Фернандо Алонсо выиграл 55-круговую гонку чемпионата мира на Korean International Circuit за Ferrari',
     NULL, 'formula1_yeongam_2010_result');

COMMIT;
