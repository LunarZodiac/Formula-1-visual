BEGIN;

INSERT INTO atlas.data_sources (id, name, url, licence, retrieved_at, notes)
VALUES
    (
        'visit_wallonia_stavelot',
        'VISITWallonia — Stavelot',
        'https://visitwallonia.com/en-gb/3/where-to-go/walloon-towns-and-cities/stavelot',
        'Official tourism website',
        '2026-09-09T00:00:00Z',
        'Исторический центр Ставло, аббатство, музеи, водопад Коо и прогулочные маршруты региона'
    ),
    (
        'visit_wallonia_coo',
        'VISITWallonia — Coo waterfall',
        'https://visitwallonia.com/en-gb/3/where-to-go-in-wallonia/memorial-towns/stavelot/in-the-area/the-coo-waterfall-province-of-liege/38033',
        'Official tourism website',
        '2026-09-09T00:00:00Z',
        'Официальная туристическая карточка водопада Коо в Ставло'
    ),
    (
        'visit_wallonia_high_fens',
        'VISITWallonia — Hautes Fagnes-Eifel Nature Park',
        'https://visitwallonia.com/en-gb/content/hautes-fagnes-eifel-nature-park',
        'Official tourism website',
        '2026-09-09T00:00:00Z',
        'Природный парк Высокие Фены — Эйфель, Maison du Parc-Botrange и Signal de Botrange'
    ),
    (
        'visit_wallonia_reinhardstein',
        'VISITWallonia — Reinhardstein Castle',
        'https://visitwallonia.com/en-gb/content/reinhardstein-castle-ovifat',
        'Official tourism website',
        '2026-09-09T00:00:00Z',
        'Официальная туристическая карточка замка Рейнхардштайн'
    )
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

UPDATE atlas.travel_routes
SET source_id = 'spa_grand_prix_mobility_2027',
    schedule_notes_ru = 'Линия рассчитана OSRM и служит только ориентиром вне схемы движения этапа. В дни Гран-при необходимо использовать Waze-ссылку из парковочного билета и указания организатора; зоны kiss & ride в 2027 году нет.',
    updated_at = now()
WHERE id IN (
    'spa-route-brussels-airport',
    'spa-route-charleroi-airport',
    'spa-route-cologne-airport',
    'spa-route-liege-arrival'
)
  AND review_status = 'candidate';

UPDATE atlas.travel_routes
SET geometry = NULL,
    distance_m = NULL,
    duration_minutes = NULL,
    source_id = 'spa_grand_prix_mobility_2027',
    schedule_notes_ru = 'Официальный трансфер следует от вокзала Вервье-Центральный до Rue de Sart перед кольцом Trou Hennet. Точная линия движения организатором не опубликована, поэтому геометрия намеренно отсутствует.',
    verified_at = NULL,
    updated_at = now()
WHERE id = 'spa-route-verviers-shuttle'
  AND review_status = 'hidden';

INSERT INTO atlas.travel_route_presentations (
    route_id, route_group, sort_order, line_offset_px, line_colour,
    min_zoom, max_zoom, visible_by_default, notes_ru,
    rationale_ru, highlights_ru, practical_notes_ru
) VALUES (
    'spa-route-verviers-shuttle', 'spa-official-shuttle', 1, 0, '#58C7E8',
    8, 18, false,
    'Скрыт до появления подтверждённой линии движения',
    'Официальный вариант без автомобиля между железнодорожным узлом Вервье и районом трассы.',
    ARRAY['Вокзал Вервье-Центральный', 'Высадка на Rue de Sart у Trou Hennet'],
    'Билет приобретается отдельно. Проверяйте расписание и стоимость для конкретного года; обычные линии TEC по воскресеньям могут не обслуживать трассу.'
)
ON CONFLICT (route_id) DO UPDATE SET
    route_group = EXCLUDED.route_group,
    sort_order = EXCLUDED.sort_order,
    line_offset_px = EXCLUDED.line_offset_px,
    line_colour = EXCLUDED.line_colour,
    min_zoom = EXCLUDED.min_zoom,
    max_zoom = EXCLUDED.max_zoom,
    visible_by_default = EXCLUDED.visible_by_default,
    notes_ru = EXCLUDED.notes_ru,
    rationale_ru = EXCLUDED.rationale_ru,
    highlights_ru = EXCLUDED.highlights_ru,
    practical_notes_ru = EXCLUDED.practical_notes_ru,
    updated_at = now();

UPDATE atlas.travel_routes
SET source_id = 'visit_wallonia_stavelot',
    schedule_notes_ru = 'Обычный дорожный ориентир, не схема въезда на этап. В дни Гран-при следуйте информации организатора и маршруту к парковочной зоне из билета.',
    updated_at = now()
WHERE id = 'spa-route-stavelot'
  AND review_status = 'candidate';

