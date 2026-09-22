BEGIN;

-- Редакционный пакет 04: показатели конфигураций и краткая история площадок.
-- Дата доступа ко всем источникам: 2026-09-20.
INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('formula1_miami_history', 'Formula 1 — Miami Grand Prix 2022',
     'https://www.formula1.com/en/racing/2022/miami',
     'Official website', '2026-09-20T00:00:00Z',
     'Разработка временной трассы у Hard Rock Stadium и первый этап Формулы-1 8 мая 2022 года; уверенность высокая'),
    ('formula1_villeneuve_history', 'Formula 1 — Canada preview 2018',
     'https://www.formula1.com/en/latest/article/canada-preview-the-stats-and-info-you-need-to-know.YOjSe1xmIUUsmYM4ogEAc',
     'Official website', '2026-09-20T00:00:00Z',
     'Первый этап на острове Нотр-Дам в октябре 1978 года и переименование трассы в 1982 году; уверенность высокая'),
    ('formula1_baku_history', 'Formula 1 — Azerbaijan: Baku City Circuit',
     'https://www.formula1.com/en/information/azerbaijan-baku-city-circuit-baku.5KEzWNQG1x2nLSpfg5xBZh',
     'Official website', '2026-09-20T00:00:00Z',
     'Первый этап в Баку под названием Гран-при Европы в 2016 году и первый Гран-при Азербайджана в 2017 году; уверенность высокая'),
    ('formula1_vegas_announcement', 'Formula 1 — Las Vegas to host a night race from 2023',
     'https://www.formula1.com/en/latest/article/breaking-las-vegas-to-host-formula-1-night-race-from-2023.69O9nKLwKraqAhR5rr8TQg',
     'Official website', '2026-09-20T00:00:00Z',
     'Объявление 31 марта 2022 года о новой городской трассе по Лас-Вегас-Стрип; уверенность высокая'),
    ('formula1_vegas_history', 'Formula 1 — Las Vegas Grand Prix 2023',
     'https://www.formula1.com/en/racing/2023/las-vegas',
     'Official website', '2026-09-20T00:00:00Z',
     'Первый этап на Las Vegas Strip Circuit в 2023 году и официальный результат гонки; уверенность высокая')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

-- Источники показателей заведены пакетами 008, 009, 011 и 012. Здесь
-- фиксируются свежая дата доступа и редакционная оценка уверенности.
UPDATE atlas.data_sources SET
    retrieved_at = '2026-09-20T00:00:00Z',
    notes = CASE id
        WHEN 'formula1_shanghai_2026_guide' THEN 'Параметры конфигурации и этапа 2026, история дебюта и возвращения площадки; уверенность высокая'
        WHEN 'formula1_miami_2026' THEN 'Параметры Miami International Autodrome для этапа 2026; уверенность высокая'
        WHEN 'formula1_montreal_2026_guide' THEN 'Параметры Circuit Gilles-Villeneuve для этапа 2026; уверенность высокая'
        WHEN 'formula1_baku_2026' THEN 'Параметры Baku City Circuit для этапа 2026; уверенность высокая'
        WHEN 'formula1_vegas_2026' THEN 'Параметры Las Vegas Strip Circuit для этапа 2026; уверенность высокая'
        WHEN 'formula1_vegas_turns' THEN 'Официальное подтверждение 17 поворотов и городского типа трассы; уверенность высокая'
    END
