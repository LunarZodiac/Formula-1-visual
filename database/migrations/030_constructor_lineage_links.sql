BEGIN;

CREATE TABLE atlas.constructor_lineage_links (
    id bigserial PRIMARY KEY,
    predecessor_constructor_id text NOT NULL REFERENCES atlas.constructors(id) ON DELETE CASCADE,
    successor_constructor_id text NOT NULL REFERENCES atlas.constructors(id) ON DELETE CASCADE,
    relationship_type text NOT NULL CHECK (relationship_type IN (
        'rename', 'ownership_change', 'factory_takeover', 'licence_transfer', 'continuation', 'other'
    )),
    valid_from_year smallint CHECK (valid_from_year IS NULL OR valid_from_year BETWEEN 1950 AND 2100),
    valid_to_year smallint CHECK (valid_to_year IS NULL OR valid_to_year BETWEEN 1950 AND 2100),
    description_ru text,
    source_id text NOT NULL REFERENCES atlas.data_sources(id),
    review_status text NOT NULL DEFAULT 'candidate'
        CHECK (review_status IN ('candidate', 'reviewed', 'published', 'rejected')),
    verified_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (predecessor_constructor_id <> successor_constructor_id),
    CHECK (valid_to_year IS NULL OR valid_from_year IS NULL OR valid_to_year >= valid_from_year),
    CHECK (review_status = 'candidate' OR verified_at IS NOT NULL)
);

CREATE UNIQUE INDEX constructor_lineage_links_identity_unique
    ON atlas.constructor_lineage_links (
        predecessor_constructor_id,
        successor_constructor_id,
        relationship_type,
        coalesce(valid_from_year, 0)
    );

CREATE INDEX constructor_lineage_links_predecessor_idx
    ON atlas.constructor_lineage_links (predecessor_constructor_id, review_status);

CREATE INDEX constructor_lineage_links_successor_idx
    ON atlas.constructor_lineage_links (successor_constructor_id, review_status);

COMMENT ON TABLE atlas.constructor_lineage_links IS
    'Проверяемые связи преемственности между отдельными идентичностями команд без автоматического объединения статистики';

COMMENT ON COLUMN atlas.constructor_lineage_links.relationship_type IS
    'Причина связи: переименование, смена владельца, переход заводской команды, лицензии или иная подтверждённая преемственность';

COMMIT;
