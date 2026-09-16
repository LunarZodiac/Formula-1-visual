BEGIN;

INSERT INTO atlas.poi_categories (
    id, name_ru, name_en, icon, default_priority, group_id, min_zoom, is_clustered
) VALUES (
    'cafe', 'Кафе', 'Cafe', 'cafe', 48, 'essential', 13, true
)
ON CONFLICT (id) DO UPDATE SET
    name_ru = EXCLUDED.name_ru,
    name_en = EXCLUDED.name_en,
    icon = EXCLUDED.icon,
    default_priority = EXCLUDED.default_priority,
    group_id = EXCLUDED.group_id,
    min_zoom = EXCLUDED.min_zoom,
    is_clustered = EXCLUDED.is_clustered;

CREATE TABLE atlas.travel_import_runs (
    id text PRIMARY KEY,
    circuit_id text NOT NULL REFERENCES atlas.circuits(id) ON DELETE CASCADE,
    provider text NOT NULL,
    parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'previewed'
        CHECK (status IN ('previewed', 'imported', 'failed', 'expired')),
    discovered_count integer NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
    imported_count integer NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
    failed_groups text[] NOT NULL DEFAULT ARRAY[]::text[],
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    applied_at timestamptz,
    error_message text
);

CREATE INDEX travel_import_runs_circuit_created_idx
    ON atlas.travel_import_runs (circuit_id, created_at DESC);

COMMIT;
