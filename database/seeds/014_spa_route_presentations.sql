BEGIN;

INSERT INTO atlas.travel_route_presentations (
    route_id, route_group, sort_order, line_offset_px, line_colour,
    min_zoom, max_zoom, visible_by_default, notes_ru
) VALUES
    ('spa-route-liege-arrival', 'spa-combes-approach', 1, -9, '#58C7E8', 8, 18, false,
     'Региональный маршрут прибытия; общий финальный участок разведён смещением'),
    ('spa-route-brussels-airport', 'spa-combes-approach', 2, -6, '#4FA8E8', 7, 18, false,
     'Дальний маршрут прибытия из аэропорта'),
    ('spa-route-charleroi-airport', 'spa-combes-approach', 3, -3, '#668DE8', 7, 18, false,
     'Дальний маршрут прибытия из аэропорта'),
    ('spa-route-cologne-airport', 'spa-combes-approach', 4, 0, '#7A78E8', 7, 18, false,
     'Трансграничный маршрут прибытия'),
    ('spa-route-stavelot', 'spa-combes-approach', 5, 3, '#7FD98A', 9, 18, true,
     'Ближний маршрут прибытия'),
    ('spa-route-coo-half-day', 'spa-combes-approach', 6, 6, '#A47CFF', 9, 18, false,
     'Туристический маршрут на половину дня'),
    ('spa-route-high-fens', 'spa-combes-approach', 7, 9, '#C86DFF', 8, 18, false,
     'Туристический маршрут на полный день')
ON CONFLICT (route_id) DO UPDATE SET
    route_group = EXCLUDED.route_group,
    sort_order = EXCLUDED.sort_order,
    line_offset_px = EXCLUDED.line_offset_px,
    line_colour = EXCLUDED.line_colour,
    min_zoom = EXCLUDED.min_zoom,
    max_zoom = EXCLUDED.max_zoom,
    visible_by_default = EXCLUDED.visible_by_default,
    notes_ru = EXCLUDED.notes_ru,
    updated_at = now();

COMMIT;
