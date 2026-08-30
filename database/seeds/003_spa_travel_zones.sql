BEGIN;

DELETE FROM atlas.travel_zones
WHERE circuit_id = 'spa' AND properties->>'seed' = 'spa-v1';

INSERT INTO atlas.travel_zones (
    id, circuit_id, zone_type, name, name_ru, description_ru, geometry,
    priority, price_band, best_for, advantages_ru, disadvantages_ru,
    source_id, properties, review_status
) VALUES
    ('spa-stay-francorchamps', 'spa', 'accommodation', 'Francorchamps', 'Франкоршам',
     'Ближайшая зона к автодрому для тех, кому важен короткий путь до входа',
     ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(5.9526, 50.4533), 4326)::geography, 2600)::geometry)::geography,
     100, 3, ARRAY['короткий путь до трассы', 'кемпинг', 'атмосфера этапа'],
     ARRAY['можно добраться до части входов пешком', 'максимальное погружение в гоночный уик-энд'],
     ARRAY['ограниченный выбор жилья', 'шум и плотный трафик'], 'visit_wallonia', '{"seed":"spa-v1","geometry":"editorial-radius"}', 'reviewed'),
    ('spa-stay-malmedy', 'spa', 'accommodation', 'Malmedy', 'Мальмеди',
     'Основная практичная база к востоку от трассы с городской инфраструктурой',
     ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(6.0270, 50.4267), 4326)::geography, 3200)::geometry)::geography,
     95, 2, ARRAY['автомобиль', 'рестораны', 'семья'],
     ARRAY['много повседневных сервисов', 'удобный доступ к восточной стороне трассы'],
     ARRAY['в гоночные дни возможны пробки'], 'visit_wallonia', '{"seed":"spa-v1","geometry":"editorial-radius"}', 'reviewed'),
    ('spa-stay-stavelot', 'spa', 'accommodation', 'Stavelot', 'Ставло',
     'Исторический город рядом с аббатством и музеем трассы',
     ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(5.9312, 50.3941), 4326)::geography, 2800)::geometry)::geography,
     92, 2, ARRAY['история', 'спокойный отдых', 'музей автоспорта'],
     ARRAY['близко к трассе и водопаду Коо', 'выразительная историческая среда'],
     ARRAY['меньше вариантов позднего транспорта'], 'visit_wallonia', '{"seed":"spa-v1","geometry":"editorial-radius"}', 'reviewed'),
    ('spa-stay-spa', 'spa', 'accommodation', 'Spa', 'Спа',
     'Курортный город с вокзалом, ресторанами, отелями и термальной инфраструктурой',
     ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(5.8667, 50.4920), 4326)::geography, 3500)::geometry)::geography,
     90, 3, ARRAY['без автомобиля', 'отели', 'городская прогулка'],
     ARRAY['железнодорожная станция', 'широкий выбор размещения и ресторанов'],
     ARRAY['до автодрома требуется отдельный трансфер'], 'visit_wallonia', '{"seed":"spa-v1","geometry":"editorial-radius"}', 'reviewed'),
    ('spa-stay-trois-ponts', 'spa', 'accommodation', 'Trois-Ponts', 'Труа-Пон',
     'Небольшой транспортный узел рядом со Ставло и Коо',
     ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(5.8713, 50.3712), 4326)::geography, 2400)::geometry)::geography,
     82, 2, ARRAY['поезд', 'природа', 'спокойный отдых'],
     ARRAY['железнодорожная станция', 'удобно совместить этап с Коо'],
     ARRAY['мало вариантов размещения'], 'visit_wallonia', '{"seed":"spa-v1","geometry":"editorial-radius"}', 'reviewed'),
    ('spa-stay-verviers', 'spa', 'accommodation', 'Verviers', 'Вервье',
     'Городская база у официального железнодорожного маршрута на этап',
     ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(5.8624, 50.5900), 4326)::geography, 4200)::geometry)::geography,
     85, 2, ARRAY['общественный транспорт', 'бюджетное размещение', 'длительная поездка'],
     ARRAY['узловой вокзал Вервье-Центральный', 'больше городских сервисов'],
     ARRAY['дальше от трассы', 'зависимость от расписания трансфера'], 'spa_grand_prix', '{"seed":"spa-v1","geometry":"editorial-radius"}', 'reviewed');

COMMIT;
