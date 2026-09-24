BEGIN;

CREATE TABLE atlas.travel_access_anchors (
    id text PRIMARY KEY CHECK (btrim(id) <> ''),
    circuit_id text NOT NULL REFERENCES atlas.circuits(id) ON DELETE CASCADE,
    poi_id text NOT NULL REFERENCES atlas.tourism_pois(id) ON DELETE CASCADE,
    access_kind text NOT NULL
        CHECK (access_kind IN ('gate', 'parking', 'dropoff', 'shuttle_stop', 'approach')),
    travel_modes text[] NOT NULL DEFAULT ARRAY[]::text[],
    event_scope text NOT NULL DEFAULT 'general'
        CHECK (event_scope IN ('general', 'event')),
    valid_from_year smallint
        CHECK (valid_from_year IS NULL OR valid_from_year BETWEEN 1900 AND 2100),
    valid_to_year smallint
        CHECK (valid_to_year IS NULL OR valid_to_year BETWEEN 1900 AND 2100),
    verification_status text NOT NULL DEFAULT 'candidate'
        CHECK (verification_status IN ('candidate', 'needs_review', 'verified', 'rejected', 'expired')),
    confidence smallint NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
    source_id text REFERENCES atlas.data_sources(id),
    evidence_note_ru text,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (array_ndims(travel_modes) IS NULL OR array_ndims(travel_modes) = 1),
    CHECK (array_position(travel_modes, NULL) IS NULL),
    CHECK (array_position(travel_modes, '') IS NULL),
    CHECK (
        valid_to_year IS NULL
        OR valid_from_year IS NULL
        OR valid_to_year >= valid_from_year
    ),
    CHECK (
        verification_status <> 'verified'
        OR (
            source_id IS NOT NULL
            AND verified_at IS NOT NULL
            AND confidence >= 70
            AND cardinality(travel_modes) > 0
        )
    )
);

CREATE UNIQUE INDEX travel_access_anchors_identity_uq
    ON atlas.travel_access_anchors (
        circuit_id,
        poi_id,
        access_kind,
        event_scope,
        COALESCE(valid_from_year, 0),
        COALESCE(valid_to_year, 32767)
    );

CREATE INDEX travel_access_anchors_circuit_status_idx
    ON atlas.travel_access_anchors (
        circuit_id,
        verification_status,
        event_scope,
        access_kind
    );

CREATE INDEX travel_access_anchors_review_queue_idx
    ON atlas.travel_access_anchors (verification_status, confidence DESC, updated_at DESC)
    WHERE verification_status IN ('candidate', 'needs_review');

CREATE INDEX travel_access_anchors_poi_idx
    ON atlas.travel_access_anchors (poi_id);

CREATE INDEX travel_access_anchors_source_idx
    ON atlas.travel_access_anchors (source_id)
    WHERE source_id IS NOT NULL;

CREATE TRIGGER touch_updated_at
    BEFORE UPDATE ON atlas.travel_access_anchors
    FOR EACH ROW EXECUTE FUNCTION atlas.touch_updated_at();

COMMIT;
