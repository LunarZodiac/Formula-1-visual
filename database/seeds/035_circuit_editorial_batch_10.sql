BEGIN;

-- Редакционный пакет 10: датированные показатели этапов и история площадок.
-- Дата доступа ко всем источникам: 2026-09-20.
INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('formula1_zolder_1982_result', 'Formula 1 — Belgian Grand Prix 1982 race result',
     'https://www.formula1.com/en/results/1982/races/441/belgium/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 9 мая 1982 года на Circuit Zolder: 70 кругов и победа Джона Уотсона; уверенность высокая'),
    ('formula1_nivelles_1972_result', 'Formula 1 — Belgian Grand Prix 1972 race result',
     'https://www.formula1.com/en/results/1972/races/306/belgium/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 4 июня 1972 года на Complexe Européen de Nivelles-Baulers: 85 кругов и победа Эмерсона Фиттипальди; уверенность высокая'),
    ('formula1_jacarepagua_1978_result', 'Formula 1 — Brazilian Grand Prix 1978 race result',
     'https://www.formula1.com/en/results/1978/races/392/brazil/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 29 января 1978 года на Autódromo Internacional do Rio de Janeiro: 63 круга и победа Карлоса Ройтемана; уверенность высокая'),
    ('formula1_tremblant_1970_result', 'Formula 1 — Canadian Grand Prix 1970 race result',
     'https://www.formula1.com/en/results/1970/races/288/canada/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 20 сентября 1970 года на Mont-Tremblant: 90 кругов и победа Жаки Икса; уверенность высокая'),
    ('formula1_watkins_glen_1961_result', 'Formula 1 — United States Grand Prix 1961 race result',
     'https://www.formula1.com/en/results/1961/races/195/united-states/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 8 октября 1961 года на Watkins Glen International: 100 кругов и победа Иннеса Айрленда; уверенность высокая')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('zolder', 'nivelles', 'jacarepagua', 'tremblant', 'watkins_glen');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('zolder', 'highlight', 1, 'Гран-при Бельгии · 1982', NULL, NULL, NULL, 'formula1_zolder_1982_result'),
    ('zolder', 'highlight', 2, '70 кругов', NULL, 'Этап 1982 года', NULL, 'formula1_zolder_1982_result'),
    ('zolder', 'metric', 1, 'Дата этапа', '9 мая 1982', NULL, NULL, 'formula1_zolder_1982_result'),
    ('zolder', 'metric', 2, 'Победитель', 'Джон Уотсон', 'McLaren Ford', NULL, 'formula1_zolder_1982_result'),
    ('zolder', 'metric', 3, 'Круги', '70', NULL, NULL, 'formula1_zolder_1982_result'),
    ('zolder', 'stat_bar', 1, 'Год этапа чемпионата мира', '1982', NULL, 'debut', 'formula1_zolder_1982_result'),
    ('zolder', 'stat_bar', 2, 'Круги', '70', 'Гран-при Бельгии 1982 года', NULL, 'formula1_zolder_1982_result'),
    ('zolder', 'stat_bar', 3, 'Время победителя', '1:35:41.995', 'Джон Уотсон · 1982', NULL, 'formula1_zolder_1982_result'),

    ('nivelles', 'highlight', 1, 'Гран-при Бельгии · 1972', NULL, NULL, NULL, 'formula1_nivelles_1972_result'),
    ('nivelles', 'highlight', 2, '85 кругов', NULL, 'Этап 1972 года', NULL, 'formula1_nivelles_1972_result'),
    ('nivelles', 'metric', 1, 'Дата этапа', '4 июня 1972', NULL, NULL, 'formula1_nivelles_1972_result'),
    ('nivelles', 'metric', 2, 'Победитель', 'Эмерсон Фиттипальди', 'Lotus Ford', NULL, 'formula1_nivelles_1972_result'),
    ('nivelles', 'metric', 3, 'Круги', '85', NULL, NULL, 'formula1_nivelles_1972_result'),
    ('nivelles', 'stat_bar', 1, 'Год этапа чемпионата мира', '1972', NULL, 'debut', 'formula1_nivelles_1972_result'),
    ('nivelles', 'stat_bar', 2, 'Круги', '85', 'Гран-при Бельгии 1972 года', NULL, 'formula1_nivelles_1972_result'),
    ('nivelles', 'stat_bar', 3, 'Время победителя', '1:44:06.700', 'Эмерсон Фиттипальди · 1972', NULL, 'formula1_nivelles_1972_result'),

    ('jacarepagua', 'highlight', 1, 'Гран-при Бразилии · 1978', NULL, NULL, NULL, 'formula1_jacarepagua_1978_result'),
    ('jacarepagua', 'highlight', 2, '63 круга', NULL, 'Этап 1978 года', NULL, 'formula1_jacarepagua_1978_result'),
    ('jacarepagua', 'metric', 1, 'Дата этапа', '29 января 1978', NULL, NULL, 'formula1_jacarepagua_1978_result'),
    ('jacarepagua', 'metric', 2, 'Победитель', 'Карлос Ройтеман', 'Ferrari', NULL, 'formula1_jacarepagua_1978_result'),
    ('jacarepagua', 'metric', 3, 'Круги', '63', NULL, NULL, 'formula1_jacarepagua_1978_result'),
    ('jacarepagua', 'stat_bar', 1, 'Год этапа чемпионата мира', '1978', NULL, 'debut', 'formula1_jacarepagua_1978_result'),
    ('jacarepagua', 'stat_bar', 2, 'Круги', '63', 'Гран-при Бразилии 1978 года', NULL, 'formula1_jacarepagua_1978_result'),
    ('jacarepagua', 'stat_bar', 3, 'Время победителя', '1:49:59.860', 'Карлос Ройтеман · 1978', NULL, 'formula1_jacarepagua_1978_result'),

    ('tremblant', 'highlight', 1, 'Гран-при Канады · 1970', NULL, NULL, NULL, 'formula1_tremblant_1970_result'),
    ('tremblant', 'highlight', 2, '90 кругов', NULL, 'Этап 1970 года', NULL, 'formula1_tremblant_1970_result'),
    ('tremblant', 'metric', 1, 'Дата этапа', '20 сентября 1970', NULL, NULL, 'formula1_tremblant_1970_result'),
    ('tremblant', 'metric', 2, 'Победитель', 'Жаки Икс', 'Ferrari', NULL, 'formula1_tremblant_1970_result'),
    ('tremblant', 'metric', 3, 'Круги', '90', NULL, NULL, 'formula1_tremblant_1970_result'),
    ('tremblant', 'stat_bar', 1, 'Год этапа чемпионата мира', '1970', NULL, 'debut', 'formula1_tremblant_1970_result'),
    ('tremblant', 'stat_bar', 2, 'Круги', '90', 'Гран-при Канады 1970 года', NULL, 'formula1_tremblant_1970_result'),
    ('tremblant', 'stat_bar', 3, 'Время победителя', '2:21:18.400', 'Жаки Икс · 1970', NULL, 'formula1_tremblant_1970_result'),

    ('watkins_glen', 'highlight', 1, 'Гран-при США · 1961', NULL, NULL, NULL, 'formula1_watkins_glen_1961_result'),
    ('watkins_glen', 'highlight', 2, '100 кругов', NULL, 'Этап 1961 года', NULL, 'formula1_watkins_glen_1961_result'),
    ('watkins_glen', 'metric', 1, 'Дата этапа', '8 октября 1961', NULL, NULL, 'formula1_watkins_glen_1961_result'),
    ('watkins_glen', 'metric', 2, 'Победитель', 'Иннес Айрленд', 'Lotus Climax', NULL, 'formula1_watkins_glen_1961_result'),
    ('watkins_glen', 'metric', 3, 'Круги', '100', NULL, NULL, 'formula1_watkins_glen_1961_result'),
    ('watkins_glen', 'stat_bar', 1, 'Год этапа чемпионата мира', '1961', NULL, 'debut', 'formula1_watkins_glen_1961_result'),
    ('watkins_glen', 'stat_bar', 2, 'Круги', '100', 'Гран-при США 1961 года', NULL, 'formula1_watkins_glen_1961_result'),
    ('watkins_glen', 'stat_bar', 3, 'Время победителя', '2:13:45.800', 'Иннес Айрленд · 1961', NULL, 'formula1_watkins_glen_1961_result');

