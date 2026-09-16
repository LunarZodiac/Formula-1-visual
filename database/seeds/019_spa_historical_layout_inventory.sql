BEGIN;

-- Справочный инвентарь исторических конфигураций Спа-Франкоршам.
-- Эти записи намеренно не содержат centerline и не назначаются этапам:
-- геометрию и соответствие конкретной гонке нужно подтвердить отдельно.

INSERT INTO atlas.data_sources (
    id, name, url, licence, retrieved_at, notes
) VALUES
    (
        'fia_circuit_history_2019',
        'FIA — Circuit history brochure 2019',
        'https://www.fia.com/sites/default/files/brochure_2019_fia_compressed.pdf',
        'Official document',
        '2026-09-09T00:00:00Z',
        'Официальная сводка FIA с длинами конфигураций и периодами их использования'
    ),
    (
        'fia_spa_2014_preview',
        'FIA — 2014 Belgian Grand Prix preview',
        'https://www.fia.com/news/2014-belgian-grand-prix-preview',
        'Official website',
        '2026-09-09T00:00:00Z',
        'История перехода от большого кольца к сокращённой конфигурации Спа'
    )
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    url = EXCLUDED.url,
    licence = EXCLUDED.licence,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;

INSERT INTO atlas.track_layouts (
    id,
    circuit_id,
    name,
    valid_from_year,
    valid_to_year,
    length_m,
    source_id,
    metadata,
    provenance_type,
    review_status,
    verified_at
) VALUES
    (
        'be-spa-1970', 'spa', 'Большая конфигурация Спа — версия 1970 года',
        1970, 1970, 14100, 'fia_circuit_history_2019',
        jsonb_build_object(
            'inventoryOnly', true,
            'geometryStatus', 'missing',
            'assignmentStatus', 'blocked_until_geometry_review',
            'verificationNoteRu', 'FIA указывает длину 14,100 км для конфигурации 1970 года; контур ещё не внесён'
        ),
        'official', 'candidate', NULL
    ),
    (
        'be-spa-1983', 'spa', 'Сокращённая конфигурация Спа — версия 1983 года',
        1983, 1983, 6949, 'fia_circuit_history_2019',
        jsonb_build_object(
            'inventoryOnly', true,
            'geometryStatus', 'missing',
            'assignmentStatus', 'blocked_until_geometry_review',
            'verificationNoteRu', 'FIA указывает длину 6,949 км для конфигурации 1983 года; контур ещё не внесён'
        ),
        'official', 'candidate', NULL
    ),
    (
        'be-spa-1985-1991', 'spa', 'Конфигурация Спа 1985–1991 годов',
        1985, 1991, 6940, 'fia_circuit_history_2019',
        jsonb_build_object(
            'inventoryOnly', true,
            'geometryStatus', 'missing',
            'assignmentStatus', 'blocked_until_geometry_review',
            'verificationNoteRu', 'FIA указывает длину 6,940 км для периода 1985–1991; контур ещё не внесён'
        ),
        'official', 'candidate', NULL
    ),
    (
        'be-spa-1992-1993', 'spa', 'Конфигурация Спа 1992–1993 годов',
        1992, 1993, 6974, 'fia_circuit_history_2019',
        jsonb_build_object(
            'inventoryOnly', true,
            'geometryStatus', 'missing',
            'assignmentStatus', 'blocked_until_geometry_review',
            'verificationNoteRu', 'FIA указывает длину 6,974 км для периода 1992–1993; контур ещё не внесён'
        ),
        'official', 'candidate', NULL
    ),
    (
        'be-spa-1994', 'spa', 'Конфигурация Спа 1994 года',
        1994, 1994, 7001, 'fia_circuit_history_2019',
        jsonb_build_object(
            'inventoryOnly', true,
            'geometryStatus', 'missing',
            'assignmentStatus', 'blocked_until_geometry_review',
            'verificationNoteRu', 'FIA указывает длину 7,001 км для конфигурации 1994 года; контур ещё не внесён'
        ),
        'official', 'candidate', NULL
    ),
    (
        'be-spa-1995', 'spa', 'Конфигурация Спа 1995 года',
        1995, 1995, 6974, 'fia_circuit_history_2019',
        jsonb_build_object(
            'inventoryOnly', true,
            'geometryStatus', 'missing',
            'assignmentStatus', 'blocked_until_geometry_review',
            'verificationNoteRu', 'FIA указывает длину 6,974 км для конфигурации 1995 года; отдельная запись нужна из-за версии 1994 года'
        ),
        'official', 'candidate', NULL
    ),
    (
        'be-spa-1996-2001', 'spa', 'Конфигурация Спа 1996–2001 годов',
        1996, 2001, 6968, 'fia_circuit_history_2019',
        jsonb_build_object(
            'inventoryOnly', true,
            'geometryStatus', 'missing',
            'assignmentStatus', 'blocked_until_geometry_review',
            'verificationNoteRu', 'FIA указывает длину 6,968 км для периода 1996–2001; контур ещё не внесён'
        ),
        'official', 'candidate', NULL
    ),
    (
        'be-spa-2002', 'spa', 'Конфигурация Спа 2002 года',
        2002, 2002, 6963, 'fia_circuit_history_2019',
        jsonb_build_object(
            'inventoryOnly', true,
            'geometryStatus', 'missing',
            'assignmentStatus', 'blocked_until_geometry_review',
            'verificationNoteRu', 'FIA указывает длину 6,963 км для конфигурации 2002 года; контур ещё не внесён'
        ),
        'official', 'candidate', NULL
    ),
    (
        'be-spa-2004-2005', 'spa', 'Конфигурация Спа 2004–2005 годов',
        2004, 2005, 6976, 'fia_circuit_history_2019',
        jsonb_build_object(
            'inventoryOnly', true,
            'geometryStatus', 'missing',
            'assignmentStatus', 'blocked_until_geometry_review',
            'verificationNoteRu', 'FIA указывает длину 6,976 км для периода 2004–2005; контур ещё не внесён'
        ),
        'official', 'candidate', NULL
    )
ON CONFLICT (id) DO UPDATE SET
    circuit_id = EXCLUDED.circuit_id,
    name = EXCLUDED.name,
    valid_from_year = EXCLUDED.valid_from_year,
    valid_to_year = EXCLUDED.valid_to_year,
    length_m = EXCLUDED.length_m,
    source_id = EXCLUDED.source_id,
    metadata = atlas.track_layouts.metadata || EXCLUDED.metadata,
    provenance_type = EXCLUDED.provenance_type,
    review_status = CASE
        WHEN atlas.track_layouts.review_status IN ('reviewed', 'published')
            THEN atlas.track_layouts.review_status
        ELSE EXCLUDED.review_status
    END,
    verified_at = CASE
        WHEN atlas.track_layouts.review_status IN ('reviewed', 'published')
            THEN atlas.track_layouts.verified_at
        ELSE NULL
    END,
    updated_at = now();

COMMIT;
