BEGIN;

INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    (
        'formula1_montreal_2026_guide',
        'Formula 1 — Circuit Gilles Villeneuve guide 2026',
        'https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-circuit-gilles-villeneuve.5RUqO9YE80jmCiuODWNX9g',
        'Official website', '2026-08-30T00:00:00Z',
        'Актуальная конфигурация 2026: длина, повороты, круги, рекорд и характер трассы'
    ),
    (
        'formula1_monaco_2026_guide',
        'Formula 1 — Circuit de Monaco guide 2026',
        'https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-circuit-de-monaco.vFsmfGHr6RWyLFtxi58wi',
        'Official website', '2026-08-30T00:00:00Z',
        'Актуальная конфигурация 2026: длина, повороты, круги, рекорд и городское расположение'
    ),
    (
        'formula1_barcelona_2026_guide',
        'Formula 1 — Circuit de Barcelona-Catalunya guide 2026',
        'https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-circuit-de-barcelona-catalunya.7i1UoRE8Za0Jk4LI0r68qk.7i1UoRE8Za0Jk4LI0r68qk',
        'Official website', '2026-08-30T00:00:00Z',
        'Актуальная конфигурация 2026 без финальной шиканы: длина, повороты, круги и рекорд'
    ),
    (
        'formula1_red_bull_ring_2026_guide',
        'Formula 1 — Red Bull Ring guide 2026',
        'https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-red-bull-ring.76j6twpa7Be26Prj6fO90F',
        'Official website', '2026-08-30T00:00:00Z',
        'Актуальная конфигурация 2026: длина, повороты, круги, рекорд и история площадки'
    )
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Полустационарная трасса по парковым дорогам острова Нотр-Дам с длинными прямыми, тяжёлыми торможениями и тесными шиканами.',
    circuit_type_ru = 'Полустационарная трасса', updated_at = now()
WHERE circuit_id = 'villeneuve' AND editorial_status = 'draft';

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Городская трасса по узким улицам Монте-Карло с 19 поворотами, минимальными зонами вылета и самым коротким кругом календаря 2026 года.',
    circuit_type_ru = 'Городская трасса', updated_at = now()
WHERE circuit_id = 'monaco' AND editorial_status = 'draft';

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Стационарная трасса с сочетанием быстрых и медленных поворотов; с 2023 года Формула-1 использует конфигурацию без финальной шиканы.',
    circuit_type_ru = 'Стационарная трасса', updated_at = now()
WHERE circuit_id = 'catalunya' AND editorial_status = 'draft';

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Короткая стационарная трасса в Штирии с выраженным рельефом, тремя прямыми в первой половине круга и быстрым спуском во второй.',
    circuit_type_ru = 'Стационарная трасса', updated_at = now()
WHERE circuit_id = 'red_bull_ring' AND editorial_status = 'draft';

INSERT INTO atlas.circuit_page_profile_field_sources (
    circuit_id, field_name, source_id, editorial_status, verified_at
) VALUES
    ('villeneuve', 'summary_ru', 'formula1_montreal_2026_guide', 'verified', now()),
    ('villeneuve', 'circuit_type_ru', 'formula1_montreal_2026_guide', 'verified', now()),
    ('monaco', 'summary_ru', 'formula1_monaco_2026_guide', 'verified', now()),
    ('monaco', 'circuit_type_ru', 'formula1_monaco_2026_guide', 'verified', now()),
    ('catalunya', 'summary_ru', 'formula1_barcelona_2026_guide', 'verified', now()),
    ('catalunya', 'circuit_type_ru', 'formula1_barcelona_2026_guide', 'verified', now()),
    ('red_bull_ring', 'summary_ru', 'formula1_red_bull_ring_2026_guide', 'verified', now()),
    ('red_bull_ring', 'circuit_type_ru', 'formula1_red_bull_ring_2026_guide', 'verified', now())
