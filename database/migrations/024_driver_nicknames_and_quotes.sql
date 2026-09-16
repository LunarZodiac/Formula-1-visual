BEGIN;

CREATE TABLE atlas.driver_nicknames (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    driver_id text NOT NULL REFERENCES atlas.drivers(id) ON DELETE CASCADE,
    name_ru text NOT NULL CHECK (btrim(name_ru) <> ''),
    name_original text,
    context_ru text,
    sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    source_id text NOT NULL REFERENCES atlas.data_sources(id),
    source_url text NOT NULL CHECK (source_url ~ '^https?://'),
    review_status text NOT NULL DEFAULT 'candidate'
        CHECK (review_status IN ('candidate', 'reviewed', 'verified', 'published', 'rejected')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (name_original IS NULL OR btrim(name_original) <> ''),
    CHECK (context_ru IS NULL OR btrim(context_ru) <> '')
);

CREATE INDEX driver_nicknames_driver_idx
    ON atlas.driver_nicknames (driver_id, sort_order, id);

CREATE TABLE atlas.driver_quotes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    driver_id text NOT NULL REFERENCES atlas.drivers(id) ON DELETE CASCADE,
    quote_ru text NOT NULL CHECK (btrim(quote_ru) <> ''),
    quote_original text,
    attribution_ru text NOT NULL CHECK (btrim(attribution_ru) <> ''),
    context_ru text,
    quote_date date,
    sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    source_id text NOT NULL REFERENCES atlas.data_sources(id),
    source_url text NOT NULL CHECK (source_url ~ '^https?://'),
    review_status text NOT NULL DEFAULT 'candidate'
        CHECK (review_status IN ('candidate', 'reviewed', 'verified', 'published', 'rejected')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (quote_original IS NULL OR btrim(quote_original) <> ''),
    CHECK (context_ru IS NULL OR btrim(context_ru) <> '')
);

CREATE INDEX driver_quotes_driver_idx
    ON atlas.driver_quotes (driver_id, sort_order, id);

COMMIT;
