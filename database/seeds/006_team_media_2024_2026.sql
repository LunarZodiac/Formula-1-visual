BEGIN;

WITH team_media(season_year, constructor_id, logo_image_url, car_image_url, car_model) AS (
    VALUES
        (2024, 'mclaren', '/assets/f1/teams/2024/logos/03_mclaren_2024.png', '/assets/f1/teams/2024/cars/02_mclaren_mcl38_2024.png', 'MCL38'),
        (2024, 'ferrari', '/assets/f1/teams/2024/logos/02_ferrari_2024.png', '/assets/f1/teams/2024/cars/03_ferrari_sf24_2024.png', 'SF-24'),
        (2024, 'red_bull', '/assets/f1/teams/2024/logos/01_red_bull_racing_2024.png', '/assets/f1/teams/2024/cars/01_red_bull_rb20_2024.png', 'RB20'),
        (2024, 'mercedes', '/assets/f1/teams/2024/logos/04_mercedes_2024.png', '/assets/f1/teams/2024/cars/04_mercedes_w15_2024.png', 'W15'),
        (2024, 'aston_martin', '/assets/f1/teams/2024/logos/05_aston_martin_2024.png', '/assets/f1/teams/2024/cars/05_aston_martin_amr24_2024.png', 'AMR24'),
        (2024, 'alpine', '/assets/f1/teams/2024/logos/06_alpine_2024.png', '/assets/f1/teams/2024/cars/06_alpine_a524_2024.png', 'A524'),
        (2024, 'haas', '/assets/f1/teams/2024/logos/09_haas_2024.png', '/assets/f1/teams/2024/cars/08_haas_vf24_2024.png', 'VF-24'),
        (2024, 'rb', '/assets/f1/teams/2024/logos/08_visa_cash_app_rb_2024.png', '/assets/f1/teams/2024/cars/09_vcarb01_2024.png', 'VCARB 01'),
        (2024, 'williams', '/assets/f1/teams/2024/logos/07_williams_racing_2024.png', '/assets/f1/teams/2024/cars/07_williams_fw46_2024.png', 'FW46'),
        (2024, 'sauber', '/assets/f1/teams/2024/logos/10_kick_sauber_2024.png', '/assets/f1/teams/2024/cars/10_kick_sauber_c44_2024.png', 'C44'),
        (2025, 'mclaren', '/assets/f1/teams/2025/logos/01_mclaren_2025.png', '/assets/f1/teams/2025/cars/02_mclaren_mcl39_2025_fixed_wheels.png', 'MCL39'),
        (2025, 'ferrari', '/assets/f1/teams/2025/logos/02_ferrari_2025.png', '/assets/f1/teams/2025/cars/03_ferrari_sf25_2025_fixed_wheels.png', 'SF-25'),
        (2025, 'red_bull', '/assets/f1/teams/2025/logos/03_red_bull_racing_2025.png', '/assets/f1/teams/2025/cars/01_red_bull_rb21_2025_fixed_wheels.png', 'RB21'),
        (2025, 'mercedes', '/assets/f1/teams/2025/logos/04_mercedes_2025.png', '/assets/f1/teams/2025/cars/04_mercedes_w16_2025_fixed_wheels.png', 'W16'),
        (2025, 'aston_martin', '/assets/f1/teams/2025/logos/05_aston_martin_2025.png', '/assets/f1/teams/2025/cars/05_aston_martin_amr25_2025_fixed_wheels.png', 'AMR25'),
        (2025, 'alpine', '/assets/f1/teams/2025/logos/06_alpine_2025.png', '/assets/f1/teams/2025/cars/06_alpine_a525_2025_fixed_wheels.png', 'A525'),
        (2025, 'haas', '/assets/f1/teams/2025/logos/08_haas_2025.png', '/assets/f1/teams/2025/cars/08_haas_vf25_2025_fixed_wheels.png', 'VF-25'),
        (2025, 'rb', '/assets/f1/teams/2025/logos/09_racing_bulls_2025.png', '/assets/f1/teams/2025/cars/09_racing_bulls_vcarb02_2025_fixed_wheels.png', 'VCARB 02'),
        (2025, 'williams', '/assets/f1/teams/2025/logos/07_williams_2025.png', '/assets/f1/teams/2025/cars/07_williams_fw47_2025_fixed_wheels.png', 'FW47'),
        (2025, 'sauber', '/assets/f1/teams/2025/logos/10_kick_sauber_2025.png', '/assets/f1/teams/2025/cars/10_kick_sauber_c45_2025_fixed_wheels.png', 'C45'),
        (2026, 'mclaren', '/assets/f1/teams/2026/logos/01_mclaren_2026.png', '/assets/f1/teams/2026/cars/cars2026/2026mclarencarright.avif', NULL),
        (2026, 'ferrari', '/assets/f1/teams/2026/logos/02_ferrari_2026.png', '/assets/f1/teams/2026/cars/cars2026/2026ferraricarright.avif', NULL),
        (2026, 'red_bull', '/assets/f1/teams/2026/logos/03_red_bull_racing_2026.png', '/assets/f1/teams/2026/cars/cars2026/2026redbullracingcarright.avif', NULL),
        (2026, 'mercedes', '/assets/f1/teams/2026/logos/04_mercedes_2026.png', '/assets/f1/teams/2026/cars/cars2026/2026mercedescarright.avif', NULL),
        (2026, 'aston_martin', '/assets/f1/teams/2026/logos/05_aston_martin_2026.png', '/assets/f1/teams/2026/cars/cars2026/2026astonmartincarright.avif', NULL),
        (2026, 'alpine', '/assets/f1/teams/2026/logos/06_alpine_2026.png', '/assets/f1/teams/2026/cars/cars2026/2026alpinecarright.avif', NULL),
        (2026, 'haas', '/assets/f1/teams/2026/logos/08_haas_2026.png', '/assets/f1/teams/2026/cars/cars2026/2026haascarright.avif', NULL),
        (2026, 'rb', '/assets/f1/teams/2026/logos/09_racing_bulls_2026.png', '/assets/f1/teams/2026/cars/cars2026/2026racingbullscarright.avif', NULL),
        (2026, 'williams', '/assets/f1/teams/2026/logos/07_williams_2026.png', '/assets/f1/teams/2026/cars/cars2026/2026williamscarright.avif', NULL),
        (2026, 'audi', '/assets/f1/teams/2026/logos/10_audi_2026.png', '/assets/f1/teams/2026/cars/cars2026/2026audicarright.avif', NULL),
        (2026, 'cadillac', '/assets/f1/teams/2026/logos/11_cadillac_2026.png', '/assets/f1/teams/2026/cars/cars2026/2026cadillaccarright.avif', NULL)
)
UPDATE atlas.constructor_entries AS entry
SET
    logo_image_url = media.logo_image_url,
    car_image_url = media.car_image_url,
    car_model = COALESCE(entry.car_model, media.car_model)
FROM team_media AS media
WHERE entry.season_year = media.season_year
  AND entry.constructor_id = media.constructor_id;

COMMIT;
