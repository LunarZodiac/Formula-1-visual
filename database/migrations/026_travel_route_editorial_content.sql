BEGIN;

ALTER TABLE atlas.travel_route_presentations
    ADD COLUMN rationale_ru text,
    ADD COLUMN highlights_ru text[] NOT NULL DEFAULT ARRAY[]::text[],
    ADD COLUMN practical_notes_ru text;

COMMENT ON COLUMN atlas.travel_route_presentations.rationale_ru IS
    'Почему маршрут выбран редакцией и для какого сценария он подходит';
COMMENT ON COLUMN atlas.travel_route_presentations.highlights_ru IS
    'Что путешественник увидит или посетит по пути';
COMMENT ON COLUMN atlas.travel_route_presentations.practical_notes_ru IS
    'Практические оговорки, ограничения и советы по использованию маршрута';

COMMIT;
