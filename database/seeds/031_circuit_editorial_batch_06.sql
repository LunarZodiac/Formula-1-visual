BEGIN;

-- Редакционный пакет 06: датированные показатели этапов и история площадок.
-- Дата доступа ко всем источникам: 2026-09-20.
INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('formula1_ain_diab_1958_result', 'Formula 1 — Moroccan Grand Prix 1958 race result',
     'https://www.formula1.com/en/results/1958/races/168/morocco/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 19 октября 1958 года на Ain-Diab Circuit: 53 круга и победа Стирлинга Мосса; уверенность высокая'),
    ('formula1_anderstorp_history', 'Formula 1 — Formula One racing''s Swedish connection',
     'https://www.formula1.com/en/latest/article/formula-one-racings-swedish-connection.3TveNZozvz5xKWy1YcgbRO',
     'Official website', '2026-09-20T00:00:00Z',
     'Шесть этапов чемпионата мира в Андерсторпе в 1970-х годах, строительство в конце 1960-х, первый этап 1973 года и финальный этап 1978 года; уверенность высокая'),
    ('formula1_anderstorp_1973_result', 'Formula 1 — Swedish Grand Prix 1973 race result',
     'https://www.formula1.com/en/results/1973/races/320/sweden/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 17 июня 1973 года на Scandinavian Raceway: 80 кругов и победа Денни Халма; уверенность высокая'),
    ('formula1_anderstorp_1978_result', 'Formula 1 — Swedish Grand Prix 1978 race result',
     'https://www.formula1.com/en/results/1978/races/398/sweden/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 17 июня 1978 года на Scandinavian Raceway: 70 кругов и победа Ники Лауды; уверенность высокая'),
    ('formula1_avus_history', 'Formula 1 — Moments in time: The German Grand Prix',
     'https://www.formula1.com/en/latest/article/moments-in-time-the-german-grand-prix.2FaVX5yf48IUr6cLe1Lnyd.2FaVX5yf48IUr6cLe1Lnyd',
     'Official website', '2026-09-20T00:00:00Z',
     'Единственный визит чемпионата мира на АФУС в 1959 году, уникальный формат из двух заездов и общая победа Тони Брукса; уверенность высокая'),
    ('formula1_avus_1959_result', 'Formula 1 — German Grand Prix 1959 race result',
     'https://www.formula1.com/en/results/1959/races/174/germany/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный итоговый протокол этапа 2 августа 1959 года на Automobil-Verkehrs und Übungs-Straße: 60 кругов и победа Тони Брукса; уверенность высокая'),
    ('formula1_brands_hatch_history', 'Formula 1 — Lotus complete landmark Brands Hatch filming day',
     'https://www.formula1.com/en/latest/article/lotus-complete-landmark-brands-hatch-filming-day.6fDOD6fMY2KN1CvhlKOgKW',
     'Official website', '2026-09-20T00:00:00Z',
     'Четырнадцать этапов чемпионата мира на Брэндс-Хэтче, регулярные британские этапы в 1964–1982 годах и последний Гран-при в 1986 году; уверенность высокая'),
    ('formula1_brands_hatch_1964_result', 'Formula 1 — British Grand Prix 1964 race result',
     'https://www.formula1.com/en/results/1964/races/219/great-britain/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 11 июля 1964 года на Brands Hatch Circuit: 80 кругов и победа Джима Кларка; уверенность высокая'),
    ('formula1_brands_hatch_1986_result', 'Formula 1 — British Grand Prix 1986 race result',
     'https://www.formula1.com/en/results/1986/races/506/great-britain/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 13 июля 1986 года на Brands Hatch Circuit: 75 кругов и победа Найджела Мэнселла; уверенность высокая'),
    ('formula1_bremgarten_1950_result', 'Formula 1 — Swiss Grand Prix 1950 race result',
     'https://www.formula1.com/en/results/1950/races/97/switzerland/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 4 июня 1950 года в Бремгартене: 42 круга и победа Нино Фарины; уверенность высокая'),
    ('formula1_bremgarten_1954_result', 'Formula 1 — Swiss Grand Prix 1954 race result',
     'https://www.formula1.com/en/results/1954/races/132/switzerland/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный протокол этапа 22 августа 1954 года в Бремгартене: 66 кругов и победа Хуана Мануэля Фанхио; уверенность высокая')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('ain-diab', 'anderstorp', 'avus', 'brands_hatch', 'bremgarten');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('ain-diab', 'highlight', 1, 'Гран-при Марокко 1958', NULL, NULL, NULL, 'formula1_ain_diab_1958_result'),
    ('ain-diab', 'highlight', 2, '53 круга', NULL, 'Этап 1958 года', NULL, 'formula1_ain_diab_1958_result'),
    ('ain-diab', 'metric', 1, 'Дата этапа', '19 октября 1958', NULL, NULL, 'formula1_ain_diab_1958_result'),
    ('ain-diab', 'metric', 2, 'Круги', '53', 'Гран-при Марокко 1958 года', NULL, 'formula1_ain_diab_1958_result'),
    ('ain-diab', 'metric', 3, 'Победитель', 'Стирлинг Мосс', 'Vanwall', NULL, 'formula1_ain_diab_1958_result'),
    ('ain-diab', 'stat_bar', 1, 'Год этапа чемпионата мира', '1958', NULL, 'debut', 'formula1_ain_diab_1958_result'),
    ('ain-diab', 'stat_bar', 2, 'Круги', '53', 'Гран-при Марокко 1958 года', NULL, 'formula1_ain_diab_1958_result'),
    ('ain-diab', 'stat_bar', 3, 'Время победителя', '2:09:15.100', 'Стирлинг Мосс · 1958', NULL, 'formula1_ain_diab_1958_result'),

    ('anderstorp', 'highlight', 1, '6 этапов чемпионата мира', NULL, '1970-е годы', NULL, 'formula1_anderstorp_history'),
    ('anderstorp', 'highlight', 2, '1973–1978 в календаре', NULL, NULL, NULL, 'formula1_anderstorp_history'),
    ('anderstorp', 'metric', 1, 'Первый этап чемпионата мира', '1973', NULL, NULL, 'formula1_anderstorp_history'),
    ('anderstorp', 'metric', 2, 'Финальный этап чемпионата мира', '1978', NULL, NULL, 'formula1_anderstorp_history'),
    ('anderstorp', 'metric', 3, 'Этапы чемпионата мира', '6', NULL, NULL, 'formula1_anderstorp_history'),
    ('anderstorp', 'stat_bar', 1, 'Первый этап чемпионата мира', '1973', NULL, 'debut', 'formula1_anderstorp_history'),
    ('anderstorp', 'stat_bar', 2, 'Круги', '80', 'Гран-при Швеции 1973 года', NULL, 'formula1_anderstorp_1973_result'),
    ('anderstorp', 'stat_bar', 3, 'Круги', '70', 'Гран-при Швеции 1978 года', NULL, 'formula1_anderstorp_1978_result'),

    ('avus', 'highlight', 1, 'Единственный визит чемпионата · 1959', NULL, NULL, NULL, 'formula1_avus_history'),
    ('avus', 'highlight', 2, 'Два зачётных заезда', NULL, 'Гран-при Германии 1959 года', NULL, 'formula1_avus_history'),
    ('avus', 'metric', 1, 'Дата этапа', '2 августа 1959', NULL, NULL, 'formula1_avus_1959_result'),
    ('avus', 'metric', 2, 'Итоговые круги', '60', 'Сводный протокол двух заездов', NULL, 'formula1_avus_1959_result'),
    ('avus', 'metric', 3, 'Победитель', 'Тони Брукс', 'Ferrari', NULL, 'formula1_avus_1959_result'),
    ('avus', 'stat_bar', 1, 'Год визита чемпионата мира', '1959', NULL, 'debut', 'formula1_avus_history'),
    ('avus', 'stat_bar', 2, 'Зачётные заезды', '2', 'Единственный такой этап в истории чемпионата мира', NULL, 'formula1_avus_history'),
    ('avus', 'stat_bar', 3, 'Итоговые круги', '60', 'Гран-при Германии 1959 года', NULL, 'formula1_avus_1959_result'),

    ('brands_hatch', 'highlight', 1, '14 этапов чемпионата мира', NULL, NULL, NULL, 'formula1_brands_hatch_history'),
    ('brands_hatch', 'highlight', 2, 'Последний Гран-при · 1986', NULL, NULL, NULL, 'formula1_brands_hatch_history'),
    ('brands_hatch', 'metric', 1, 'Первый этап чемпионата мира', '1964', NULL, NULL, 'formula1_brands_hatch_history'),
    ('brands_hatch', 'metric', 2, 'Последний этап чемпионата мира', '1986', NULL, NULL, 'formula1_brands_hatch_history'),
    ('brands_hatch', 'metric', 3, 'Этапы чемпионата мира', '14', NULL, NULL, 'formula1_brands_hatch_history'),
    ('brands_hatch', 'stat_bar', 1, 'Первый этап чемпионата мира', '1964', NULL, 'debut', 'formula1_brands_hatch_history'),
    ('brands_hatch', 'stat_bar', 2, 'Круги', '80', 'Гран-при Великобритании 1964 года', NULL, 'formula1_brands_hatch_1964_result'),
    ('brands_hatch', 'stat_bar', 3, 'Круги', '75', 'Гран-при Великобритании 1986 года', NULL, 'formula1_brands_hatch_1986_result'),
    ('brands_hatch', 'stat_bar', 4, 'Этапы чемпионата мира', '14', NULL, NULL, 'formula1_brands_hatch_history'),

    ('bremgarten', 'highlight', 1, '42 круга · 1950', NULL, 'Гран-при Швейцарии', NULL, 'formula1_bremgarten_1950_result'),
    ('bremgarten', 'highlight', 2, '66 кругов · 1954', NULL, 'Гран-при Швейцарии', NULL, 'formula1_bremgarten_1954_result'),
    ('bremgarten', 'metric', 1, 'Этап чемпионата мира', '1950', '4 июня', NULL, 'formula1_bremgarten_1950_result'),
    ('bremgarten', 'metric', 2, 'Круги', '42', 'Гран-при Швейцарии 1950 года', NULL, 'formula1_bremgarten_1950_result'),
    ('bremgarten', 'metric', 3, 'Этап чемпионата мира', '1954', '22 августа', NULL, 'formula1_bremgarten_1954_result'),
    ('bremgarten', 'metric', 4, 'Круги', '66', 'Гран-при Швейцарии 1954 года', NULL, 'formula1_bremgarten_1954_result'),
    ('bremgarten', 'stat_bar', 1, 'Год этапа', '1950', 'Гран-при Швейцарии', 'debut', 'formula1_bremgarten_1950_result'),
    ('bremgarten', 'stat_bar', 2, 'Год этапа', '1954', 'Гран-при Швейцарии', NULL, 'formula1_bremgarten_1954_result');

