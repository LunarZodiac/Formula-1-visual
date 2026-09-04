BEGIN;

INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('formula1_silverstone_2026_guide', 'Formula 1 — Silverstone circuit guide 2026',
     'https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-silverstone-2026.5Sl0O8g393enBWVIkjRzOr',
     'Official website', '2026-08-30T00:00:00Z', 'Актуальная конфигурация 2026 и история площадки'),
    ('formula1_hungaroring_2026_guide', 'Formula 1 — Hungaroring circuit guide 2026',
     'https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-hungaroring.4ddtLbzLWLRjli7Y793jqh',
     'Official website', '2026-08-30T00:00:00Z', 'Актуальная конфигурация 2026 и назначение автодрома'),
    ('formula1_zandvoort_2026_guide', 'Formula 1 — Circuit Zandvoort guide 2026',
     'https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-circuit-zandvoort.3yxmn4LiWkbNTKpad7IRSo.3yxmn4LiWkbNTKpad7IRSo',
     'Official website', '2026-08-30T00:00:00Z', 'Актуальная конфигурация 2026, профилированные повороты и история трассы'),
    ('formula1_monza_2026', 'Formula 1 — Italian Grand Prix 2026 circuit profile',
     'https://www.formula1.com/en/racing/2026/italy',
     'Official website', '2026-08-30T00:00:00Z', 'Актуальная конфигурация 2026, параметры и история автодрома'),
    ('fia_monza_2025_map', 'FIA — Monza circuit map 2025',
     'https://www.fia.com/system/files/decision-document/2025_monza_event_-_circuit_map_-_monza_2025_0.pdf',
     'Official document', '2026-08-30T00:00:00Z', 'Нумерация 11 поворотов неизменённой конфигурации, используемой в 2026 году')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, url = EXCLUDED.url, licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Стационарная трасса на территории бывшего аэродрома с быстрыми связками Copse, Maggotts и Becketts и 18 поворотами.',
    circuit_type_ru = 'Стационарная трасса', updated_at = now()
WHERE circuit_id = 'silverstone' AND editorial_status = 'draft';

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Стационарная трасса, построенная специально для Формулы-1, с короткими прямыми и непрерывными сериями поворотов.',
    circuit_type_ru = 'Стационарная трасса', updated_at = now()
WHERE circuit_id = 'hungaroring' AND editorial_status = 'draft';

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Стационарная трасса среди прибрежных дюн с выраженным рельефом и профилированными поворотами Hugenholtz и Arie Luyendijk.',
    circuit_type_ru = 'Стационарная трасса', updated_at = now()
WHERE circuit_id = 'zandvoort' AND editorial_status = 'draft';

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Стационарная трасса в парке Монцы, построенная в 1922 году и известная высокой долей полного газа и тяжёлыми торможениями перед шиканами.',
    circuit_type_ru = 'Стационарная трасса', updated_at = now()
WHERE circuit_id = 'monza' AND editorial_status = 'draft';

INSERT INTO atlas.circuit_page_profile_field_sources (
    circuit_id, field_name, source_id, editorial_status, verified_at
) VALUES
    ('silverstone', 'summary_ru', 'formula1_silverstone_2026_guide', 'verified', now()),
    ('silverstone', 'circuit_type_ru', 'formula1_silverstone_2026_guide', 'verified', now()),
    ('hungaroring', 'summary_ru', 'formula1_hungaroring_2026_guide', 'verified', now()),
    ('hungaroring', 'circuit_type_ru', 'formula1_hungaroring_2026_guide', 'verified', now()),
    ('zandvoort', 'summary_ru', 'formula1_zandvoort_2026_guide', 'verified', now()),
    ('zandvoort', 'circuit_type_ru', 'formula1_zandvoort_2026_guide', 'verified', now()),
    ('monza', 'summary_ru', 'formula1_monza_2026', 'verified', now()),
    ('monza', 'circuit_type_ru', 'formula1_monza_2026', 'verified', now())
