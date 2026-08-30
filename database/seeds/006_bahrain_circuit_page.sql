BEGIN;

INSERT INTO atlas.data_sources (id, name, url, licence, notes) VALUES
    ('fia_bahrain_2025_map', 'FIA Bahrain Grand Prix 2025 circuit map', 'https://www.fia.com/system/files/decision-document/2025_bahrain_grand_prix_-_event_notes_-_circuit_map_v4.pdf', 'Official document', 'Длина современной конфигурации и повороты 1–15'),
    ('formula1_bahrain_profile', 'Formula 1 — Bahrain International Circuit', 'https://www.formula1.com/en/information/bahrain-international-circuit.2CaIdaOTCgQ3Yfnb37NmSS', 'Official website', 'Дебют, число кругов и рекорд круга'),
    ('fia_bahrain_2019_preview', 'FIA 2019 Bahrain Grand Prix preview', 'https://api.fia.com/sites/default/files/2019_bahrain_gp_preview.pdf', 'Official document', 'Ночная гонка, пустынные условия, торможения и перепад высот')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    notes = EXCLUDED.notes;

INSERT INTO atlas.circuit_page_profiles (
    circuit_id, slug, geometry_id, name_ru, city_ru, country_ru,
    summary_ru, circuit_type_ru, editorial_status, source_id
) VALUES (
    'bahrain', 'bahrain', 'bahrain', 'Бахрейн', 'Сахир', 'Бахрейн',
    'Пустынная трасса с выраженным перепадом высот и несколькими зонами DRS. Первый подробный объект картографического атласа.',
    'Стационарная', 'published', 'jolpica'
)
ON CONFLICT (circuit_id) DO UPDATE SET
    slug = EXCLUDED.slug,
    geometry_id = EXCLUDED.geometry_id,
    name_ru = EXCLUDED.name_ru,
    city_ru = EXCLUDED.city_ru,
    country_ru = EXCLUDED.country_ru,
    summary_ru = EXCLUDED.summary_ru,
    circuit_type_ru = EXCLUDED.circuit_type_ru,
    editorial_status = EXCLUDED.editorial_status,
    source_id = EXCLUDED.source_id,
    updated_at = now();

DELETE FROM atlas.circuit_page_stats WHERE circuit_id = 'bahrain';
INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('bahrain', 'highlight', 1, 'Пустынный рельеф', NULL, NULL, NULL, 'fia_bahrain_2019_preview'),
    ('bahrain', 'highlight', 2, 'Ночная гонка', NULL, NULL, NULL, 'fia_bahrain_2019_preview'),
    ('bahrain', 'highlight', 3, 'Зоны торможения', NULL, NULL, NULL, 'fia_bahrain_2019_preview'),
    ('bahrain', 'metric', 1, 'Длина', '5,412 км', NULL, NULL, 'fia_bahrain_2025_map'),
    ('bahrain', 'metric', 2, 'Круги', '57', NULL, NULL, 'formula1_bahrain_profile'),
    ('bahrain', 'metric', 3, 'Повороты', '15', NULL, NULL, 'fia_bahrain_2025_map'),
    ('bahrain', 'metric', 4, 'Дебют', '2004', NULL, NULL, 'formula1_bahrain_profile'),
    ('bahrain', 'stat_bar', 1, 'Длина трассы', '5,412 км', NULL, 'length', 'fia_bahrain_2025_map'),
    ('bahrain', 'stat_bar', 2, 'Повороты', '15', NULL, 'turns', 'fia_bahrain_2025_map'),
    ('bahrain', 'stat_bar', 3, 'Дебют в F1', '2004', NULL, 'debut', 'formula1_bahrain_profile'),
    ('bahrain', 'stat_bar', 4, 'Рекорд гонки', '1:31.447', 'Педро де ла Роса · 2005', 'record', 'formula1_bahrain_profile'),
    ('bahrain', 'stat_bar', 5, 'Перепад высот', '16,9 м', 'Официальные данные FIA', 'elevation', 'fia_bahrain_2019_preview'),
    ('bahrain', 'stat_bar', 6, 'Тип трассы', 'Стационарная', NULL, 'type', 'jolpica');

COMMIT;
