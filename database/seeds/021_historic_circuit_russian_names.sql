BEGIN;

INSERT INTO atlas.data_sources (id, name, url, licence, notes)
VALUES (
    'project_ru_circuit_editorial',
    'Русская редакционная локализация трасс',
    'local:database/seeds/021_historic_circuit_russian_names.sql',
    'Project editorial data',
    'Русские отображаемые названия трасс и полные названия стран; официальное исходное название остаётся в atlas.circuits.name'
)
ON CONFLICT (id) DO NOTHING;

WITH localisations(circuit_id, name_ru) AS (VALUES
    ('adelaide', 'Аделаида'),
    ('ain-diab', 'Айн-Диаб'),
    ('aintree', 'Эйнтри'),
    ('estoril', 'Эшторил'),
    ('imola', 'Имола'),
    ('portimao', 'Алгарве'),
    ('jacarepagua', 'Жакарепагуа'),
    ('mugello', 'Муджелло'),
    ('galvez', 'Буэнос-Айрес'),
    ('avus', 'АФУС'),
    ('brands_hatch', 'Брэндс-Хэтч'),
    ('buddh', 'Будда'),
    ('charade', 'Шарад'),
    ('bremgarten', 'Бремгартен'),
    ('magny_cours', 'Маньи-Кур'),
    ('pedralbes', 'Педральбес'),
    ('tremblant', 'Мон-Тремблан'),
    ('ricard', 'Поль-Рикар'),
    ('boavista', 'Боавишта'),
    ('jerez', 'Херес'),
    ('detroit', 'Детройт'),
    ('dijon', 'Дижон-Пренуа'),
    ('donington', 'Донингтон-Парк'),
    ('dallas', 'Даллас'),
    ('fuji', 'Фудзи'),
    ('hockenheimring', 'Хоккенхаймринг'),
    ('indianapolis', 'Индианаполис'),
    ('istanbul', 'Истанбул-Парк'),
    ('jarama', 'Харама'),
    ('jeddah', 'Джидда'),
    ('yeongam', 'Йонам'),
    ('kyalami', 'Кьялами'),
    ('las_vegas', 'Сизарс-Пэлас'),
    ('lemans', 'Ле-Ман'),
    ('long_beach', 'Лонг-Бич'),
    ('monsanto', 'Монсанту'),
    ('montjuic', 'Монжуик'),
    ('mosport', 'Моспорт'),
    ('nivelles', 'Нивель-Болер'),
    ('nurburgring', 'Нюрбургринг'),
    ('okayama', 'Окаяма'),
    ('pescara', 'Пескара'),
    ('phoenix', 'Финикс'),
    ('george', 'Принс-Джордж'),
    ('reims', 'Реймс-Гё'),
    ('riverside', 'Риверсайд'),
    ('essarts', 'Руан-Лез-Эссар'),
    ('anderstorp', 'Андерсторп'),
    ('sebring', 'Себринг'),
    ('sochi', 'Сочи Автодром'),
    ('valencia', 'Валенсия'),
    ('watkins_glen', 'Уоткинс-Глен'),
    ('zeltweg', 'Цельтвег'),
    ('zolder', 'Золдер')
), prepared AS (
    SELECT circuit.id,
           CASE circuit.id
             WHEN 'las_vegas' THEN 'caesars-palace'
             ELSE replace(lower(circuit.id), '_', '-')
           END AS slug,
           localisation.name_ru,
           coalesce(circuit.locality, '') AS city_ru,
           CASE lower(circuit.country_code)
             WHEN 'ae' THEN 'Объединённые Арабские Эмираты' WHEN 'ar' THEN 'Аргентина'
             WHEN 'at' THEN 'Австрия' WHEN 'au' THEN 'Австралия' WHEN 'az' THEN 'Азербайджан'
             WHEN 'be' THEN 'Бельгия' WHEN 'bh' THEN 'Бахрейн' WHEN 'br' THEN 'Бразилия'
             WHEN 'ca' THEN 'Канада' WHEN 'ch' THEN 'Швейцария' WHEN 'cn' THEN 'Китай'
             WHEN 'de' THEN 'Германия' WHEN 'es' THEN 'Испания' WHEN 'fr' THEN 'Франция'
             WHEN 'gb' THEN 'Великобритания' WHEN 'hu' THEN 'Венгрия' WHEN 'in' THEN 'Индия'
             WHEN 'it' THEN 'Италия' WHEN 'jp' THEN 'Япония' WHEN 'kr' THEN 'Республика Корея'
             WHEN 'ma' THEN 'Марокко' WHEN 'mc' THEN 'Монако' WHEN 'mx' THEN 'Мексика'
             WHEN 'my' THEN 'Малайзия' WHEN 'nl' THEN 'Нидерланды' WHEN 'pt' THEN 'Португалия'
             WHEN 'qa' THEN 'Катар' WHEN 'ru' THEN 'Россия' WHEN 'sa' THEN 'Саудовская Аравия'
             WHEN 'se' THEN 'Швеция' WHEN 'sg' THEN 'Сингапур' WHEN 'tr' THEN 'Турция'
             WHEN 'us' THEN 'Соединённые Штаты Америки' WHEN 'za' THEN 'Южно-Африканская Республика'
           END AS country_ru,
           CASE circuit.circuit_type
             WHEN 'street' THEN 'Городская трасса' WHEN 'temporary' THEN 'Временная трасса'
             WHEN 'hybrid' THEN 'Смешанная трасса' ELSE 'Стационарная трасса'
           END AS circuit_type_ru,
           layout.id AS geometry_id
    FROM localisations AS localisation
    JOIN atlas.circuits AS circuit ON circuit.id = localisation.circuit_id
    LEFT JOIN LATERAL (
      SELECT candidate.id
      FROM atlas.track_layouts AS candidate
      WHERE candidate.circuit_id = circuit.id AND candidate.centerline IS NOT NULL
      ORDER BY (candidate.review_status IN ('reviewed', 'published')) DESC,
               candidate.valid_to_year DESC NULLS FIRST, candidate.id
      LIMIT 1
    ) AS layout ON true
)
INSERT INTO atlas.circuit_page_profiles (
    circuit_id, slug, geometry_id, name_ru, city_ru, country_ru,
    summary_ru, circuit_type_ru, editorial_status, source_id
)
SELECT id, slug, geometry_id, name_ru, city_ru, country_ru,
       '', circuit_type_ru, 'draft', 'project_ru_circuit_editorial'
