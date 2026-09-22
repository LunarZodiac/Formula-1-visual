BEGIN;

-- Первый состоявшийся Гран-при на Мадринге. Официальная страница Formula 1
-- после этапа заменила предварительную длину 5,416 км на итоговые 5,414 км.
INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES (
    'formula1_madring_2026',
    'Formula 1 — FORMULA 1 TAG HEUER GRAN PREMIO DE ESPAÑA 2026',
    'https://www.formula1.com/en/racing/2026/spain',
    'Official website',
    '2026-09-21T00:00:00Z',
    'Официальная страница первого этапа на Madring: 57 кругов, победа Кими Антонелли, длина 5,414 км и лучший круг Джорджа Расселла 1:35.587'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

DELETE FROM atlas.circuit_page_stats
WHERE circuit_id = 'madring';

INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('madring', 'highlight', 1, 'Гран-при Испании · 2026', NULL, NULL, NULL, 'formula1_madring_2026'),
    ('madring', 'highlight', 2, '57 кругов', NULL, 'Первый этап на Мадринге', NULL, 'formula1_madring_2026'),
    ('madring', 'metric', 1, 'Дата первого этапа', '13 сентября 2026', NULL, NULL, 'formula1_madring_2026'),
    ('madring', 'metric', 2, 'Победитель', 'Кими Антонелли', 'Mercedes', NULL, 'formula1_madring_2026'),
    ('madring', 'metric', 3, 'Круги', '57', NULL, NULL, 'formula1_madring_2026'),
    ('madring', 'metric', 4, 'Рекорд круга', '1:35.587', 'Джордж Расселл · 2026', NULL, 'formula1_madring_2026'),
    ('madring', 'stat_bar', 1, 'Длина трассы', '5,414 км', NULL, 'length', 'formula1_madring_2026'),
    ('madring', 'stat_bar', 2, 'Круги', '57', 'Гран-при Испании 2026 года', NULL, 'formula1_madring_2026'),
    ('madring', 'stat_bar', 3, 'Дебют в F1', '2026', NULL, 'debut', 'formula1_madring_2026'),
    ('madring', 'stat_bar', 4, 'Рекорд круга', '1:35.587', 'Джордж Расселл · 2026', 'record', 'formula1_madring_2026');

DELETE FROM atlas.circuit_history_entries
WHERE circuit_id = 'madring';

INSERT INTO atlas.circuit_history_entries (
    id, circuit_id, sort_order, year_label, title_ru, description_ru,
    media_asset_id, source_id
) VALUES (
    'madring-2026', 'madring', 1, '13 сентября 2026',
    'Первый Гран-при на Мадринге',
    'Кими Антонелли выиграл первый этап Formula 1 на Мадринге, проехав 57 кругов за Mercedes',
    NULL, 'formula1_madring_2026'
);

COMMIT;
