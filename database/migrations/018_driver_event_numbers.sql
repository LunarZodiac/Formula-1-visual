BEGIN;

-- The number belongs to a driver's entry in an event, not to the driver forever.
-- Different drivers may legitimately use the same number in different events,
-- and historical shared cars may repeat a number within one event.
CREATE TABLE atlas.driver_event_entries (
    race_id text NOT NULL REFERENCES atlas.races(id) ON DELETE CASCADE,
    driver_id text NOT NULL REFERENCES atlas.drivers(id) ON DELETE CASCADE,
    constructor_entry_id bigint REFERENCES atlas.constructor_entries(id),
    car_number smallint CHECK (car_number IS NULL OR car_number >= 0),
    number_type text NOT NULL DEFAULT 'event'
        CHECK (number_type IN ('permanent', 'season', 'event', 'champion', 'shared_car', 'unknown')),
    source_id text REFERENCES atlas.data_sources(id),
    review_status text NOT NULL DEFAULT 'imported'
        CHECK (review_status IN ('imported', 'candidate', 'reviewed', 'verified', 'rejected')),
    notes text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (race_id, driver_id)
);

CREATE INDEX driver_event_entries_driver_idx
    ON atlas.driver_event_entries (driver_id, race_id);
CREATE INDEX driver_event_entries_constructor_idx
    ON atlas.driver_event_entries (constructor_entry_id)
    WHERE constructor_entry_id IS NOT NULL;
CREATE INDEX driver_event_entries_number_idx
    ON atlas.driver_event_entries (car_number)
    WHERE car_number IS NOT NULL;

CREATE VIEW atlas.driver_number_history AS
SELECT
    entry.driver_id,
    race.season_year,
    array_agg(DISTINCT entry.car_number ORDER BY entry.car_number)
        FILTER (WHERE entry.car_number IS NOT NULL) AS car_numbers,
    array_agg(DISTINCT constructor.constructor_id ORDER BY constructor.constructor_id)
        FILTER (WHERE constructor.constructor_id IS NOT NULL) AS constructor_ids,
    count(DISTINCT entry.race_id)::integer AS event_entries,
    bool_and(entry.review_status = 'verified') AS fully_verified
FROM atlas.driver_event_entries AS entry
JOIN atlas.races AS race ON race.id = entry.race_id
LEFT JOIN atlas.constructor_entries AS constructor ON constructor.id = entry.constructor_entry_id
GROUP BY entry.driver_id, race.season_year;

COMMIT;
