BEGIN;

-- Редакционный пакет 05: официальные показатели конфигураций и история площадок.
-- Дата доступа ко всем источникам: 2026-09-20.
INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('formula1_rodriguez_history', 'Formula 1 — Mexico: Autodromo Hermanos Rodriguez',
     'https://www.formula1.com/en/information/mexico-autodromo-hermanos-rodriguez-mexico-city.1K2WPfBcI8kTXjcTHcbsBM',
     'Official website', '2026-09-20T00:00:00Z',
     'Строительство площадки в 1959 году, внезачётная гонка 1962 года и первый этап чемпионата мира в 1963 году; уверенность высокая'),
    ('formula1_losail_history', 'Formula 1 — Qatar Grand Prix 2021',
     'https://www.formula1.com/en/racing/2021/qatar',
     'Official website', '2026-09-20T00:00:00Z',
     'Открытие трассы для мотогонок в 2004 году и первый этап чемпионата мира Формулы-1 в 2021 году; уверенность высокая'),
    ('formula1_sepang_return_2026', 'Formula 1 — Malaysia to host the 2026 Bahrain Grand Prix',
     'https://www.formula1.com/en/latest/article/formula-1-and-fia-confirm-formula-1-and-fia-confirm-malaysia-will-join-2026-calendar-as-host-venue-for-the-bahrain-grand-prix.6lL7vjFEM2VVynRHvg1TCf',
     'Official website', '2026-09-20T00:00:00Z',
     'Совместное подтверждение Formula 1 и FIA о возвращении Сепанга в календарь 2026 года после последнего этапа в 2017 году; уверенность высокая'),
    ('formula1_portimao_2020', 'Formula 1 — Portuguese Grand Prix 2020',
     'https://www.formula1.com/en/racing/2020/portugal',
     'Official website', '2026-09-20T00:00:00Z',
     'Параметры конфигурации этапа 2020 года, открытие автодрома осенью 2008 года и дебют площадки в чемпионате мира в 2020 году; уверенность высокая'),
    ('formula1_portimao_2020_result', 'Formula 1 — Portuguese Grand Prix 2020 race result',
     'https://www.formula1.com/en/results/2020/races/1056/portugal/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный результат гонки 25 октября 2020 года на Algarve International Circuit; уверенность высокая'),
    ('formula1_adelaide_overview', 'Formula 1 — Australian Grand Prix circuit guide 2026',
     'https://www.formula1.com/en/latest/article/circuit-guide-2026-australian-grand-prix-albert-park.19zPlhKhMbTaVNFIPKAAMa.19zPlhKhMbTaVNFIPKAAMa',
     'Official website', '2026-09-20T00:00:00Z',
     'Период проведения австралийского этапа чемпионата мира в Аделаиде с 1985 по 1995 год и перенос в Мельбурн в 1996 году; уверенность высокая'),
    ('formula1_adelaide_statistics', 'Formula 1 — Vital statistics: the Australian Grand Prix',
     'https://www.formula1.com/en/latest/article/vital-statistics-the-australian-grand-prix.2sAFlj9RRWYA3tqZGpOuac',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальное указание на 11 этапов чемпионата мира в Аделаиде и победу Кеке Росберга в дебютной гонке 1985 года; уверенность высокая'),
    ('formula1_adelaide_1985_result', 'Formula 1 — Australian Grand Prix 1985 race result',
     'https://www.formula1.com/en/results/1985/races/497/australia/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный результат первого этапа чемпионата мира на Adelaide Street Circuit 3 ноября 1985 года; уверенность высокая'),
    ('formula1_adelaide_1995_result', 'Formula 1 — Australian Grand Prix 1995 race result',
     'https://www.formula1.com/en/results/1995/races/637/australia/race-result',
     'Official website', '2026-09-20T00:00:00Z',
     'Официальный результат последнего этапа чемпионата мира на Adelaide Street Circuit 12 ноября 1995 года; уверенность высокая')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

-- Источники показателей заведены пакетами 011 и 012. Здесь фиксируются
-- дата повторной проверки, временная привязка конфигурации и уверенность.
UPDATE atlas.data_sources SET
    retrieved_at = '2026-09-20T00:00:00Z',
    notes = CASE id
        WHEN 'formula1_mexico_2026' THEN 'Параметры Autodromo Hermanos Rodriguez для этапа 2026 года; уверенность высокая'
        WHEN 'formula1_mexico_turns' THEN 'Официальное подтверждение 17 поворотов в конфигурации этапа 2024 года; уверенность высокая'
        WHEN 'formula1_losail_2026' THEN 'Параметры Lusail International Circuit для этапа 2026 года; уверенность высокая'
        WHEN 'formula1_losail_turns' THEN 'Официальное подтверждение 16 поворотов и стационарного типа трассы для дебютного этапа 2021 года; уверенность высокая'
        WHEN 'formula1_sepang_2026' THEN 'Параметры Sepang International Circuit для этапа 2026 года и история дебюта площадки в 1999 году; уверенность высокая'
    END
WHERE id IN (
    'formula1_mexico_2026', 'formula1_mexico_turns',
    'formula1_losail_2026', 'formula1_losail_turns',
    'formula1_sepang_2026'
);

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('rodriguez', 'losail', 'sepang', 'portimao', 'adelaide');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('rodriguez', 'highlight', 1, '17 поворотов · 2024', NULL, NULL, NULL, 'formula1_mexico_turns'),
    ('rodriguez', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_mexico_2026'),
    ('rodriguez', 'metric', 1, 'Длина', '4,304 км', 'Конфигурация этапа 2026', NULL, 'formula1_mexico_2026'),
    ('rodriguez', 'metric', 2, 'Круги', '71', 'Этап 2026', NULL, 'formula1_mexico_2026'),
    ('rodriguez', 'metric', 3, 'Повороты', '17', 'Конфигурация этапа 2024', NULL, 'formula1_mexico_turns'),
    ('rodriguez', 'metric', 4, 'Дебют площадки в чемпионате мира', '1963', NULL, NULL, 'formula1_mexico_2026'),
    ('rodriguez', 'stat_bar', 1, 'Длина трассы', '4,304 км', 'Конфигурация этапа 2026', 'length', 'formula1_mexico_2026'),
    ('rodriguez', 'stat_bar', 2, 'Повороты', '17', 'Конфигурация этапа 2024', 'turns', 'formula1_mexico_turns'),
    ('rodriguez', 'stat_bar', 3, 'Дебют площадки в чемпионате мира', '1963', NULL, 'debut', 'formula1_mexico_2026'),
    ('rodriguez', 'stat_bar', 4, 'Рекорд круга F1', '1:17.774', 'Валттери Боттас · 2021', 'record', 'formula1_mexico_2026'),
    ('rodriguez', 'stat_bar', 5, 'Тип трассы', 'Стационарная', 'Этап 2026', 'type', 'formula1_mexico_2026'),

    ('losail', 'highlight', 1, '16 поворотов · 2021', NULL, NULL, NULL, 'formula1_losail_turns'),
    ('losail', 'highlight', 2, 'Стационарная трасса', NULL, 'По официальному описанию дебютного этапа 2021', NULL, 'formula1_losail_turns'),
    ('losail', 'metric', 1, 'Длина', '5,419 км', 'Конфигурация этапа 2026', NULL, 'formula1_losail_2026'),
    ('losail', 'metric', 2, 'Круги', '57', 'Этап 2026', NULL, 'formula1_losail_2026'),
    ('losail', 'metric', 3, 'Повороты', '16', 'Конфигурация дебютного этапа 2021', NULL, 'formula1_losail_turns'),
    ('losail', 'metric', 4, 'Дебют площадки в чемпионате мира', '2021', NULL, NULL, 'formula1_losail_2026'),
    ('losail', 'stat_bar', 1, 'Длина трассы', '5,419 км', 'Конфигурация этапа 2026', 'length', 'formula1_losail_2026'),
    ('losail', 'stat_bar', 2, 'Повороты', '16', 'Конфигурация дебютного этапа 2021', 'turns', 'formula1_losail_turns'),
    ('losail', 'stat_bar', 3, 'Дебют площадки в чемпионате мира', '2021', NULL, 'debut', 'formula1_losail_2026'),
    ('losail', 'stat_bar', 4, 'Рекорд круга F1', '1:22.384', 'Ландо Норрис · 2024', 'record', 'formula1_losail_2026'),
    ('losail', 'stat_bar', 5, 'Тип трассы', 'Стационарная', 'По официальному описанию дебютного этапа 2021', 'type', 'formula1_losail_turns'),

    ('sepang', 'highlight', 1, '15 поворотов', NULL, 'Конфигурация этапа 2026', NULL, 'formula1_sepang_2026'),
    ('sepang', 'highlight', 2, 'Стационарная трасса', NULL, 'Этап 2026', NULL, 'formula1_sepang_2026'),
    ('sepang', 'metric', 1, 'Длина', '5,543 км', 'Конфигурация этапа 2026', NULL, 'formula1_sepang_2026'),
    ('sepang', 'metric', 2, 'Круги', '56', 'Этап 2026', NULL, 'formula1_sepang_2026'),
    ('sepang', 'metric', 3, 'Повороты', '15', 'Конфигурация этапа 2026', NULL, 'formula1_sepang_2026'),
    ('sepang', 'metric', 4, 'Дебют площадки в чемпионате мира', '1999', NULL, NULL, 'formula1_sepang_2026'),
    ('sepang', 'stat_bar', 1, 'Длина трассы', '5,543 км', 'Конфигурация этапа 2026', 'length', 'formula1_sepang_2026'),
    ('sepang', 'stat_bar', 2, 'Повороты', '15', 'Конфигурация этапа 2026', 'turns', 'formula1_sepang_2026'),
    ('sepang', 'stat_bar', 3, 'Дебют площадки в чемпионате мира', '1999', NULL, 'debut', 'formula1_sepang_2026'),
    ('sepang', 'stat_bar', 4, 'Рекорд круга F1', '1:34.080', 'Себастьян Феттель · 2017', 'record', 'formula1_sepang_2026'),
    ('sepang', 'stat_bar', 5, 'Тип трассы', 'Стационарная', 'Этап 2026', 'type', 'formula1_sepang_2026'),

    ('portimao', 'highlight', 1, 'Конфигурация этапа 2020', NULL, NULL, NULL, 'formula1_portimao_2020'),
    ('portimao', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_portimao_2020'),
    ('portimao', 'metric', 1, 'Длина', '4,653 км', 'Конфигурация этапа 2020', NULL, 'formula1_portimao_2020'),
    ('portimao', 'metric', 2, 'Круги', '66', 'Этап 2020', NULL, 'formula1_portimao_2020'),
    ('portimao', 'metric', 3, 'Дебют площадки в чемпионате мира', '2020', NULL, NULL, 'formula1_portimao_2020'),
    ('portimao', 'stat_bar', 1, 'Длина трассы', '4,653 км', 'Конфигурация этапа 2020', 'length', 'formula1_portimao_2020'),
    ('portimao', 'stat_bar', 2, 'Дебют площадки в чемпионате мира', '2020', NULL, 'debut', 'formula1_portimao_2020'),
    ('portimao', 'stat_bar', 3, 'Рекорд круга F1', '1:18.750', 'Льюис Хэмилтон · 2020', 'record', 'formula1_portimao_2020'),
    ('portimao', 'stat_bar', 4, 'Тип трассы', 'Стационарная', 'По официальному описанию этапа 2020', 'type', 'formula1_portimao_2020'),

    ('adelaide', 'highlight', 1, '11 этапов чемпионата мира', NULL, NULL, NULL, 'formula1_adelaide_statistics'),
    ('adelaide', 'highlight', 2, '1985–1995 в календаре', NULL, NULL, NULL, 'formula1_adelaide_overview'),
    ('adelaide', 'metric', 1, 'Дебют площадки в чемпионате мира', '1985', NULL, NULL, 'formula1_adelaide_statistics'),
    ('adelaide', 'metric', 2, 'Последний этап чемпионата мира', '1995', NULL, NULL, 'formula1_adelaide_overview'),
    ('adelaide', 'metric', 3, 'Этапы чемпионата мира', '11', NULL, NULL, 'formula1_adelaide_statistics'),
    ('adelaide', 'stat_bar', 1, 'Дебют площадки в чемпионате мира', '1985', NULL, 'debut', 'formula1_adelaide_statistics'),
    ('adelaide', 'stat_bar', 2, 'Последний этап чемпионата мира', '1995', NULL, NULL, 'formula1_adelaide_overview'),
    ('adelaide', 'stat_bar', 3, 'Этапы чемпионата мира', '11', NULL, NULL, 'formula1_adelaide_statistics');

DELETE FROM atlas.circuit_history_entries
WHERE circuit_id IN ('rodriguez', 'losail', 'sepang', 'portimao', 'adelaide');

INSERT INTO atlas.circuit_history_entries (
    id, circuit_id, sort_order, year_label, title_ru, description_ru,
    media_asset_id, source_id
) VALUES
    ('rodriguez-1959', 'rodriguez', 1, '1959', 'Строительство автодрома',
     'Трассу проложили по внутренним дорогам спортивного комплекса Magdalena Mixhuca в Мехико',
     NULL, 'formula1_rodriguez_history'),
    ('rodriguez-1963', 'rodriguez', 2, '1963', 'Первый зачётный Гран-при Мексики',
     'После внезачётной гонки 1962 года площадка впервые приняла этап чемпионата мира; победил Джим Кларк',
     NULL, 'formula1_rodriguez_history'),

    ('losail-2004', 'losail', 1, '2004', 'Открытие трассы',
     'Автодром, изначально построенный для мотогонок, открылся первым этапом MotoGP в Катаре',
     NULL, 'formula1_losail_history'),
    ('losail-2021', 'losail', 2, '2021', 'Первый этап Формулы-1 в Катаре',
     'Lusail International Circuit впервые принял этап чемпионата мира Формулы-1; гонку выиграл Льюис Хэмилтон',
     NULL, 'formula1_losail_history'),

    ('sepang-1999', 'sepang', 1, '1999', 'Дебют площадки в чемпионате мира',
     'Sepang International Circuit открылся и впервые принял этап Формулы-1; гонку выиграл Эдди Ирвайн',
     NULL, 'formula1_sepang_2026'),
    ('sepang-2026', 'sepang', 2, '2026', 'Подтверждение возвращения',
     'Formula 1 и FIA подтвердили Сепанг как площадку перенесённого Гран-при Бахрейна после последнего малайзийского этапа в 2017 году',
     NULL, 'formula1_sepang_return_2026'),

    ('portimao-2008', 'portimao', 1, 'Осень 2008', 'Открытие автодрома',
     'Стационарную площадку Algarve International Circuit открыли после семи месяцев строительства',
     NULL, 'formula1_portimao_2020'),
    ('portimao-2020', 'portimao', 2, '25 октября 2020', 'Первый этап чемпионата мира',
     'Площадка впервые приняла зачётный Гран-при Португалии; гонку выиграл Льюис Хэмилтон',
     NULL, 'formula1_portimao_2020_result'),

    ('adelaide-1985', 'adelaide', 1, '3 ноября 1985', 'Гран-при Австралии 1985 года',
     'Гонку чемпионата мира на Adelaide Street Circuit выиграл Кеке Росберг',
     NULL, 'formula1_adelaide_1985_result'),
    ('adelaide-1995', 'adelaide', 2, '12 ноября 1995', 'Гран-при Австралии 1995 года',
     'Гонку чемпионата мира на Adelaide Street Circuit выиграл Деймон Хилл',
     NULL, 'formula1_adelaide_1995_result');

COMMIT;