ON CONFLICT (circuit_id, field_name) DO UPDATE SET
    source_id = EXCLUDED.source_id, editorial_status = EXCLUDED.editorial_status,
    verified_at = EXCLUDED.verified_at;

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('silverstone', 'hungaroring', 'zandvoort', 'monza');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('silverstone', 'highlight', 1, '18 поворотов', NULL, NULL, NULL, 'formula1_silverstone_2026_guide'),
    ('silverstone', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_silverstone_2026_guide'),
    ('silverstone', 'metric', 1, 'Длина', '5,891 км', NULL, NULL, 'formula1_silverstone_2026_guide'),
    ('silverstone', 'metric', 2, 'Круги', '52', NULL, NULL, 'formula1_silverstone_2026_guide'),
    ('silverstone', 'metric', 3, 'Повороты', '18', NULL, NULL, 'formula1_silverstone_2026_guide'),
    ('silverstone', 'metric', 4, 'Дебют', '1950', NULL, NULL, 'formula1_silverstone_2026_guide'),
    ('silverstone', 'stat_bar', 1, 'Длина трассы', '5,891 км', NULL, 'length', 'formula1_silverstone_2026_guide'),
    ('silverstone', 'stat_bar', 2, 'Повороты', '18', NULL, 'turns', 'formula1_silverstone_2026_guide'),
    ('silverstone', 'stat_bar', 3, 'Дебют в F1', '1950', NULL, 'debut', 'formula1_silverstone_2026_guide'),
    ('silverstone', 'stat_bar', 4, 'Рекорд круга F1', '1:27.097', 'Макс Ферстаппен · 2020', 'record', 'formula1_silverstone_2026_guide'),
    ('silverstone', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_silverstone_2026_guide'),

    ('hungaroring', 'highlight', 1, '14 поворотов', NULL, NULL, NULL, 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'metric', 1, 'Длина', '4,381 км', NULL, NULL, 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'metric', 2, 'Круги', '70', NULL, NULL, 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'metric', 3, 'Повороты', '14', NULL, NULL, 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'metric', 4, 'Дебют', '1986', NULL, NULL, 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'stat_bar', 1, 'Длина трассы', '4,381 км', NULL, 'length', 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'stat_bar', 2, 'Повороты', '14', NULL, 'turns', 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'stat_bar', 3, 'Дебют в F1', '1986', NULL, 'debut', 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'stat_bar', 4, 'Рекорд круга F1', '1:16.627', 'Льюис Хэмилтон · 2020', 'record', 'formula1_hungaroring_2026_guide'),
    ('hungaroring', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_hungaroring_2026_guide'),

    ('zandvoort', 'highlight', 1, '14 поворотов', NULL, NULL, NULL, 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'highlight', 2, 'Профилированные повороты', NULL, NULL, NULL, 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'highlight', 3, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'metric', 1, 'Длина', '4,259 км', NULL, NULL, 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'metric', 2, 'Круги', '72', NULL, NULL, 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'metric', 3, 'Повороты', '14', NULL, NULL, 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'metric', 4, 'Дебют', '1952', NULL, NULL, 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'stat_bar', 1, 'Длина трассы', '4,259 км', NULL, 'length', 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'stat_bar', 2, 'Повороты', '14', NULL, 'turns', 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'stat_bar', 3, 'Дебют в F1', '1952', NULL, 'debut', 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'stat_bar', 4, 'Рекорд круга F1', '1:11.097', 'Льюис Хэмилтон · 2021', 'record', 'formula1_zandvoort_2026_guide'),
    ('zandvoort', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_zandvoort_2026_guide'),

    ('monza', 'highlight', 1, '11 поворотов', NULL, NULL, NULL, 'fia_monza_2025_map'),
    ('monza', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_monza_2026'),
    ('monza', 'metric', 1, 'Длина', '5,793 км', NULL, NULL, 'formula1_monza_2026'),
    ('monza', 'metric', 2, 'Круги', '53', NULL, NULL, 'formula1_monza_2026'),
    ('monza', 'metric', 3, 'Повороты', '11', NULL, NULL, 'fia_monza_2025_map'),
    ('monza', 'metric', 4, 'Дебют', '1950', NULL, NULL, 'formula1_monza_2026'),
    ('monza', 'stat_bar', 1, 'Длина трассы', '5,793 км', NULL, 'length', 'formula1_monza_2026'),
    ('monza', 'stat_bar', 2, 'Повороты', '11', NULL, 'turns', 'fia_monza_2025_map'),
    ('monza', 'stat_bar', 3, 'Дебют в F1', '1950', NULL, 'debut', 'formula1_monza_2026'),
    ('monza', 'stat_bar', 4, 'Рекорд круга F1', '1:20.901', 'Ландо Норрис · 2025', 'record', 'formula1_monza_2026'),
    ('monza', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_monza_2026');

COMMIT;
