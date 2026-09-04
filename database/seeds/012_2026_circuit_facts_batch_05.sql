BEGIN;

INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    ('formula1_americas_2026', 'Formula 1 — United States Grand Prix circuit profile 2026',
     'https://www.formula1.com/en/racing/2026/united-states', 'Official website',
     '2026-08-30T00:00:00Z', 'Актуальные параметры Circuit of The Americas 2026'),
    ('formula1_americas_turns', 'Formula 1 ticketing — Circuit of The Americas',
     'https://tickets.formula1.com/en/pc-3320-united-states-paddock-club', 'Official website',
     '2026-08-30T00:00:00Z', 'Официальное подтверждение 20 поворотов'),
    ('formula1_mexico_2026', 'Formula 1 — Mexico City Grand Prix circuit profile 2026',
     'https://www.formula1.com/en/racing/2026/mexico', 'Official website',
     '2026-08-30T00:00:00Z', 'Актуальные параметры Autodromo Hermanos Rodriguez 2026'),
    ('formula1_mexico_turns', 'Formula 1 — Mexico City Grand Prix facts 2024',
     'https://www.formula1.com/en/latest/article/need-to-know-the-most-important-facts-stats-and-trivia-ahead-of-the-2024-mexico-city.1h3w7llCmLdZJbmfTUwUWs', 'Official website',
     '2026-08-30T00:00:00Z', 'Официальное подтверждение 17 поворотов'),
    ('formula1_interlagos_2026', 'Formula 1 — Sao Paulo Grand Prix circuit profile 2026',
     'https://www.formula1.com/en/racing/2026/brazil', 'Official website',
     '2026-08-30T00:00:00Z', 'Актуальные параметры Autodromo Jose Carlos Pace 2026'),
    ('formula1_interlagos_turns', 'Formula 1 — Sao Paulo Grand Prix facts 2025',
     'https://www.formula1.com/en/latest/article/need-to-know-the-most-important-facts-stats-and-trivia-ahead-of-the-2025-sao.4q3WPe5DWYcZPJ3ThYZole', 'Official website',
     '2026-08-30T00:00:00Z', 'Официальное подтверждение 15 поворотов'),
    ('formula1_vegas_2026', 'Formula 1 — Las Vegas Grand Prix circuit profile 2026',
     'https://www.formula1.com/en/racing/2026/las-vegas', 'Official website',
     '2026-08-30T00:00:00Z', 'Актуальные параметры Las Vegas Strip Circuit 2026'),
    ('formula1_vegas_turns', 'Formula 1 — Las Vegas Strip Circuit guide',
     'https://www.formula1.com/en/latest/article/watch-first-look-at-the-new-las-vegas-street-circuit-gameplay-on-f1-23.56FKdhDnPv35a3R6udt2q4', 'Official website',
     '2026-08-30T00:00:00Z', 'Официальное подтверждение 17 поворотов и городского типа'),
    ('formula1_losail_2026', 'Formula 1 — Qatar Grand Prix circuit profile 2026',
     'https://www.formula1.com/en/racing/2026/qatar', 'Official website',
     '2026-08-30T00:00:00Z', 'Актуальные параметры Lusail International Circuit 2026'),
    ('formula1_losail_turns', 'Formula 1 — Qatar Grand Prix circuit guide',
     'https://www.formula1.com/en/latest/article/everything-you-need-to-know-about-the-inaugural-qatar-grand-prix.1JD8aSTDX6Upr6QBg08XIR', 'Official website',
     '2026-08-30T00:00:00Z', 'Официальное подтверждение 16 поворотов и стационарного типа'),
    ('formula1_yas_marina_2026', 'Formula 1 — Abu Dhabi Grand Prix circuit profile 2026',
     'https://www.formula1.com/en/racing/2026/united-arab-emirates', 'Official website',
     '2026-08-30T00:00:00Z', 'Актуальные параметры Yas Marina Circuit 2026'),
    ('fia_yas_marina_2025_map', 'FIA — Yas Marina circuit map 2025',
     'https://www.fia.com/system/files/decision-document/2025_abu_dhabi_grand_prix_-_event_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_quarantine_zone_and_red_zones.pdf', 'Official document',
     '2026-08-30T00:00:00Z', 'Официальная схема актуальной конфигурации с поворотами 1–16')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, url = EXCLUDED.url, licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes;

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Стационарная трасса с выраженным рельефом, крутым подъёмом к первому повороту и сочетанием быстрых связок с медленным стадионным сектором.',
    circuit_type_ru = 'Стационарная трасса', updated_at = now()
