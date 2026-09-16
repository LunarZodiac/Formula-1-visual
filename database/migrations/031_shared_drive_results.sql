BEGIN;

INSERT INTO atlas.data_sources (id, name, url, licence, retrieved_at, notes) VALUES
  (
    'formula1-1951-french-race-result',
    'Formula 1 — 1951 French Grand Prix race result',
    'https://www.formula1.com/en/results/1951/races/104/france/race-result',
    'Reference only',
    '2026-09-10T00:00:00Z',
    'Официальная классификация подтверждает совместную победу Хуана Мануэля Фанхио и Луиджи Фаджоли'
  ),
  (
    'formula1-1957-british-race-result',
    'Formula 1 — 1957 British Grand Prix race result',
    'https://www.formula1.com/en/results/1957/races/154/great-britain/race-result',
    'Reference only',
    '2026-09-10T00:00:00Z',
    'Официальная классификация подтверждает совместную победу Стирлинга Мосса и Тони Брукса'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  url = EXCLUDED.url,
  licence = EXCLUDED.licence,
  retrieved_at = EXCLUDED.retrieved_at,
  notes = EXCLUDED.notes;

UPDATE atlas.session_results
SET position_order = 1,
    position_text = '1',
    laps = 77,
    status = 'Finished',
    points = 5,
    elapsed_ms = 12131000,
    gap_ms = NULL,
    gap_text = NULL,
    fastest_lap_rank = NULL,
    fastest_lap_number = NULL,
    fastest_lap_ms = NULL,
    details = details || '{"shared_car":true,"classification_verified":true}'::jsonb,
    source_id = 'formula1-1951-french-race-result'
WHERE session_id = '1951-04-race' AND driver_id = 'fangio';

UPDATE atlas.session_results
SET position_order = 1,
    position_text = '1',
    laps = NULL,
    status = 'Shared car',
    points = 4,
    elapsed_ms = NULL,
    gap_ms = NULL,
    gap_text = NULL,
    fastest_lap_rank = NULL,
    fastest_lap_number = NULL,
    fastest_lap_ms = NULL,
    details = details || '{"shared_car":true,"classification_verified":true}'::jsonb,
    source_id = 'formula1-1951-french-race-result'
WHERE session_id = '1951-04-race' AND driver_id = 'fagioli';

UPDATE atlas.session_results
SET position_order = 1,
    position_text = '1',
    laps = 90,
    status = 'Finished',
    points = 5,
    elapsed_ms = 11197800,
    gap_ms = NULL,
    gap_text = NULL,
    fastest_lap_rank = NULL,
    fastest_lap_number = NULL,
    fastest_lap_ms = NULL,
    details = details || '{"shared_car":true,"classification_verified":true}'::jsonb,
    source_id = 'formula1-1957-british-race-result'
WHERE session_id = '1957-05-race' AND driver_id = 'moss';

UPDATE atlas.session_results
SET position_order = 1,
    position_text = '1',
    laps = NULL,
    status = 'Shared car',
    points = 4,
    elapsed_ms = NULL,
    gap_ms = NULL,
    gap_text = NULL,
    fastest_lap_rank = NULL,
    fastest_lap_number = NULL,
    fastest_lap_ms = NULL,
    details = details || '{"shared_car":true,"classification_verified":true}'::jsonb,
    source_id = 'formula1-1957-british-race-result'
WHERE session_id = '1957-05-race' AND driver_id = 'brooks';

COMMIT;
