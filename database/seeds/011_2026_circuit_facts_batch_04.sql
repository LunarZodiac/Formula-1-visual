BEGIN;

INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('formula1_madring_2026', 'Formula 1 — Madring circuit profile 2026',
     'https://www.formula1.com/en/racing/2026/spain', 'Official website',
     '2026-08-30T00:00:00Z', 'Финальные параметры до первого Гран-при: 5,416 км, 22 поворота, гибридный тип'),
    ('formula1_baku_2026', 'Formula 1 — Azerbaijan Grand Prix circuit profile 2026',
     'https://www.formula1.com/en/racing/2026/azerbaijan', 'Official website',
     '2026-08-30T00:00:00Z', 'Актуальная конфигурация Баку 2026 и городской тип'),
    ('formula1_sepang_2026', 'Formula 1 — Bahrain Grand Prix in Malaysia circuit profile 2026',
     'https://www.formula1.com/en/racing/2026/bahrain', 'Official website',
     '2026-08-30T00:00:00Z', 'Параметры возвращённого в календарь Сепанга и назначение автодрома'),
    ('formula1_singapore_2026', 'Formula 1 — Singapore Grand Prix circuit profile 2026',
     'https://www.formula1.com/en/racing/2026/singapore', 'Official website',
     '2026-08-30T00:00:00Z', 'Актуальная укороченная конфигурация Марина-Бей и городской тип')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, url = EXCLUDED.url, licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Новая гибридная трасса в Мадриде, объединяющая общественные дороги и специально построенные секции с 22 поворотами и профилированным Turn 12.',
    circuit_type_ru = 'Гибридная трасса', updated_at = now()
WHERE circuit_id = 'madring' AND editorial_status = 'draft';

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Городская трасса вдоль Каспийского моря с узким сектором у стен Старого города и длинной скоростной главной прямой.',
    circuit_type_ru = 'Городская трасса', updated_at = now()
WHERE circuit_id = 'baku' AND editorial_status = 'draft';

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Стационарная трасса с широким полотном, длинными прямыми, тяжёлыми торможениями и быстрыми связками в жарком тропическом климате.',
    circuit_type_ru = 'Стационарная трасса', updated_at = now()
WHERE circuit_id = 'sepang' AND editorial_status = 'draft';

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Городская ночная трасса по улицам Марина-Бей; с 2023 года используется укороченная конфигурация с 19 поворотами.',
    circuit_type_ru = 'Городская трасса', updated_at = now()
WHERE circuit_id = 'marina_bay' AND editorial_status = 'draft';

INSERT INTO atlas.circuit_page_profile_field_sources (
    circuit_id, field_name, source_id, editorial_status, verified_at
) VALUES
    ('madring', 'summary_ru', 'formula1_madring_2026', 'verified', now()),
    ('madring', 'circuit_type_ru', 'formula1_madring_2026', 'verified', now()),
    ('baku', 'summary_ru', 'formula1_baku_2026', 'verified', now()),
    ('baku', 'circuit_type_ru', 'formula1_baku_2026', 'verified', now()),
    ('sepang', 'summary_ru', 'formula1_sepang_2026', 'verified', now()),
    ('sepang', 'circuit_type_ru', 'formula1_sepang_2026', 'verified', now()),
    ('marina_bay', 'summary_ru', 'formula1_singapore_2026', 'verified', now()),
    ('marina_bay', 'circuit_type_ru', 'formula1_singapore_2026', 'verified', now())