WHERE circuit_id = 'americas' AND editorial_status = 'draft';

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Высокогорная стационарная трасса в Мехико, расположенная на высоте более двух километров и проходящая через стадионный сектор.',
    circuit_type_ru = 'Стационарная трасса', updated_at = now()
WHERE circuit_id = 'rodriguez' AND editorial_status = 'draft';

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Стационарная трасса с перепадами высот, профилированными поворотами, связкой Senna S и извилистым внутренним сектором.',
    circuit_type_ru = 'Стационарная трасса', updated_at = now()
WHERE circuit_id = 'interlagos' AND editorial_status = 'draft';

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Городская ночная трасса по улицам Лас-Вегаса и бульвару Стрип с длинными прямыми, высокими скоростями и 17 поворотами.',
    circuit_type_ru = 'Городская трасса', updated_at = now()
WHERE circuit_id = 'vegas' AND editorial_status = 'draft';

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Стационарная трасса, построенная для мотогонок, с преобладанием средне- и высокоскоростных поворотов и главной прямой длиной более километра.',
    circuit_type_ru = 'Стационарная трасса', updated_at = now()
WHERE circuit_id = 'losail' AND editorial_status = 'draft';

UPDATE atlas.circuit_page_profiles SET
    summary_ru = 'Стационарная трасса на острове Яс с длинной прямой и обновлённой в 2021 году конфигурацией с профилированным девятым поворотом.',
    circuit_type_ru = 'Стационарная трасса', updated_at = now()
WHERE circuit_id = 'yas_marina' AND editorial_status = 'draft';

INSERT INTO atlas.circuit_page_profile_field_sources (
    circuit_id, field_name, source_id, editorial_status, verified_at
) VALUES
    ('americas', 'summary_ru', 'formula1_americas_2026', 'verified', now()),
    ('americas', 'circuit_type_ru', 'formula1_americas_2026', 'verified', now()),
    ('rodriguez', 'summary_ru', 'formula1_mexico_2026', 'verified', now()),
    ('rodriguez', 'circuit_type_ru', 'formula1_mexico_2026', 'verified', now()),
    ('interlagos', 'summary_ru', 'formula1_interlagos_2026', 'verified', now()),
    ('interlagos', 'circuit_type_ru', 'formula1_interlagos_2026', 'verified', now()),
    ('vegas', 'summary_ru', 'formula1_vegas_turns', 'verified', now()),
    ('vegas', 'circuit_type_ru', 'formula1_vegas_turns', 'verified', now()),
    ('losail', 'summary_ru', 'formula1_losail_turns', 'verified', now()),
    ('losail', 'circuit_type_ru', 'formula1_losail_turns', 'verified', now()),
    ('yas_marina', 'summary_ru', 'formula1_yas_marina_2026', 'verified', now()),
    ('yas_marina', 'circuit_type_ru', 'formula1_yas_marina_2026', 'verified', now())
