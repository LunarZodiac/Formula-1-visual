BEGIN;

-- Editorial history eras are independent of seasons and races. Their stable
-- slugs form the public URL contract; the current era has an open end year.
CREATE TABLE atlas.history_eras (
    slug text PRIMARY KEY CHECK (slug IN (
        '1950-1959',
        '1960-1979',
        '1980-1999',
        '2000-2013',
        '2014-2021',
        '2022-present'
    )),
    start_year smallint NOT NULL CHECK (start_year >= 1950),
    end_year smallint,
    years_label text NOT NULL CHECK (btrim(years_label) <> ''),
    title_ru text NOT NULL CHECK (btrim(title_ru) <> ''),
    summary_ru text NOT NULL CHECK (btrim(summary_ru) <> ''),
    editorial_status text NOT NULL DEFAULT 'draft'
        CHECK (editorial_status IN ('draft', 'review', 'published')),
    hero_media_asset_id text REFERENCES atlas.media_assets(id),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_year IS NULL OR end_year >= start_year)
);

CREATE TABLE atlas.history_era_blocks (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    era_slug text NOT NULL REFERENCES atlas.history_eras(slug) ON DELETE CASCADE,
    sort_order smallint NOT NULL CHECK (sort_order >= 0),
    block_type text NOT NULL
        CHECK (block_type IN ('text', 'media', 'quote', 'timeline', 'entities')),
    eyebrow_ru text CHECK (eyebrow_ru IS NULL OR btrim(eyebrow_ru) <> ''),
    title_ru text CHECK (title_ru IS NULL OR btrim(title_ru) <> ''),
    body_ru text CHECK (body_ru IS NULL OR btrim(body_ru) <> ''),
    media_asset_id text REFERENCES atlas.media_assets(id),
    media_position text CHECK (media_position IN ('left', 'right', 'wide')),
    source_id text REFERENCES atlas.data_sources(id),
    source_url text,
    editorial_status text NOT NULL DEFAULT 'draft'
        CHECK (editorial_status IN ('draft', 'review', 'published')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (era_slug, sort_order),
    CHECK (
        (media_asset_id IS NULL AND media_position IS NULL)
        OR (media_asset_id IS NOT NULL AND media_position IS NOT NULL)
    ),
    CHECK (block_type <> 'media' OR media_asset_id IS NOT NULL),
    CHECK (block_type NOT IN ('text', 'quote') OR body_ru IS NOT NULL),
    CHECK (source_url IS NULL OR btrim(source_url) <> ''),
    CHECK (source_url IS NULL OR source_id IS NOT NULL)
);

-- An entities block may point at heterogeneous atlas records. Nullable typed
-- foreign keys retain referential integrity without a polymorphic text ID.
CREATE TABLE atlas.history_era_block_entities (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    block_id bigint NOT NULL REFERENCES atlas.history_era_blocks(id) ON DELETE CASCADE,
    sort_order smallint NOT NULL CHECK (sort_order >= 0),
    entity_type text NOT NULL
        CHECK (entity_type IN ('season', 'circuit', 'driver', 'constructor', 'race')),
    season_year smallint REFERENCES atlas.seasons(year),
    circuit_id text REFERENCES atlas.circuits(id),
    driver_id text REFERENCES atlas.drivers(id),
    constructor_id text REFERENCES atlas.constructors(id),
    race_id text REFERENCES atlas.races(id),
    label_ru text CHECK (label_ru IS NULL OR btrim(label_ru) <> ''),
    UNIQUE (block_id, sort_order),
    CHECK (
        num_nonnulls(season_year, circuit_id, driver_id, constructor_id, race_id) = 1
    ),
    CHECK (
        (entity_type = 'season' AND season_year IS NOT NULL)
        OR (entity_type = 'circuit' AND circuit_id IS NOT NULL)
        OR (entity_type = 'driver' AND driver_id IS NOT NULL)
        OR (entity_type = 'constructor' AND constructor_id IS NOT NULL)
        OR (entity_type = 'race' AND race_id IS NOT NULL)
    )
);

CREATE INDEX history_eras_public_order_idx
    ON atlas.history_eras (start_year, slug)
    WHERE editorial_status = 'published';
CREATE INDEX history_era_blocks_public_order_idx
    ON atlas.history_era_blocks (era_slug, sort_order)
    WHERE editorial_status = 'published';
CREATE INDEX history_era_block_entities_block_order_idx
    ON atlas.history_era_block_entities (block_id, sort_order);

INSERT INTO atlas.history_eras (
    slug, start_year, end_year, years_label, title_ru, summary_ru, editorial_status
) VALUES
    ('1950-1959', 1950, 1959, '1950 – 1959', 'Рождение чемпионата',
     'Первые сезоны формируют календарь и язык нового мирового первенства', 'draft'),
    ('1960-1979', 1960, 1979, '1960 – 1979', 'Расширение географии',
     'Чемпионат выходит за пределы исходного европейского ядра, а трассы и техника быстро меняются', 'draft'),
    ('1980-1999', 1980, 1999, '1980 – 1999', 'Глобальная серия',
     'Календарь становится устойчиво международным, а команды превращаются в сложные инженерные организации', 'draft'),
    ('2000-2013', 2000, 2013, '2000 – 2013', 'Эпоха систем',
     'Данные, безопасность и регламент всё сильнее определяют развитие машин и автодромов', 'draft'),
    ('2014-2021', 2014, 2021, '2014 – 2021', 'Гибридный поворот',
     'Новая силовая архитектура меняет баланс эффективности, мощности и инженерной конкуренции', 'draft'),
    ('2022-present', 2022, NULL, '2022 – наши дни', 'Современная эра',
     'Новый технический цикл сочетается с самым широким географическим охватом календаря', 'draft');

COMMIT;