DELETE FROM atlas.circuit_history_entries
WHERE circuit_id IN ('zolder', 'nivelles', 'jacarepagua', 'tremblant', 'watkins_glen');

INSERT INTO atlas.circuit_history_entries (
    id, circuit_id, sort_order, year_label, title_ru, description_ru,
    media_asset_id, source_id
) VALUES
    ('zolder-1982', 'zolder', 1, '9 мая 1982', 'Гран-при Бельгии 1982 года',
     'Джон Уотсон выиграл 70-круговую гонку чемпионата мира на Circuit Zolder за McLaren Ford',
     NULL, 'formula1_zolder_1982_result'),
    ('nivelles-1972', 'nivelles', 1, '4 июня 1972', 'Гран-при Бельгии 1972 года',
     'Эмерсон Фиттипальди выиграл 85-круговую гонку чемпионата мира на Complexe Européen de Nivelles-Baulers за Lotus Ford',
     NULL, 'formula1_nivelles_1972_result'),
    ('jacarepagua-1978', 'jacarepagua', 1, '29 января 1978', 'Гран-при Бразилии 1978 года',
     'Карлос Ройтеман выиграл 63-круговую гонку чемпионата мира на Autódromo Internacional do Rio de Janeiro за Ferrari',
     NULL, 'formula1_jacarepagua_1978_result'),
    ('tremblant-1970', 'tremblant', 1, '20 сентября 1970', 'Гран-при Канады 1970 года',
     'Жаки Икс выиграл 90-круговую гонку чемпионата мира на Mont-Tremblant за Ferrari',
     NULL, 'formula1_tremblant_1970_result'),
    ('watkins-glen-1961', 'watkins_glen', 1, '8 октября 1961', 'Гран-при США 1961 года',
     'Иннес Айрленд выиграл 100-круговую гонку чемпионата мира на Watkins Glen International за Lotus Climax',
     NULL, 'formula1_watkins_glen_1961_result');

COMMIT;
