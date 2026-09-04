BEGIN;

ALTER TABLE atlas.media_assets
    ADD COLUMN usage_role text NOT NULL DEFAULT 'general',
    ADD COLUMN source_id text REFERENCES atlas.data_sources(id),
    ADD COLUMN provenance_type text NOT NULL DEFAULT 'unknown'
        CHECK (provenance_type IN ('verified_source', 'provided_by_user', 'generated', 'unknown')),
    ADD COLUMN rights_status text NOT NULL DEFAULT 'unresolved'
        CHECK (rights_status IN ('verified', 'unresolved', 'restricted')),
    ADD COLUMN review_status text NOT NULL DEFAULT 'candidate'
        CHECK (review_status IN ('candidate', 'reviewed', 'published', 'hidden')),
    ADD COLUMN verified_at timestamptz,
    ADD COLUMN usage_scope text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE atlas.media_assets
    ADD CONSTRAINT media_assets_reviewed_rights_check CHECK (
        review_status NOT IN ('reviewed', 'published')
        OR (
            rights_status = 'verified'
            AND source_id IS NOT NULL
            AND source_url IS NOT NULL
            AND author IS NOT NULL
            AND licence IS NOT NULL
            AND alt_text_ru IS NOT NULL
            AND verified_at IS NOT NULL
        )
    );

DROP INDEX IF EXISTS atlas.media_assets_one_primary_idx;
CREATE UNIQUE INDEX media_assets_one_primary_idx
    ON atlas.media_assets (
        entity_type, entity_id, media_type, usage_role, COALESCE(season_year, 0)
    )
    WHERE is_primary;

CREATE TABLE atlas.media_asset_derivatives (
    id text PRIMARY KEY,
    media_asset_id text NOT NULL REFERENCES atlas.media_assets(id) ON DELETE CASCADE,
    variant text NOT NULL,
    url text NOT NULL,
    mime_type text NOT NULL,
    width_px integer CHECK (width_px > 0),
    height_px integer CHECK (height_px > 0),
    file_size_bytes bigint CHECK (file_size_bytes > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (media_asset_id, variant)
);

CREATE INDEX media_assets_review_rights_idx
    ON atlas.media_assets (review_status, rights_status, provenance_type);
CREATE INDEX media_asset_derivatives_asset_idx
    ON atlas.media_asset_derivatives (media_asset_id);

COMMIT;