FROM prepared
ON CONFLICT (circuit_id) DO UPDATE SET
    name_ru = EXCLUDED.name_ru,
    country_ru = EXCLUDED.country_ru,
    updated_at = now()
WHERE atlas.circuit_page_profiles.editorial_status = 'draft';

INSERT INTO atlas.circuit_page_profile_field_sources (
    circuit_id, field_name, source_id, editorial_status, verified_at, notes
)
SELECT localisation.circuit_id, field_name, 'project_ru_circuit_editorial', 'verified', now(),
       'Русское отображаемое название и полное название страны'
FROM (VALUES
    ('adelaide'), ('ain-diab'), ('aintree'), ('estoril'), ('imola'), ('portimao'),
    ('jacarepagua'), ('mugello'), ('galvez'), ('avus'), ('brands_hatch'), ('buddh'),
    ('charade'), ('bremgarten'), ('magny_cours'), ('pedralbes'), ('tremblant'), ('ricard'),
    ('boavista'), ('jerez'), ('detroit'), ('dijon'), ('donington'), ('dallas'), ('fuji'),
    ('hockenheimring'), ('indianapolis'), ('istanbul'), ('jarama'), ('jeddah'), ('yeongam'),
    ('kyalami'), ('las_vegas'), ('lemans'), ('long_beach'), ('monsanto'), ('montjuic'),
    ('mosport'), ('nivelles'), ('nurburgring'), ('okayama'), ('pescara'), ('phoenix'),
    ('george'), ('reims'), ('riverside'), ('essarts'), ('anderstorp'), ('sebring'),
    ('sochi'), ('valencia'), ('watkins_glen'), ('zeltweg'), ('zolder')
) AS localisation(circuit_id)
CROSS JOIN (VALUES ('name_ru'), ('country_ru')) AS field(field_name)
ON CONFLICT (circuit_id, field_name) DO UPDATE SET
    source_id = EXCLUDED.source_id,
    editorial_status = EXCLUDED.editorial_status,
    verified_at = EXCLUDED.verified_at,
    notes = EXCLUDED.notes;

COMMIT;
