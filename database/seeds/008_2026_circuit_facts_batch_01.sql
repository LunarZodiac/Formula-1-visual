BEGIN;

INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    (
        'formula1_albert_park_2026_guide',
        'Formula 1 — Albert Park circuit guide 2026',
        'https://www.formula1.com/en/latest/article/circuit-guide-2026-australian-grand-prix-albert-park.19zPlhKhMbTaVNFIPKAAMa.19zPlhKhMbTaVNFIPKAAMa',
        'Official website', '2026-08-30T00:00:00Z',
        'Актуальная конфигурация 2026: длина, повороты, круги, рекорд и временный тип трассы'
    ),
    (
        'formula1_shanghai_2026_guide',
        'Formula 1 — Shanghai International Circuit guide 2026',
        'https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-shanghai-international.1b0f0ghbsPMRsHJoHTt6eB.1b0f0ghbsPMRsHJoHTt6eB',
        'Official website', '2026-08-30T00:00:00Z',
        'Актуальная конфигурация 2026: длина, повороты, круги, рекорд и стационарный тип трассы'
    ),
    (
        'formula1_suzuka_2026_guide',
        'Formula 1 — Suzuka circuit guide 2026',
        'https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-suzuka-circuit.2BbgsRdkeux78UBGbmYiZV.2BbgsRdkeux78UBGbmYiZV',
        'Official website', '2026-08-30T00:00:00Z',
        'Актуальная конфигурация 2026: длина, повороты, круги и рекорд; история трассы Honda'
    ),
    (
        'formula1_miami_2026',
        'Formula 1 — Miami Grand Prix 2026',
        'https://www.formula1.com/en/racing/2026/miami',
        'Official website', '2026-08-30T00:00:00Z',
        'Актуальная конфигурация 2026: длина, повороты, круги, рекорд и временный тип трассы'
    )
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Временная трасса по дорогам вокруг озера Альберт-Парк с быстрым современным профилем и 14 поворотами.',
    circuit_type_ru = 'Временная трасса',
    updated_at = now()
WHERE circuit_id = 'albert_park' AND editorial_status = 'draft';

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Стационарная трасса, построенная специально для Формулы-1, с техничным первым сектором и длинной прямой между 13-м и 14-м поворотами.',
    circuit_type_ru = 'Стационарная трасса',
    updated_at = now()
WHERE circuit_id = 'shanghai' AND editorial_status = 'draft';

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Стационарная трасса с уникальной конфигурацией в форме восьмёрки, созданная как испытательный полигон Honda.',
    circuit_type_ru = 'Стационарная трасса',
    updated_at = now()
WHERE circuit_id = 'suzuka' AND editorial_status = 'draft';

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Временная трасса вокруг стадиона Hard Rock с 19 поворотами и сочетанием скоростных и медленных участков.',
    circuit_type_ru = 'Временная трасса',
    updated_at = now()
WHERE circuit_id = 'miami' AND editorial_status = 'draft';

INSERT INTO atlas.circuit_page_profile_field_sources (
    circuit_id, field_name, source_id, editorial_status, verified_at
) VALUES
    ('albert_park', 'summary_ru', 'formula1_albert_park_2026_guide', 'verified', now()),
    ('albert_park', 'circuit_type_ru', 'formula1_albert_park_2026_guide', 'verified', now()),
    ('shanghai', 'summary_ru', 'formula1_shanghai_2026_guide', 'verified', now()),
    ('shanghai', 'circuit_type_ru', 'formula1_shanghai_2026_guide', 'verified', now()),
    ('suzuka', 'summary_ru', 'formula1_suzuka_2026_guide', 'verified', now()),
    ('suzuka', 'circuit_type_ru', 'formula1_suzuka_2026_guide', 'verified', now()),
    ('miami', 'summary_ru', 'formula1_miami_2026', 'verified', now()),
    ('miami', 'circuit_type_ru', 'formula1_miami_2026', 'verified', now())