WHERE id IN (
    'formula1_shanghai_2026_guide', 'formula1_miami_2026',
    'formula1_montreal_2026_guide', 'formula1_baku_2026',
    'formula1_vegas_2026', 'formula1_vegas_turns'
);

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('shanghai', 'miami', 'villeneuve', 'baku', 'vegas');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('shanghai', 'highlight', 1, '16 поворотов', NULL, NULL, NULL, 'formula1_shanghai_2026_guide'),
    ('shanghai', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_shanghai_2026_guide'),
    ('shanghai', 'metric', 1, 'Длина', '5,451 км', NULL, NULL, 'formula1_shanghai_2026_guide'),
    ('shanghai', 'metric', 2, 'Круги', '56', NULL, NULL, 'formula1_shanghai_2026_guide'),
    ('shanghai', 'metric', 3, 'Повороты', '16', NULL, NULL, 'formula1_shanghai_2026_guide'),
    ('shanghai', 'metric', 4, 'Дебют площадки в F1', '2004', NULL, NULL, 'formula1_shanghai_2026_guide'),
    ('shanghai', 'stat_bar', 1, 'Длина трассы', '5,451 км', NULL, 'length', 'formula1_shanghai_2026_guide'),
    ('shanghai', 'stat_bar', 2, 'Повороты', '16', NULL, 'turns', 'formula1_shanghai_2026_guide'),
    ('shanghai', 'stat_bar', 3, 'Дебют площадки в F1', '2004', NULL, 'debut', 'formula1_shanghai_2026_guide'),
    ('shanghai', 'stat_bar', 4, 'Рекорд круга F1', '1:32.238', 'Михаэль Шумахер · 2004', 'record', 'formula1_shanghai_2026_guide'),
    ('shanghai', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_shanghai_2026_guide'),

    ('miami', 'highlight', 1, '19 поворотов', NULL, NULL, NULL, 'formula1_miami_2026'),
    ('miami', 'highlight', 2, 'Временная трасса', NULL, NULL, NULL, 'formula1_miami_2026'),
    ('miami', 'metric', 1, 'Длина', '5,412 км', NULL, NULL, 'formula1_miami_2026'),
    ('miami', 'metric', 2, 'Круги', '57', NULL, NULL, 'formula1_miami_2026'),
    ('miami', 'metric', 3, 'Повороты', '19', NULL, NULL, 'formula1_miami_2026'),
    ('miami', 'metric', 4, 'Дебют площадки в F1', '2022', NULL, NULL, 'formula1_miami_2026'),
    ('miami', 'stat_bar', 1, 'Длина трассы', '5,412 км', NULL, 'length', 'formula1_miami_2026'),
    ('miami', 'stat_bar', 2, 'Повороты', '19', NULL, 'turns', 'formula1_miami_2026'),
    ('miami', 'stat_bar', 3, 'Дебют площадки в F1', '2022', NULL, 'debut', 'formula1_miami_2026'),
    ('miami', 'stat_bar', 4, 'Рекорд круга F1', '1:29.708', 'Макс Ферстаппен · 2023', 'record', 'formula1_miami_2026'),
    ('miami', 'stat_bar', 5, 'Тип трассы', 'Временная', NULL, 'type', 'formula1_miami_2026'),

    ('villeneuve', 'highlight', 1, '14 поворотов', NULL, NULL, NULL, 'formula1_montreal_2026_guide'),
    ('villeneuve', 'highlight', 2, 'Полустационарная трасса', NULL, NULL, NULL, 'formula1_montreal_2026_guide'),
    ('villeneuve', 'metric', 1, 'Длина', '4,361 км', NULL, NULL, 'formula1_montreal_2026_guide'),
    ('villeneuve', 'metric', 2, 'Круги', '70', NULL, NULL, 'formula1_montreal_2026_guide'),
    ('villeneuve', 'metric', 3, 'Повороты', '14', NULL, NULL, 'formula1_montreal_2026_guide'),
    ('villeneuve', 'metric', 4, 'Дебют площадки в F1', '1978', NULL, NULL, 'formula1_montreal_2026_guide'),
    ('villeneuve', 'stat_bar', 1, 'Длина трассы', '4,361 км', NULL, 'length', 'formula1_montreal_2026_guide'),
    ('villeneuve', 'stat_bar', 2, 'Повороты', '14', NULL, 'turns', 'formula1_montreal_2026_guide'),
    ('villeneuve', 'stat_bar', 3, 'Дебют площадки в F1', '1978', NULL, 'debut', 'formula1_montreal_2026_guide'),
    ('villeneuve', 'stat_bar', 4, 'Рекорд круга F1', '1:13.078', 'Валттери Боттас · 2019', 'record', 'formula1_montreal_2026_guide'),
    ('villeneuve', 'stat_bar', 5, 'Тип трассы', 'Полустационарная', NULL, 'type', 'formula1_montreal_2026_guide'),

    ('baku', 'highlight', 1, '20 поворотов', NULL, NULL, NULL, 'formula1_baku_2026'),
    ('baku', 'highlight', 2, 'Городская трасса', NULL, NULL, NULL, 'formula1_baku_2026'),
    ('baku', 'metric', 1, 'Длина', '6,003 км', NULL, NULL, 'formula1_baku_2026'),
    ('baku', 'metric', 2, 'Круги', '51', NULL, NULL, 'formula1_baku_2026'),
    ('baku', 'metric', 3, 'Повороты', '20', NULL, NULL, 'formula1_baku_2026'),
    ('baku', 'metric', 4, 'Дебют площадки в F1', '2016', NULL, NULL, 'formula1_baku_2026'),
    ('baku', 'stat_bar', 1, 'Длина трассы', '6,003 км', NULL, 'length', 'formula1_baku_2026'),
    ('baku', 'stat_bar', 2, 'Повороты', '20', NULL, 'turns', 'formula1_baku_2026'),
    ('baku', 'stat_bar', 3, 'Дебют площадки в F1', '2016', NULL, 'debut', 'formula1_baku_2026'),
    ('baku', 'stat_bar', 4, 'Рекорд круга F1', '1:43.009', 'Шарль Леклер · 2019', 'record', 'formula1_baku_2026'),
    ('baku', 'stat_bar', 5, 'Тип трассы', 'Городская', NULL, 'type', 'formula1_baku_2026'),

    ('vegas', 'highlight', 1, '17 поворотов', NULL, NULL, NULL, 'formula1_vegas_turns'),
    ('vegas', 'highlight', 2, 'Городская трасса', NULL, NULL, NULL, 'formula1_vegas_turns'),
    ('vegas', 'metric', 1, 'Длина', '6,201 км', NULL, NULL, 'formula1_vegas_2026'),
    ('vegas', 'metric', 2, 'Круги', '50', NULL, NULL, 'formula1_vegas_2026'),
    ('vegas', 'metric', 3, 'Повороты', '17', NULL, NULL, 'formula1_vegas_turns'),
    ('vegas', 'metric', 4, 'Дебют площадки в F1', '2023', NULL, NULL, 'formula1_vegas_2026'),
    ('vegas', 'stat_bar', 1, 'Длина трассы', '6,201 км', NULL, 'length', 'formula1_vegas_2026'),
    ('vegas', 'stat_bar', 2, 'Повороты', '17', NULL, 'turns', 'formula1_vegas_turns'),
    ('vegas', 'stat_bar', 3, 'Дебют площадки в F1', '2023', NULL, 'debut', 'formula1_vegas_2026'),
    ('vegas', 'stat_bar', 4, 'Рекорд круга F1', '1:33.365', 'Макс Ферстаппен · 2025', 'record', 'formula1_vegas_2026'),
    ('vegas', 'stat_bar', 5, 'Тип трассы', 'Городская', NULL, 'type', 'formula1_vegas_turns');

DELETE FROM atlas.circuit_history_entries
WHERE circuit_id IN ('shanghai', 'miami', 'villeneuve', 'baku', 'vegas');

INSERT INTO atlas.circuit_history_entries (
    id, circuit_id, sort_order, year_label, title_ru, description_ru,
    media_asset_id, source_id
) VALUES
    ('shanghai-2004', 'shanghai', 1, '2004', 'Дебют Гран-при Китая',
     'Новый автодром в Шанхае впервые принял этап чемпионата мира; гонку выиграл Рубенс Баррикелло',
     NULL, 'formula1_shanghai_2026_guide'),
    ('shanghai-2024', 'shanghai', 2, '2024', 'Возвращение в календарь',
     'После перерыва с 2020 по 2023 год Формула-1 вернулась на Shanghai International Circuit',
     NULL, 'formula1_shanghai_2026_guide'),

    ('miami-design', 'miami', 1, 'До 2022', 'Выбор конфигурации',
     'Перед строительством трассы у Hard Rock Stadium организаторы смоделировали 36 вариантов планировки',
     NULL, 'formula1_miami_history'),
    ('miami-2022', 'miami', 2, '8 мая 2022', 'Первый Гран-при Майами',
     'Первый этап чемпионата мира на Miami International Autodrome выиграл Макс Ферстаппен',
     NULL, 'formula1_miami_history'),

    ('villeneuve-1978', 'villeneuve', 1, 'Октябрь 1978', 'Первый Гран-при на острове Нотр-Дам',
     'Первый канадский этап на новой площадке выиграл Жиль Вильнёв — это была его первая победа в Формуле-1',
     NULL, 'formula1_villeneuve_history'),
    ('villeneuve-1982', 'villeneuve', 2, '1982', 'Имя Жиля Вильнёва',
     'После гибели канадского пилота трассу на острове Нотр-Дам переименовали в его честь',
     NULL, 'formula1_villeneuve_history'),

    ('baku-2016', 'baku', 1, '2016', 'Дебют под названием Гран-при Европы',
     'Городская трасса в Баку впервые приняла этап чемпионата мира под коммерческим названием Гран-при Европы',
     NULL, 'formula1_baku_history'),
    ('baku-2017', 'baku', 2, '2017', 'Первый Гран-при Азербайджана',
     'На той же площадке впервые прошёл Гран-при Азербайджана; победил Даниэль Риккардо',
     NULL, 'formula1_baku_history'),

    ('vegas-2022', 'vegas', 1, '31 марта 2022', 'Анонс трассы на Стрипе',
     'Formula 1 объявила о ночной городской гонке по Лас-Вегас-Стрип с дебютом в сезоне 2023 года',
     NULL, 'formula1_vegas_announcement'),
    ('vegas-2023', 'vegas', 2, '2023', 'Первый Гран-при на Strip Circuit',
     'Первую гонку чемпионата мира на новой городской трассе выиграл Макс Ферстаппен',
     NULL, 'formula1_vegas_history');

COMMIT;
