BEGIN;

INSERT INTO atlas.data_sources (id, name, url, licence, notes) VALUES
    ('spa_circuit_official', 'Circuit de Spa-Francorchamps', 'https://www.spa-francorchamps.be/en/the-circuit', 'Official website', 'История и общие сведения о трассе'),
    ('fia_spa_2025_map', 'FIA Spa-Francorchamps 2025 circuit map', 'https://www.fia.com/system/files/decision-document/2025_spa_francorchamps_event_-_circuit_map_-_spa_francorchamps_2025.pdf', 'Official document', 'Длина и нумерация поворотов современной конфигурации'),
    ('formula1_spa', 'Formula 1 — Belgium circuit profile', 'https://www.formula1.com/en/information/belgium-circuit-de-spa-francorchamps.3LltuYaAXVRU8iezEsjzGw', 'Official website', 'Дебют в чемпионате мира и справочные параметры'),
    ('wikimedia_commons', 'Wikimedia Commons', 'https://commons.wikimedia.org/', 'Per-file licence', 'Автор и лицензия фиксируются на каждом медиаобъекте')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    notes = EXCLUDED.notes;

INSERT INTO atlas.circuit_page_profiles (
    circuit_id, slug, geometry_id, name_ru, city_ru, country_ru,
    summary_ru, circuit_type_ru, editorial_status, source_id
) VALUES (
    'spa', 'spa', 'spa', 'Спа-Франкоршам', 'Спа-Франкоршам', 'Бельгия',
    'Семикилометровая трасса в Арденнах с быстрыми связками, переменчивой погодой и одним из самых выразительных перепадов высот в календаре Формулы-1',
    'Стационарная', 'published', 'spa_circuit_official'
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

DELETE FROM atlas.circuit_page_stats WHERE circuit_id = 'spa';
INSERT INTO atlas.circuit_page_stats (
    circuit_id, section, sort_order, label_ru, value_ru, note_ru, icon, source_id
) VALUES
    ('spa', 'highlight', 1, 'Арденны', NULL, NULL, NULL, 'spa_circuit_official'),
    ('spa', 'highlight', 2, '19 поворотов', NULL, NULL, NULL, 'fia_spa_2025_map'),
    ('spa', 'highlight', 3, 'Стационарная трасса', NULL, NULL, NULL, 'spa_circuit_official'),
    ('spa', 'metric', 1, 'Длина', '7,004 км', NULL, NULL, 'fia_spa_2025_map'),
    ('spa', 'metric', 2, 'Круги', '44', NULL, NULL, 'formula1_spa'),
    ('spa', 'metric', 3, 'Повороты', '19', NULL, NULL, 'fia_spa_2025_map'),
    ('spa', 'metric', 4, 'Дебют', '1950', NULL, NULL, 'formula1_spa'),
    ('spa', 'stat_bar', 1, 'Длина трассы', '7,004 км', NULL, 'length', 'fia_spa_2025_map'),
    ('spa', 'stat_bar', 2, 'Повороты', '19', NULL, 'turns', 'fia_spa_2025_map'),
    ('spa', 'stat_bar', 3, 'Дебют в F1', '1950', NULL, 'debut', 'formula1_spa'),
    ('spa', 'stat_bar', 4, 'Рекорд гонки', '1:44.701', 'Серхио Перес · 2024', 'record', 'formula1_spa'),
    ('spa', 'stat_bar', 5, 'Перепад высот', '≈102 м', 'Оценка для современной конфигурации', 'elevation', 'spa_circuit_official'),
    ('spa', 'stat_bar', 6, 'Тип трассы', 'Стационарная', NULL, 'type', 'spa_circuit_official');

INSERT INTO atlas.media_assets (
    id, entity_type, entity_id, media_type, url, alt_text_ru, author, licence, source_url, is_primary
) VALUES
    ('spa-history-1921', 'circuit_history', 'spa-1921', 'image', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/D%C3%A9part_du_Grand_Prix_d%27Europe_1925_%C3%A0_Spa,_Antonio_Ascari_devant_Campari.jpg', 'Старт Гран-при в Спа в 1925 году', 'Le Miroir des sports, автор неизвестен', 'Public domain', 'https://commons.wikimedia.org/wiki/File:D%C3%A9part_du_Grand_Prix_d%27Europe_1925_%C3%A0_Spa,_Antonio_Ascari_devant_Campari.jpg', false),
    ('spa-history-1939', 'circuit_history', 'spa-1939', 'image', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Start_Grand_Prix_Belgie_(1939).jpg', 'Старт Гран-при Бельгии 1939 года', 'Magazine Auto, автор неизвестен', 'Public domain', 'https://commons.wikimedia.org/wiki/File:Start_Grand_Prix_Belgie_(1939).jpg', false),
    ('spa-history-1950', 'circuit_history', 'spa-1950', 'image', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Grand_prix_vers_1950.jpg', 'Гоночные автомобили эпохи первого чемпионата мира около 1950 года', 'Chantal Buldorini Detaille / Fonds photographie Georges Detaille', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Grand_prix_vers_1950.jpg', false),
    ('spa-history-1979', 'circuit_history', 'spa-1979', 'image', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/1989_Belgian_GP_race_start_08.jpg', 'Старт Гран-при Бельгии 1989 года на укороченной конфигурации', 'madagascarica', 'CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:1989_Belgian_GP_race_start_08.jpg', false),
    ('spa-gallery-senna-1991', 'circuit', 'spa', 'image', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Ayrton_Senna_during_the_race_in_Spa-Francorchamps_on_25_August_1991.jpg', 'Айртон Сенна на трассе Спа-Франкоршам в 1991 году', 'George Voudouris', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Ayrton_Senna_during_the_race_in_Spa-Francorchamps_on_25_August_1991.jpg', false),
    ('spa-gallery-belgian-gp-2008', 'circuit', 'spa', 'image', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/David_Coulthard_2008_Belgian_GP_001.jpg', 'Дэвид Култхард на Гран-при Бельгии 2008 года', 'Mark J. McArdle / ph-stop', 'CC BY-SA 2.0', 'https://commons.wikimedia.org/wiki/File:David_Coulthard_2008_Belgian_GP_001.jpg', false),
    ('spa-gallery-circuit-2005', 'circuit', 'spa', 'image', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Spa_francorchamps.jpg', 'Автодром Спа-Франкоршам в 2005 году', 'Auguste Linotte', 'CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:Spa_francorchamps.jpg', false),
    ('spa-gallery-eau-rouge-snow', 'circuit', 'spa', 'image', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/EauRougeInTheSnow.jpg', 'Eau Rouge зимой', 'David Edgar', 'CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:EauRougeInTheSnow.jpg', false),
    ('spa-gallery-after-finish-2011', 'circuit', 'spa', 'image', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Spa_after_finish,_2011_Belgian_Grand_Prix._-_panoramio.jpg', 'Панорама трассы после Гран-при Бельгии 2011 года', 'de_vald', 'CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:Spa_after_finish,_2011_Belgian_Grand_Prix._-_panoramio.jpg', false),
    ('spa-gallery-circuit-2013', 'circuit', 'spa', 'image', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Circuit_de_Spa-Francorchamps_(1).jpg', 'Спа-Франкоршам перед гоночным уик-эндом в 2013 году', 'Kevin A. McGill', 'CC BY-SA 2.0', 'https://commons.wikimedia.org/wiki/File:Circuit_de_Spa-Francorchamps_(1).jpg', false),
    ('spa-gallery-paddock-2005', 'circuit', 'spa', 'image', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Spa_paddock.jpg', 'Паддок Спа-Франкоршам в 2005 году', 'Schumi4ever', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Spa_paddock.jpg', false)
ON CONFLICT (id) DO UPDATE SET
    entity_type = EXCLUDED.entity_type,
    entity_id = EXCLUDED.entity_id,
    media_type = EXCLUDED.media_type,
    url = EXCLUDED.url,
    alt_text_ru = EXCLUDED.alt_text_ru,
    author = EXCLUDED.author,
    licence = EXCLUDED.licence,
    source_url = EXCLUDED.source_url,
    is_primary = EXCLUDED.is_primary;

DELETE FROM atlas.circuit_history_entries WHERE circuit_id = 'spa';
INSERT INTO atlas.circuit_history_entries (
    id, circuit_id, sort_order, year_label, title_ru, description_ru, media_asset_id, source_id
) VALUES
    ('spa-1921', 'spa', 1, '1921', 'Первые соревнования', 'Автогонка не состоялась из-за одной заявки, но по дорожному кольцу прошла мотогонка', 'spa-history-1921', 'spa_circuit_official'),
    ('spa-1939', 'spa', 2, '1939', 'Рождение Raidillon', 'Спрямление у старой таможни сформировало знаменитый подъём с уклоном до 17%', 'spa-history-1939', 'spa_circuit_official'),
    ('spa-1950', 'spa', 3, '1950', 'Дебют чемпионата мира', 'Спа вошёл в первый сезон Формулы-1; гонку выиграл Хуан-Мануэль Фанхио', 'spa-history-1950', 'spa_circuit_official'),
    ('spa-1979', 'spa', 4, '1979', 'Новая конфигурация', 'Кольцо сократили до 6,947 км; современная версия позднее достигла длины 7,004 км', 'spa-history-1979', 'spa_circuit_official');

DELETE FROM atlas.circuit_media_gallery WHERE circuit_id = 'spa';
INSERT INTO atlas.circuit_media_gallery (
    circuit_id, media_asset_id, sort_order, title_ru, description_ru
) VALUES
    ('spa', 'spa-gallery-senna-1991', 1, 'Айртон Сенна · 1991', 'Айртон Сенна на трассе Спа-Франкоршам'),
    ('spa', 'spa-gallery-belgian-gp-2008', 2, 'Гран-при Бельгии · 2008', 'Дэвид Култхард во время гоночного уик-энда'),
    ('spa', 'spa-gallery-circuit-2005', 3, 'Спа · 2005', 'Автодром во время гоночного уик-энда'),
    ('spa', 'spa-gallery-eau-rouge-snow', 4, 'Eau Rouge зимой', 'Знаменитый подъём вне гоночного сезона'),
    ('spa', 'spa-gallery-after-finish-2011', 5, 'После финиша · 2011', 'Панорама трассы после Гран-при Бельгии'),
    ('spa', 'spa-gallery-circuit-2013', 6, 'Трасса · 2013', 'Спа-Франкоршам перед гоночным уик-эндом'),
    ('spa', 'spa-gallery-paddock-2005', 7, 'Паддок · 2005', 'Рабочая зона команд на Спа-Франкоршам');

COMMIT;