ON CONFLICT (circuit_id, field_name) DO UPDATE SET
    source_id = EXCLUDED.source_id, editorial_status = EXCLUDED.editorial_status,
    verified_at = EXCLUDED.verified_at;

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('madring', 'baku', 'sepang', 'marina_bay');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('madring', 'highlight', 1, '22 поворота', NULL, NULL, NULL, 'formula1_madring_2026'),
    ('madring', 'highlight', 2, 'Гибридная трасса', NULL, NULL, NULL, 'formula1_madring_2026'),
    ('madring', 'metric', 1, 'Длина', '5,416 км', NULL, NULL, 'formula1_madring_2026'),
    ('madring', 'metric', 2, 'Круги', '57', NULL, NULL, 'formula1_madring_2026'),
    ('madring', 'metric', 3, 'Повороты', '22', NULL, NULL, 'formula1_madring_2026'),
    ('madring', 'metric', 4, 'Дебют', '2026', NULL, NULL, 'formula1_madring_2026'),
    ('madring', 'stat_bar', 1, 'Длина трассы', '5,416 км', NULL, 'length', 'formula1_madring_2026'),
    ('madring', 'stat_bar', 2, 'Повороты', '22', NULL, 'turns', 'formula1_madring_2026'),
    ('madring', 'stat_bar', 3, 'Дебют в F1', '2026', NULL, 'debut', 'formula1_madring_2026'),
    ('madring', 'stat_bar', 4, 'Тип трассы', 'Гибридная', NULL, 'type', 'formula1_madring_2026'),

    ('baku', 'highlight', 1, '20 поворотов', NULL, NULL, NULL, 'formula1_baku_2026'),
    ('baku', 'highlight', 2, 'Городская трасса', NULL, NULL, NULL, 'formula1_baku_2026'),
    ('baku', 'metric', 1, 'Длина', '6,003 км', NULL, NULL, 'formula1_baku_2026'),
    ('baku', 'metric', 2, 'Круги', '51', NULL, NULL, 'formula1_baku_2026'),
    ('baku', 'metric', 3, 'Повороты', '20', NULL, NULL, 'formula1_baku_2026'),
    ('baku', 'metric', 4, 'Дебют', '2016', NULL, NULL, 'formula1_baku_2026'),
    ('baku', 'stat_bar', 1, 'Длина трассы', '6,003 км', NULL, 'length', 'formula1_baku_2026'),
    ('baku', 'stat_bar', 2, 'Повороты', '20', NULL, 'turns', 'formula1_baku_2026'),
    ('baku', 'stat_bar', 3, 'Дебют в F1', '2016', NULL, 'debut', 'formula1_baku_2026'),
    ('baku', 'stat_bar', 4, 'Рекорд круга F1', '1:43.009', 'Шарль Леклер · 2019', 'record', 'formula1_baku_2026'),
    ('baku', 'stat_bar', 5, 'Тип трассы', 'Городская', NULL, 'type', 'formula1_baku_2026'),

    ('sepang', 'highlight', 1, '15 поворотов', NULL, NULL, NULL, 'formula1_sepang_2026'),
    ('sepang', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_sepang_2026'),
    ('sepang', 'metric', 1, 'Длина', '5,543 км', NULL, NULL, 'formula1_sepang_2026'),
    ('sepang', 'metric', 2, 'Круги', '56', NULL, NULL, 'formula1_sepang_2026'),
    ('sepang', 'metric', 3, 'Повороты', '15', NULL, NULL, 'formula1_sepang_2026'),
    ('sepang', 'metric', 4, 'Дебют', '1999', NULL, NULL, 'formula1_sepang_2026'),
    ('sepang', 'stat_bar', 1, 'Длина трассы', '5,543 км', NULL, 'length', 'formula1_sepang_2026'),
    ('sepang', 'stat_bar', 2, 'Повороты', '15', NULL, 'turns', 'formula1_sepang_2026'),
    ('sepang', 'stat_bar', 3, 'Дебют в F1', '1999', NULL, 'debut', 'formula1_sepang_2026'),
    ('sepang', 'stat_bar', 4, 'Рекорд круга F1', '1:34.080', 'Себастьян Феттель · 2017', 'record', 'formula1_sepang_2026'),
    ('sepang', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_sepang_2026'),

    ('marina_bay', 'highlight', 1, '19 поворотов', NULL, NULL, NULL, 'formula1_singapore_2026'),
    ('marina_bay', 'highlight', 2, 'Городская трасса', NULL, NULL, NULL, 'formula1_singapore_2026'),
    ('marina_bay', 'metric', 1, 'Длина', '4,927 км', NULL, NULL, 'formula1_singapore_2026'),
    ('marina_bay', 'metric', 2, 'Круги', '62', NULL, NULL, 'formula1_singapore_2026'),
    ('marina_bay', 'metric', 3, 'Повороты', '19', NULL, NULL, 'formula1_singapore_2026'),
    ('marina_bay', 'metric', 4, 'Дебют', '2008', NULL, NULL, 'formula1_singapore_2026'),
    ('marina_bay', 'stat_bar', 1, 'Длина трассы', '4,927 км', NULL, 'length', 'formula1_singapore_2026'),
    ('marina_bay', 'stat_bar', 2, 'Повороты', '19', NULL, 'turns', 'formula1_singapore_2026'),
    ('marina_bay', 'stat_bar', 3, 'Дебют в F1', '2008', NULL, 'debut', 'formula1_singapore_2026'),
    ('marina_bay', 'stat_bar', 4, 'Рекорд круга F1', '1:33.808', 'Льюис Хэмилтон · 2025', 'record', 'formula1_singapore_2026'),
    ('marina_bay', 'stat_bar', 5, 'Тип трассы', 'Городская', NULL, 'type', 'formula1_singapore_2026');

COMMIT;
