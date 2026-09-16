BEGIN;

-- Единые полные русские названия стран для публичного каталога трасс.
WITH country_names(country_code, name_ru) AS (VALUES
    ('ae', 'Объединённые Арабские Эмираты'),
    ('ar', 'Аргентина'), ('at', 'Австрия'), ('au', 'Австралия'),
    ('az', 'Азербайджан'), ('be', 'Бельгия'), ('bh', 'Бахрейн'),
    ('br', 'Бразилия'), ('ca', 'Канада'), ('ch', 'Швейцария'),
    ('cn', 'Китай'), ('de', 'Германия'), ('es', 'Испания'),
    ('fr', 'Франция'), ('gb', 'Великобритания'), ('hu', 'Венгрия'),
    ('in', 'Индия'), ('it', 'Италия'), ('jp', 'Япония'),
    ('kr', 'Республика Корея'), ('ma', 'Марокко'), ('mc', 'Монако'),
    ('mx', 'Мексика'), ('my', 'Малайзия'), ('nl', 'Нидерланды'),
    ('pt', 'Португалия'), ('qa', 'Катар'), ('ru', 'Россия'),
    ('sa', 'Саудовская Аравия'), ('se', 'Швеция'), ('sg', 'Сингапур'),
    ('tr', 'Турция'), ('us', 'Соединённые Штаты Америки'),
    ('za', 'Южно-Африканская Республика')
)
UPDATE atlas.circuit_page_profiles AS profile
SET country_ru = country_names.name_ru,
    updated_at = now()
FROM atlas.circuits AS circuit
JOIN country_names ON country_names.country_code = lower(circuit.country_code)
WHERE profile.circuit_id = circuit.id
  AND profile.country_ru IS DISTINCT FROM country_names.name_ru;

COMMIT;
