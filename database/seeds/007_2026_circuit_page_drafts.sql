BEGIN;

-- Only sourced identity/location fields are populated here. Geometry, summary
-- and circuit type remain NULL until individually verified for publication.
INSERT INTO atlas.circuit_page_profiles (
    circuit_id, slug, geometry_id, name_ru, city_ru, country_ru,
    summary_ru, circuit_type_ru, editorial_status, source_id
) VALUES
    ('albert_park', 'albert-park', NULL, 'Альберт-Парк', 'Мельбурн', 'Австралия', NULL, NULL, 'draft', 'jolpica'),
    ('shanghai', 'shanghai', NULL, 'Шанхай', 'Шанхай', 'Китай', NULL, NULL, 'draft', 'jolpica'),
    ('suzuka', 'suzuka', NULL, 'Сузука', 'Сузука', 'Япония', NULL, NULL, 'draft', 'jolpica'),
    ('miami', 'miami', NULL, 'Майами', 'Майами', 'США', NULL, NULL, 'draft', 'jolpica'),
    ('villeneuve', 'gilles-villeneuve', NULL, 'Жиль Вильнёв', 'Монреаль', 'Канада', NULL, NULL, 'draft', 'jolpica'),
    ('monaco', 'monaco', NULL, 'Монако', 'Монте-Карло', 'Монако', NULL, NULL, 'draft', 'jolpica'),
    ('catalunya', 'barcelona-catalunya', NULL, 'Барселона-Каталунья', 'Барселона', 'Испания', NULL, NULL, 'draft', 'jolpica'),
    ('red_bull_ring', 'red-bull-ring', NULL, 'Ред Булл Ринг', 'Шпильберг', 'Австрия', NULL, NULL, 'draft', 'jolpica'),
    ('silverstone', 'silverstone', NULL, 'Сильверстоун', 'Сильверстоун', 'Великобритания', NULL, NULL, 'draft', 'jolpica'),
    ('hungaroring', 'hungaroring', NULL, 'Хунгароринг', 'Будапешт', 'Венгрия', NULL, NULL, 'draft', 'jolpica'),
    ('zandvoort', 'zandvoort', NULL, 'Зандворт', 'Зандворт', 'Нидерланды', NULL, NULL, 'draft', 'jolpica'),
    ('monza', 'monza', NULL, 'Монца', 'Монца', 'Италия', NULL, NULL, 'draft', 'jolpica'),
    ('madring', 'madring', NULL, 'Мадринг', 'Мадрид', 'Испания', NULL, NULL, 'draft', 'jolpica'),
    ('baku', 'baku', NULL, 'Баку', 'Баку', 'Азербайджан', NULL, NULL, 'draft', 'jolpica'),
    ('sepang', 'sepang', NULL, 'Сепанг', 'Куала-Лумпур', 'Малайзия', NULL, NULL, 'draft', 'jolpica'),
    ('marina_bay', 'marina-bay', NULL, 'Марина-Бей', 'Марина-Бей', 'Сингапур', NULL, NULL, 'draft', 'jolpica'),
    ('americas', 'circuit-of-the-americas', NULL, 'Трасса Америк', 'Остин', 'США', NULL, NULL, 'draft', 'jolpica'),
    ('rodriguez', 'hermanos-rodriguez', NULL, 'Эрманос Родригес', 'Мехико', 'Мексика', NULL, NULL, 'draft', 'jolpica'),
    ('interlagos', 'interlagos', NULL, 'Интерлагос', 'Сан-Паулу', 'Бразилия', NULL, NULL, 'draft', 'jolpica'),
    ('vegas', 'las-vegas', NULL, 'Лас-Вегас', 'Лас-Вегас', 'США', NULL, NULL, 'draft', 'jolpica'),
    ('losail', 'losail', NULL, 'Лусаил', 'Лусаил', 'Катар', NULL, NULL, 'draft', 'jolpica'),
    ('yas_marina', 'yas-marina', NULL, 'Яс-Марина', 'Абу-Даби', 'ОАЭ', NULL, NULL, 'draft', 'jolpica')
ON CONFLICT (circuit_id) DO UPDATE SET
    slug = EXCLUDED.slug,
    name_ru = EXCLUDED.name_ru,
    city_ru = EXCLUDED.city_ru,
    country_ru = EXCLUDED.country_ru,
    source_id = EXCLUDED.source_id,
    updated_at = now()
WHERE atlas.circuit_page_profiles.editorial_status = 'draft';

INSERT INTO atlas.circuit_page_profile_field_sources (
    circuit_id, field_name, source_id, editorial_status, verified_at, notes
)
SELECT profile.circuit_id, field.field_name, 'jolpica', 'verified', now(),
       'Русская редакционная локализация идентификатора из импортированных данных Jolpica'
FROM atlas.circuit_page_profiles AS profile
CROSS JOIN (VALUES ('slug'), ('name_ru'), ('city_ru'), ('country_ru')) AS field(field_name)
WHERE profile.editorial_status = 'draft'
  AND profile.circuit_id IN (
    'albert_park', 'shanghai', 'suzuka', 'miami', 'villeneuve', 'monaco',
    'catalunya', 'red_bull_ring', 'silverstone', 'hungaroring', 'zandvoort',
    'monza', 'madring', 'baku', 'sepang', 'marina_bay', 'americas',
    'rodriguez', 'interlagos', 'vegas', 'losail', 'yas_marina'
  )
ON CONFLICT (circuit_id, field_name) DO UPDATE SET
    source_id = EXCLUDED.source_id,
    editorial_status = EXCLUDED.editorial_status,
    verified_at = EXCLUDED.verified_at,
    notes = EXCLUDED.notes;

COMMIT;