ON CONFLICT (circuit_id, field_name) DO UPDATE SET
    source_id = EXCLUDED.source_id,
    editorial_status = EXCLUDED.editorial_status,
    verified_at = EXCLUDED.verified_at;

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('villeneuve', 'monaco', 'catalunya', 'red_bull_ring');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('villeneuve', 'highlight', 1, '14 поворотов', NULL, NULL, NULL, 'formula1_montreal_2026_guide'),
    ('villeneuve', 'highlight', 2, 'Полустационарная трасса', NULL, NULL, NULL, 'formula1_montreal_2026_guide'),
    ('villeneuve', 'metric', 1, 'Длина', '4,361 км', NULL, NULL, 'formula1_montreal_2026_guide'),
    ('villeneuve', 'metric', 2, 'Круги', '70', NULL, NULL, 'formula1_montreal_2026_guide'),
    ('villeneuve', 'metric', 3, 'Повороты', '14', NULL, NULL, 'formula1_montreal_2026_guide'),
    ('villeneuve', 'metric', 4, 'Дебют', '1978', NULL, NULL, 'formula1_montreal_2026_guide'),
    ('villeneuve', 'stat_bar', 1, 'Длина трассы', '4,361 км', NULL, 'length', 'formula1_montreal_2026_guide'),
    ('villeneuve', 'stat_bar', 2, 'Повороты', '14', NULL, 'turns', 'formula1_montreal_2026_guide'),
    ('villeneuve', 'stat_bar', 3, 'Дебют в F1', '1978', NULL, 'debut', 'formula1_montreal_2026_guide'),
    ('villeneuve', 'stat_bar', 4, 'Рекорд круга F1', '1:13.078', 'Валттери Боттас · 2019', 'record', 'formula1_montreal_2026_guide'),
    ('villeneuve', 'stat_bar', 5, 'Тип трассы', 'Полустационарная', NULL, 'type', 'formula1_montreal_2026_guide'),

    ('monaco', 'highlight', 1, '19 поворотов', NULL, NULL, NULL, 'formula1_monaco_2026_guide'),
    ('monaco', 'highlight', 2, 'Городская трасса', NULL, NULL, NULL, 'formula1_monaco_2026_guide'),
    ('monaco', 'metric', 1, 'Длина', '3,337 км', NULL, NULL, 'formula1_monaco_2026_guide'),
    ('monaco', 'metric', 2, 'Круги', '78', NULL, NULL, 'formula1_monaco_2026_guide'),
    ('monaco', 'metric', 3, 'Повороты', '19', NULL, NULL, 'formula1_monaco_2026_guide'),
    ('monaco', 'metric', 4, 'Дебют', '1950', NULL, NULL, 'formula1_monaco_2026_guide'),
    ('monaco', 'stat_bar', 1, 'Длина трассы', '3,337 км', NULL, 'length', 'formula1_monaco_2026_guide'),
    ('monaco', 'stat_bar', 2, 'Повороты', '19', NULL, 'turns', 'formula1_monaco_2026_guide'),
    ('monaco', 'stat_bar', 3, 'Дебют в F1', '1950', NULL, 'debut', 'formula1_monaco_2026_guide'),
    ('monaco', 'stat_bar', 4, 'Рекорд круга F1', '1:12.909', 'Льюис Хэмилтон · 2021', 'record', 'formula1_monaco_2026_guide'),
    ('monaco', 'stat_bar', 5, 'Тип трассы', 'Городская', NULL, 'type', 'formula1_monaco_2026_guide'),

    ('catalunya', 'highlight', 1, '14 поворотов', NULL, NULL, NULL, 'formula1_barcelona_2026_guide'),
    ('catalunya', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_barcelona_2026_guide'),
    ('catalunya', 'metric', 1, 'Длина', '4,657 км', NULL, NULL, 'formula1_barcelona_2026_guide'),
    ('catalunya', 'metric', 2, 'Круги', '66', NULL, NULL, 'formula1_barcelona_2026_guide'),
    ('catalunya', 'metric', 3, 'Повороты', '14', NULL, NULL, 'formula1_barcelona_2026_guide'),
    ('catalunya', 'metric', 4, 'Дебют', '1991', NULL, NULL, 'formula1_barcelona_2026_guide'),
    ('catalunya', 'stat_bar', 1, 'Длина трассы', '4,657 км', NULL, 'length', 'formula1_barcelona_2026_guide'),
    ('catalunya', 'stat_bar', 2, 'Повороты', '14', NULL, 'turns', 'formula1_barcelona_2026_guide'),
    ('catalunya', 'stat_bar', 3, 'Дебют в F1', '1991', NULL, 'debut', 'formula1_barcelona_2026_guide'),
    ('catalunya', 'stat_bar', 4, 'Рекорд круга F1', '1:15.743', 'Оскар Пиастри · 2025', 'record', 'formula1_barcelona_2026_guide'),
    ('catalunya', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_barcelona_2026_guide'),

    ('red_bull_ring', 'highlight', 1, '10 поворотов', NULL, NULL, NULL, 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'metric', 1, 'Длина', '4,326 км', NULL, NULL, 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'metric', 2, 'Круги', '71', NULL, NULL, 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'metric', 3, 'Повороты', '10', NULL, NULL, 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'metric', 4, 'Дебют', '1970', NULL, NULL, 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'stat_bar', 1, 'Длина трассы', '4,326 км', NULL, 'length', 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'stat_bar', 2, 'Повороты', '10', NULL, 'turns', 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'stat_bar', 3, 'Дебют в F1', '1970', NULL, 'debut', 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'stat_bar', 4, 'Рекорд круга F1', '1:07.924', 'Оскар Пиастри · 2025', 'record', 'formula1_red_bull_ring_2026_guide'),
    ('red_bull_ring', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_red_bull_ring_2026_guide');

COMMIT;
