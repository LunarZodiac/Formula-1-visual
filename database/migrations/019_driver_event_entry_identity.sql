BEGIN;

-- A driver could appear in more than one car during the same historical event.
-- Keep a surrogate key and deduplicate only identical event/driver/team/number rows.
ALTER TABLE atlas.driver_event_entries
    DROP CONSTRAINT driver_event_entries_pkey;

ALTER TABLE atlas.driver_event_entries
    ADD COLUMN id bigint GENERATED ALWAYS AS IDENTITY;

ALTER TABLE atlas.driver_event_entries
    ADD CONSTRAINT driver_event_entries_pkey PRIMARY KEY (id);

ALTER TABLE atlas.driver_event_entries
    ADD CONSTRAINT driver_event_entries_identity_unique
    UNIQUE NULLS NOT DISTINCT (race_id, driver_id, constructor_entry_id, car_number);

COMMIT;
