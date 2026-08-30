BEGIN;

UPDATE atlas.tourism_pois AS poi
SET name_ru = names.name_ru, updated_at = now()
FROM (VALUES
  ('A Vi Mam ´di', 'А-Ви-Мамди'),
  ('Aachen Bushof', 'Автовокзал Ахен-Бушхоф'),
  ('Albert Ier', 'Отель «Альбер I»'),
  ('Auberge de Jeunesse Hautes Fagnes', 'Хостел «Высокие Фены»'),
  ('Baraque Michel', 'Барак-Мишель'),
  ('Burg Raeren', 'Замок Рарен'),
  ('Butte Baltia', 'Холм Балтия'),
  ('Camping de l''Eau Rouge', 'Кемпинг «О-Руж»'),
  ('Camping P3', 'Кемпинг P3'),
  ('Centre Hospitalier Reine Astrid Malmedy', 'Больница королевы Астрид в Мальмеди'),
  ('Charmille du Haut-Marais', 'Аллея От-Маре'),
  ('Château de Crèvecœur', 'Замок Кревкёр'),
  ('Château de la Fenderie', 'Замок Ла-Фендери'),
  ('Château Roseraie', 'Замок Розере'),
  ('CHR Verviers | La Tourelle', 'Больница Вервье «Ла-Турель»'),
  ('Clinique CHC Heusy', 'Клиника Эзи'),
  ('Fotografie-Forum der StädteRegion Aachen', 'Форум фотографии региона Ахен'),
  ('Gîte Le Monde à Part', 'Гостевой дом «Ле-Монд-а-Пар»'),
  ('Historische Senfmühle', 'Историческая горчичная мельница'),
  ('IKOB - Museum für Zeitgenössische Kunst', 'Музей современного искусства ИКОБ'),
  ('La Ferme des Planeresses', 'Ферма Планерес'),
  ('La maison des senteurs', 'Дом ароматов'),
  ('Le Floréal', 'Отель «Ле-Флореаль»'),
  ('Le Jardin Fleuri', 'Отель «Цветущий сад»'),
  ('Maison du Tourisme des Hautes Fagnes - Cantons de l’Est', 'Туристический центр Высоких Фенов'),
  ('Manoir de Lébioles', 'Усадьба Лебиоль'),
  ('P+R Gare de Nessonvaux', 'Перехватывающая парковка у станции Нессонво'),
  ('Parking SNCB Aywaille', 'Парковка у станции Айвай'),
  ('Parking SNCB Rivage', 'Парковка у станции Риваж'),
  ('Parking SNCB Trooz', 'Парковка у станции Троо'),
  ('Perron', 'Перрон Льежа'),
  ('Rotes Haus', 'Музей «Красный дом»'),
  ('Saint Géréon', 'Отель «Сен-Жереон»'),
  ('Schloss Groß Weims', 'Замок Грос-Ваймс'),
  ('Stadtmuseum Eupen', 'Городской музей Ойпена'),
  ('Tero Lodge', 'Отель «Теро Лодж»'),
  ('Un matin au jardin', 'Гостевой дом «Утро в саду»'),
  ('Waux-Hall', 'Музей Во-Холл')
) AS names(name, name_ru)
WHERE poi.name = names.name;

COMMIT;
