BEGIN;

CREATE TABLE atlas.track_layout_annotations (
    id text PRIMARY KEY,
    layout_id text NOT NULL REFERENCES atlas.track_layouts(id) ON DELETE CASCADE,
    annotation_type text NOT NULL CHECK (annotation_type IN (
        'sector', 'turn', 'straight', 'timing_line', 'drs_zone', 'drs_detection'
    )),
    label_ru text,
    label_original text,
    sequence smallint CHECK (sequence IS NULL OR sequence > 0),
    description_ru text,
    geometry geography(Geometry, 4326) NOT NULL,
    valid_from_year smallint CHECK (valid_from_year IS NULL OR valid_from_year BETWEEN 1900 AND 2100),
    valid_to_year smallint CHECK (valid_to_year IS NULL OR valid_to_year BETWEEN 1900 AND 2100),
    source_id text NOT NULL REFERENCES atlas.data_sources(id),
    review_status text NOT NULL DEFAULT 'candidate'
        CHECK (review_status IN ('candidate', 'reviewed', 'published', 'hidden')),
    properties jsonb NOT NULL DEFAULT '{}'::jsonb,
    verified_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (label_ru IS NOT NULL OR label_original IS NOT NULL OR sequence IS NOT NULL),
    CHECK (valid_to_year IS NULL OR valid_from_year IS NULL OR valid_to_year >= valid_from_year),
    CHECK (
        (annotation_type IN ('turn', 'timing_line', 'drs_detection') AND GeometryType(geometry::geometry) = 'POINT')
        OR
        (annotation_type IN ('sector', 'straight', 'drs_zone') AND GeometryType(geometry::geometry) = 'LINESTRING')
    )
);

CREATE INDEX track_layout_annotations_layout_period_idx
    ON atlas.track_layout_annotations (layout_id, annotation_type, valid_from_year, valid_to_year);

CREATE INDEX track_layout_annotations_geometry_gix
    ON atlas.track_layout_annotations USING gist (geometry);

CREATE UNIQUE INDEX track_layout_annotations_sequence_unique
    ON atlas.track_layout_annotations (layout_id, annotation_type, sequence, coalesce(valid_from_year, 0))
    WHERE sequence IS NOT NULL AND review_status <> 'hidden';

COMMENT ON TABLE atlas.track_layout_annotations IS
    'Исторически версионируемая разметка конфигураций: сектора, повороты, прямые, отсечки и DRS';

COMMENT ON COLUMN atlas.track_layout_annotations.geometry IS
    'Point для поворотов, отсечек и детекции DRS; LineString для секторов, прямых и зон DRS';

COMMIT;