ON CONFLICT (circuit_id, field_name) DO UPDATE SET
    source_id = EXCLUDED.source_id,
    editorial_status = EXCLUDED.editorial_status,
    verified_at = EXCLUDED.verified_at;

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('albert_park', 'shanghai', 'suzuka', 'miami');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('albert_park', 'highlight', 1, '14 поворотов', NULL, NULL, NULL, 'formula1_albert_park_2026_guide'),
    ('albert_park', 'highlight', 2, 'Временная трасса', NULL, NULL, NULL, 'formula1_albert_park_2026_guide'),
    ('albert_park', 'metric', 1, 'Длина', '5,278 км', NULL, NULL, 'formula1_albert_park_2026_guide'),
    ('albert_park', 'metric', 2, 'Круги', '58', NULL, NULL, 'formula1_albert_park_2026_guide'),
    ('albert_park', 'metric', 3, 'Повороты', '14', NULL, NULL, 'formula1_albert_park_2026_guide'),
    ('albert_park', 'metric', 4, 'Дебют', '1996', NULL, NULL, 'formula1_albert_park_2026_guide'),
    ('albert_park', 'stat_bar', 1, 'Длина трассы', '5,278 км', NULL, 'length', 'formula1_albert_park_2026_guide'),
    ('albert_park', 'stat_bar', 2, 'Повороты', '14', NULL, 'turns', 'formula1_albert_park_2026_guide'),
    ('albert_park', 'stat_bar', 3, 'Дебют в F1', '1996', NULL, 'debut', 'formula1_albert_park_2026_guide'),
    ('albert_park', 'stat_bar', 4, 'Рекорд круга F1', '1:19.813', 'Шарль Леклер · 2024', 'record', 'formula1_albert_park_2026_guide'),
    ('albert_park', 'stat_bar', 5, 'Тип трассы', 'Временная', NULL, 'type', 'formula1_albert_park_2026_guide'),

    ('shanghai', 'highlight', 1, '16 поворотов', NULL, NULL, NULL, 'formula1_shanghai_2026_guide'),
    ('shanghai', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_shanghai_2026_guide'),
    ('shanghai', 'metric', 1, 'Длина', '5,451 км', NULL, NULL, 'formula1_shanghai_2026_guide'),
    ('shanghai', 'metric', 2, 'Круги', '56', NULL, NULL, 'formula1_shanghai_2026_guide'),
    ('shanghai', 'metric', 3, 'Повороты', '16', NULL, NULL, 'formula1_shanghai_2026_guide'),
    ('shanghai', 'metric', 4, 'Дебют', '2004', NULL, NULL, 'formula1_shanghai_2026_guide'),
    ('shanghai', 'stat_bar', 1, 'Длина трассы', '5,451 км', NULL, 'length', 'formula1_shanghai_2026_guide'),
    ('shanghai', 'stat_bar', 2, 'Повороты', '16', NULL, 'turns', 'formula1_shanghai_2026_guide'),
    ('shanghai', 'stat_bar', 3, 'Дебют в F1', '2004', NULL, 'debut', 'formula1_shanghai_2026_guide'),
    ('shanghai', 'stat_bar', 4, 'Рекорд круга F1', '1:32.238', 'Михаэль Шумахер · 2004', 'record', 'formula1_shanghai_2026_guide'),
    ('shanghai', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_shanghai_2026_guide'),

    ('suzuka', 'highlight', 1, '18 поворотов', NULL, NULL, NULL, 'formula1_suzuka_2026_guide'),
    ('suzuka', 'highlight', 2, 'Конфигурация «восьмёрка»', NULL, NULL, NULL, 'formula1_suzuka_2026_guide'),
    ('suzuka', 'highlight', 3, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_suzuka_2026_guide'),
    ('suzuka', 'metric', 1, 'Длина', '5,807 км', NULL, NULL, 'formula1_suzuka_2026_guide'),
    ('suzuka', 'metric', 2, 'Круги', '53', NULL, NULL, 'formula1_suzuka_2026_guide'),
    ('suzuka', 'metric', 3, 'Повороты', '18', NULL, NULL, 'formula1_suzuka_2026_guide'),
    ('suzuka', 'metric', 4, 'Дебют', '1987', NULL, NULL, 'formula1_suzuka_2026_guide'),
    ('suzuka', 'stat_bar', 1, 'Длина трассы', '5,807 км', NULL, 'length', 'formula1_suzuka_2026_guide'),
    ('suzuka', 'stat_bar', 2, 'Повороты', '18', NULL, 'turns', 'formula1_suzuka_2026_guide'),
    ('suzuka', 'stat_bar', 3, 'Дебют в F1', '1987', NULL, 'debut', 'formula1_suzuka_2026_guide'),
    ('suzuka', 'stat_bar', 4, 'Рекорд круга F1', '1:30.965', 'Кими Антонелли · 2025', 'record', 'formula1_suzuka_2026_guide'),
    ('suzuka', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_suzuka_2026_guide'),

    ('miami', 'highlight', 1, '19 поворотов', NULL, NULL, NULL, 'formula1_miami_2026'),
    ('miami', 'highlight', 2, 'Временная трасса', NULL, NULL, NULL, 'formula1_miami_2026'),
    ('miami', 'metric', 1, 'Длина', '5,412 км', NULL, NULL, 'formula1_miami_2026'),
    ('miami', 'metric', 2, 'Круги', '57', NULL, NULL, 'formula1_miami_2026'),
    ('miami', 'metric', 3, 'Повороты', '19', NULL, NULL, 'formula1_miami_2026'),
    ('miami', 'metric', 4, 'Дебют', '2022', NULL, NULL, 'formula1_miami_2026'),
    ('miami', 'stat_bar', 1, 'Длина трассы', '5,412 км', NULL, 'length', 'formula1_miami_2026'),
    ('miami', 'stat_bar', 2, 'Повороты', '19', NULL, 'turns', 'formula1_miami_2026'),
    ('miami', 'stat_bar', 3, 'Дебют в F1', '2022', NULL, 'debut', 'formula1_miami_2026'),
    ('miami', 'stat_bar', 4, 'Рекорд круга F1', '1:29.708', 'Макс Ферстаппен · 2023', 'record', 'formula1_miami_2026'),
    ('miami', 'stat_bar', 5, 'Тип трассы', 'Временная', NULL, 'type', 'formula1_miami_2026');

COMMIT;