DELETE FROM atlas.circuit_history_entries
WHERE circuit_id IN ('ain-diab', 'anderstorp', 'avus', 'brands_hatch', 'bremgarten');

INSERT INTO atlas.circuit_history_entries (
    id, circuit_id, sort_order, year_label, title_ru, description_ru,
    media_asset_id, source_id
) VALUES
    ('ain-diab-1958', 'ain-diab', 1, '19 октября 1958', 'Гран-при Марокко',
     'Гонку чемпионата мира на Ain-Diab Circuit выиграл Стирлинг Мосс на Vanwall',
     NULL, 'formula1_ain_diab_1958_result'),

    ('anderstorp-1973', 'anderstorp', 1, '17 июня 1973', 'Гран-при Швеции 1973 года',
     'Этап чемпионата мира в Андерсторпе выиграл Денни Халм; Ронни Петерсон финишировал вторым',
     NULL, 'formula1_anderstorp_1973_result'),
    ('anderstorp-1978', 'anderstorp', 2, '17 июня 1978', 'Победа Brabham BT46B',
     'Ники Лауда выиграл финальный шведский этап на Brabham BT46B, известном как «fan car»',
     NULL, 'formula1_anderstorp_history'),

    ('avus-1959', 'avus', 1, '1959', 'Единственный этап чемпионата мира',
     'Гран-при Германии провели в два заезда; Тони Брукс выиграл оба и занял первое место в общем зачёте',
     NULL, 'formula1_avus_history'),

    ('brands-hatch-1964', 'brands_hatch', 1, '11 июля 1964', 'Гран-при Великобритании 1964 года',
     'Джим Кларк выиграл гонку на Брэндс-Хэтче, пройдя все 80 кругов',
     NULL, 'formula1_brands_hatch_1964_result'),
    ('brands-hatch-1986', 'brands_hatch', 2, '1986', 'Последний Гран-при на трассе',
     'Найджел Мэнселл выиграл последнюю гонку чемпионата мира на Брэндс-Хэтче',
     NULL, 'formula1_brands_hatch_history'),

    ('bremgarten-1950', 'bremgarten', 1, '4 июня 1950', 'Гран-при Швейцарии 1950 года',
     'Нино Фарина выиграл 42-круговую гонку чемпионата мира в Бремгартене',
     NULL, 'formula1_bremgarten_1950_result'),
    ('bremgarten-1954', 'bremgarten', 2, '22 августа 1954', 'Гран-при Швейцарии 1954 года',
     'Хуан Мануэль Фанхио выиграл 66-круговую гонку за Mercedes-Benz',
     NULL, 'formula1_bremgarten_1954_result');

COMMIT;