ON CONFLICT (circuit_id, field_name) DO UPDATE SET
    source_id = EXCLUDED.source_id, editorial_status = EXCLUDED.editorial_status,
    verified_at = EXCLUDED.verified_at;

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id IN ('americas', 'rodriguez', 'interlagos', 'vegas', 'losail', 'yas_marina');

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('americas', 'highlight', 1, '20 поворотов', NULL, NULL, NULL, 'formula1_americas_turns'),
    ('americas', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_americas_2026'),
    ('americas', 'metric', 1, 'Длина', '5,513 км', NULL, NULL, 'formula1_americas_2026'),
    ('americas', 'metric', 2, 'Круги', '56', NULL, NULL, 'formula1_americas_2026'),
    ('americas', 'metric', 3, 'Повороты', '20', NULL, NULL, 'formula1_americas_turns'),
    ('americas', 'metric', 4, 'Дебют', '2012', NULL, NULL, 'formula1_americas_2026'),
    ('americas', 'stat_bar', 1, 'Длина трассы', '5,513 км', NULL, 'length', 'formula1_americas_2026'),
    ('americas', 'stat_bar', 2, 'Повороты', '20', NULL, 'turns', 'formula1_americas_turns'),
    ('americas', 'stat_bar', 3, 'Дебют в F1', '2012', NULL, 'debut', 'formula1_americas_2026'),
    ('americas', 'stat_bar', 4, 'Рекорд круга F1', '1:36.169', 'Шарль Леклер · 2019', 'record', 'formula1_americas_2026'),
    ('americas', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_americas_2026'),

    ('rodriguez', 'highlight', 1, '17 поворотов', NULL, NULL, NULL, 'formula1_mexico_turns'),
    ('rodriguez', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_mexico_2026'),
    ('rodriguez', 'metric', 1, 'Длина', '4,304 км', NULL, NULL, 'formula1_mexico_2026'),
    ('rodriguez', 'metric', 2, 'Круги', '71', NULL, NULL, 'formula1_mexico_2026'),
    ('rodriguez', 'metric', 3, 'Повороты', '17', NULL, NULL, 'formula1_mexico_turns'),
    ('rodriguez', 'metric', 4, 'Дебют', '1963', NULL, NULL, 'formula1_mexico_2026'),
    ('rodriguez', 'stat_bar', 1, 'Длина трассы', '4,304 км', NULL, 'length', 'formula1_mexico_2026'),
    ('rodriguez', 'stat_bar', 2, 'Повороты', '17', NULL, 'turns', 'formula1_mexico_turns'),
    ('rodriguez', 'stat_bar', 3, 'Дебют в F1', '1963', NULL, 'debut', 'formula1_mexico_2026'),
    ('rodriguez', 'stat_bar', 4, 'Рекорд круга F1', '1:17.774', 'Валттери Боттас · 2021', 'record', 'formula1_mexico_2026'),
    ('rodriguez', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_mexico_2026'),

    ('interlagos', 'highlight', 1, '15 поворотов', NULL, NULL, NULL, 'formula1_interlagos_turns'),
    ('interlagos', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_interlagos_2026'),
    ('interlagos', 'metric', 1, 'Длина', '4,309 км', NULL, NULL, 'formula1_interlagos_2026'),
    ('interlagos', 'metric', 2, 'Круги', '71', NULL, NULL, 'formula1_interlagos_2026'),
    ('interlagos', 'metric', 3, 'Повороты', '15', NULL, NULL, 'formula1_interlagos_turns'),
    ('interlagos', 'metric', 4, 'Дебют', '1973', NULL, NULL, 'formula1_interlagos_2026'),
    ('interlagos', 'stat_bar', 1, 'Длина трассы', '4,309 км', NULL, 'length', 'formula1_interlagos_2026'),
    ('interlagos', 'stat_bar', 2, 'Повороты', '15', NULL, 'turns', 'formula1_interlagos_turns'),
    ('interlagos', 'stat_bar', 3, 'Дебют в F1', '1973', NULL, 'debut', 'formula1_interlagos_2026'),
    ('interlagos', 'stat_bar', 4, 'Рекорд круга F1', '1:10.540', 'Валттери Боттас · 2018', 'record', 'formula1_interlagos_2026'),
    ('interlagos', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_interlagos_2026'),

    ('vegas', 'highlight', 1, '17 поворотов', NULL, NULL, NULL, 'formula1_vegas_turns'),
    ('vegas', 'highlight', 2, 'Городская трасса', NULL, NULL, NULL, 'formula1_vegas_turns'),
    ('vegas', 'metric', 1, 'Длина', '6,201 км', NULL, NULL, 'formula1_vegas_2026'),
    ('vegas', 'metric', 2, 'Круги', '50', NULL, NULL, 'formula1_vegas_2026'),
    ('vegas', 'metric', 3, 'Повороты', '17', NULL, NULL, 'formula1_vegas_turns'),
    ('vegas', 'metric', 4, 'Дебют', '2023', NULL, NULL, 'formula1_vegas_2026'),
    ('vegas', 'stat_bar', 1, 'Длина трассы', '6,201 км', NULL, 'length', 'formula1_vegas_2026'),
    ('vegas', 'stat_bar', 2, 'Повороты', '17', NULL, 'turns', 'formula1_vegas_turns'),
    ('vegas', 'stat_bar', 3, 'Дебют в F1', '2023', NULL, 'debut', 'formula1_vegas_2026'),
    ('vegas', 'stat_bar', 4, 'Рекорд круга F1', '1:33.365', 'Макс Ферстаппен · 2025', 'record', 'formula1_vegas_2026'),
    ('vegas', 'stat_bar', 5, 'Тип трассы', 'Городская', NULL, 'type', 'formula1_vegas_turns'),

    ('losail', 'highlight', 1, '16 поворотов', NULL, NULL, NULL, 'formula1_losail_turns'),
    ('losail', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_losail_turns'),
    ('losail', 'metric', 1, 'Длина', '5,419 км', NULL, NULL, 'formula1_losail_2026'),
    ('losail', 'metric', 2, 'Круги', '57', NULL, NULL, 'formula1_losail_2026'),
    ('losail', 'metric', 3, 'Повороты', '16', NULL, NULL, 'formula1_losail_turns'),
    ('losail', 'metric', 4, 'Дебют', '2021', NULL, NULL, 'formula1_losail_2026'),
    ('losail', 'stat_bar', 1, 'Длина трассы', '5,419 км', NULL, 'length', 'formula1_losail_2026'),
    ('losail', 'stat_bar', 2, 'Повороты', '16', NULL, 'turns', 'formula1_losail_turns'),
    ('losail', 'stat_bar', 3, 'Дебют в F1', '2021', NULL, 'debut', 'formula1_losail_2026'),
    ('losail', 'stat_bar', 4, 'Рекорд круга F1', '1:22.384', 'Ландо Норрис · 2024', 'record', 'formula1_losail_2026'),
    ('losail', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_losail_turns'),

    ('yas_marina', 'highlight', 1, '16 поворотов', NULL, NULL, NULL, 'fia_yas_marina_2025_map'),
    ('yas_marina', 'highlight', 2, 'Стационарная трасса', NULL, NULL, NULL, 'formula1_yas_marina_2026'),
    ('yas_marina', 'metric', 1, 'Длина', '5,281 км', NULL, NULL, 'formula1_yas_marina_2026'),
    ('yas_marina', 'metric', 2, 'Круги', '58', NULL, NULL, 'formula1_yas_marina_2026'),
    ('yas_marina', 'metric', 3, 'Повороты', '16', NULL, NULL, 'fia_yas_marina_2025_map'),
    ('yas_marina', 'metric', 4, 'Дебют', '2009', NULL, NULL, 'formula1_yas_marina_2026'),
    ('yas_marina', 'stat_bar', 1, 'Длина трассы', '5,281 км', NULL, 'length', 'formula1_yas_marina_2026'),
    ('yas_marina', 'stat_bar', 2, 'Повороты', '16', NULL, 'turns', 'fia_yas_marina_2025_map'),
    ('yas_marina', 'stat_bar', 3, 'Дебют в F1', '2009', NULL, 'debut', 'formula1_yas_marina_2026'),
    ('yas_marina', 'stat_bar', 4, 'Рекорд круга F1', '1:25.637', 'Кевин Магнуссен · 2024', 'record', 'formula1_yas_marina_2026'),
    ('yas_marina', 'stat_bar', 5, 'Тип трассы', 'Стационарная', NULL, 'type', 'formula1_yas_marina_2026');

COMMIT;
