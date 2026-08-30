BEGIN;

-- Editorial data used by the universal circuit page. JSON files in the web
-- application are generated read-models and are not the source of truth.
CREATE TABLE atlas.circuit_page_profiles (
    circuit_id text PRIMARY KEY REFERENCES atlas.circuits(id) ON DELETE CASCADE,
    slug text NOT NULL UNIQUE,
    geometry_id text NOT NULL,
    name_ru text NOT NULL,
    city_ru text NOT NULL,
    country_ru text NOT NULL,
    summary_ru text NOT NULL,
    circuit_type_ru text NOT NULL,
    editorial_status text NOT NULL DEFAULT 'draft'
        CHECK (editorial_status IN ('draft', 'review', 'published')),
    source_id text REFERENCES atlas.data_sources(id),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE atlas.circuit_page_stats (
    circuit_id text NOT NULL REFERENCES atlas.circuit_page_profiles(circuit_id) ON DELETE CASCADE,
    section text NOT NULL CHECK (section IN ('highlight', 'metric', 'stat_bar')),
    sort_order smallint NOT NULL CHECK (sort_order >= 0),
    label_ru text NOT NULL,
    value_ru text,
    note_ru text,
    icon text CHECK (icon IS NULL OR icon IN ('length', 'turns', 'debut', 'record', 'elevation', 'type')),
    source_id text REFERENCES atlas.data_sources(id),
    PRIMARY KEY (circuit_id, section, sort_order),
    CHECK (
        (section = 'highlight' AND value_ru IS NULL AND icon IS NULL)
        OR (section IN ('metric', 'stat_bar') AND value_ru IS NOT NULL)
    )
);

CREATE TABLE atlas.circuit_history_entries (
    id text PRIMARY KEY,
    circuit_id text NOT NULL REFERENCES atlas.circuit_page_profiles(circuit_id) ON DELETE CASCADE,
    sort_order smallint NOT NULL CHECK (sort_order >= 0),
    year_label text NOT NULL,
    title_ru text NOT NULL,
    description_ru text NOT NULL,
    media_asset_id text REFERENCES atlas.media_assets(id),
    source_id text REFERENCES atlas.data_sources(id),
    UNIQUE (circuit_id, sort_order)
);

CREATE TABLE atlas.circuit_media_gallery (
    circuit_id text NOT NULL REFERENCES atlas.circuit_page_profiles(circuit_id) ON DELETE CASCADE,
    media_asset_id text NOT NULL REFERENCES atlas.media_assets(id) ON DELETE CASCADE,
    sort_order smallint NOT NULL CHECK (sort_order >= 0),
    title_ru text NOT NULL,
    description_ru text NOT NULL,
    PRIMARY KEY (circuit_id, media_asset_id),
    UNIQUE (circuit_id, sort_order)
);

CREATE INDEX circuit_history_entries_circuit_order_idx
    ON atlas.circuit_history_entries (circuit_id, sort_order);
CREATE INDEX circuit_media_gallery_circuit_order_idx
    ON atlas.circuit_media_gallery (circuit_id, sort_order);

COMMIT;