UPDATE atlas.travel_routes
SET source_id = 'visit_wallonia_stavelot',
    schedule_notes_ru = 'Туристический сценарий рассчитан для свободного времени вне поездки на этап. Перед выездом проверьте часы работы объектов и дорожную обстановку.',
    updated_at = now()
WHERE id = 'spa-route-coo-half-day'
  AND review_status = 'candidate';

UPDATE atlas.travel_routes
SET source_id = 'visit_wallonia_high_fens',
    schedule_notes_ru = 'Туристический сценарий на полный день. Перед выездом проверьте погоду, доступность природных участков и часы посещения замка.',
    updated_at = now()
WHERE id = 'spa-route-high-fens'
  AND review_status = 'candidate';

UPDATE atlas.travel_route_presentations
SET rationale_ru = 'Показывает масштаб автомобильного переезда от крупного международного аэропорта. Это предварительный ориентир для планирования, а не разрешённая схема въезда на этап.',
    highlights_ru = ARRAY['Переезд из региона Брюсселя в Арденны', 'Подход к району Франкоршам'],
    practical_notes_ru = 'В дни Гран-при выбирайте парковочную зону заранее и следуйте Waze-ссылке из билета: организатор может изменить подъездные дороги.',
    updated_at = now()
WHERE route_id = 'spa-route-brussels-airport';

UPDATE atlas.travel_route_presentations
SET rationale_ru = 'Даёт предварительное представление о поездке от аэропорта Брюссель-Шарлеруа до региона трассы. Линия не заменяет сезонную схему движения этапа.',
    highlights_ru = ARRAY['Переезд из Шарлеруа в Арденны', 'Подход к району Франкоршам'],
    practical_notes_ru = 'Не используйте конечную точку как место высадки. В 2027 году kiss & ride не предусмотрен; въезд определяется парковочным билетом.',
    updated_at = now()
WHERE route_id = 'spa-route-charleroi-airport';

UPDATE atlas.travel_route_presentations
SET rationale_ru = 'Показывает трансграничный автомобильный сценарий из аэропорта Кёльн/Бонн и помогает оценить протяжённость поездки до Арденн.',
    highlights_ru = ARRAY['Трансграничный переезд из Германии', 'Подход к району Франкоршам'],
    practical_notes_ru = 'Проверьте дорожную обстановку и требования прокатной компании. В дни этапа используйте только назначенный организатором подъезд к своей парковке.',
    updated_at = now()
WHERE route_id = 'spa-route-cologne-airport';

UPDATE atlas.travel_route_presentations
SET rationale_ru = 'Ориентир для зрителей, которые начинают автомобильную часть поездки у вокзала Льеж-Гийемен.',
    highlights_ru = ARRAY['Вокзал Льеж-Гийемен', 'Переезд из Льежа в Арденны'],
    practical_notes_ru = 'Сначала сравните этот вариант с официальным City Shuttle из Льежа. В дни этапа автомобильный въезд зависит от выбранной парковочной зоны.',
    updated_at = now()
WHERE route_id = 'spa-route-liege-arrival';

UPDATE atlas.travel_route_presentations
SET rationale_ru = 'Короткий ориентир из исторического центра Ставло — удобной базы рядом с трассой и музеем Спа-Франкоршам в аббатстве.',
    highlights_ru = ARRAY['Исторический центр Ставло', 'Аббатство Ставло', 'Музей трассы Спа-Франкоршам'],
    practical_notes_ru = 'В гоночные дни обычная линия может не соответствовать организации движения. Используйте назначенную парковку и официальную навигацию этапа.',
    updated_at = now()
WHERE route_id = 'spa-route-stavelot';

UPDATE atlas.travel_route_presentations
SET rationale_ru = 'Компактный сценарий объединяет исторический Ставло, автомобильный музей в аббатстве и водопад Коо без дальней поездки по региону.',
    highlights_ru = ARRAY['Аббатство Ставло', 'Музей трассы Спа-Франкоршам', 'Водопад Коо'],
    practical_notes_ru = 'Закладывайте не меньше половины дня и заранее проверяйте часы работы музеев. Не совмещайте маршрут с жёстким временем входа на этап.',
    updated_at = now()
WHERE route_id = 'spa-route-coo-half-day';

UPDATE atlas.travel_route_presentations
SET rationale_ru = 'Полный день для знакомства с природным ландшафтом Высоких Фен, высшей точкой Бельгии и историческим замком в долине Варш.',
    highlights_ru = ARRAY['Maison du Parc-Botrange', 'Signal de Botrange', 'Замок Рейнхардштайн'],
    practical_notes_ru = 'Погода на плато меняется быстро. Проверьте доступность троп и расписание экскурсий в замке; этот сценарий лучше оставить на день без гоночных сессий.',
    updated_at = now()
WHERE route_id = 'spa-route-high-fens';

COMMIT;
