'use client';
/* eslint-disable @next/next/no-img-element */

import type { CSSProperties } from 'react';
import { driverPhotoUrl } from '../data/driver-photo-sources';

const driverCountries: Record<string, string> = {
  max_verstappen: 'nl', lando_norris: 'gb', charles_leclerc: 'mc', oscar_piastri: 'au',
  carlos_sainz: 'es', george_russell: 'gb', lewis_hamilton: 'gb', sergio_perez: 'mx',
  fernando_alonso: 'es', pierre_gasly: 'fr', nico_hulkenberg: 'de', yuki_tsunoda: 'jp',
  lance_stroll: 'ca', esteban_ocon: 'fr', kevin_magnussen: 'dk', alexander_albon: 'th',
  daniel_ricciardo: 'au', oliver_bearman: 'gb', franco_colapinto: 'ar', zhou_guanyu: 'cn',
  liam_lawson: 'nz', valtteri_bottas: 'fi', logan_sargeant: 'us', jack_doohan: 'au',
  andrea_kimi_antonelli: 'it', isack_hadjar: 'fr', gabriel_bortoleto: 'br', arvid_lindblad: 'gb',
  sebastian_vettel: 'de', kimi_raikkonen: 'fi', jenson_button: 'gb', michael_schumacher: 'de',
  ayrton_senna: 'br', alain_prost: 'fr', juan_manuel_fangio: 'ar', giuseppe_farina: 'it',
  james_hunt: 'gb', carlos_reutemann: 'ar', bruce_mclaren: 'nz', john_surtees: 'gb',
  verstappen: 'nl', norris: 'gb', leclerc: 'mc', piastri: 'au', sainz: 'es', russell: 'gb',
  hamilton: 'gb', perez: 'mx', alonso: 'es', gasly: 'fr', hulkenberg: 'de', tsunoda: 'jp',
  stroll: 'ca', ocon: 'fr', magnussen: 'dk', albon: 'th', ricciardo: 'au', bearman: 'gb',
  colapinto: 'ar', zhou: 'cn', lawson: 'nz', bottas: 'fi', sargeant: 'us', doohan: 'au',
  antonelli: 'it', hadjar: 'fr', bortoleto: 'br', lindblad: 'gb', vettel: 'de', raikkonen: 'fi',
  button: 'gb', m_schumacher: 'de', senna: 'br', prost: 'fr', fangio: 'ar', farina: 'it',
  hunt: 'gb', reutemann: 'ar', mclaren: 'nz', surtees: 'gb',
};

const teamLogoSlugsByConstructorId: Record<string, string> = {
  alpine: 'alpine',
  aston_martin: 'astonmartin',
  audi: 'audi',
  cadillac: 'cadillac',
  ferrari: 'ferrari',
  haas: 'haas',
  mclaren: 'mclaren',
  mercedes: 'mercedes',
  red_bull: 'redbull',
  williams: 'williamsracing',
};

const teamLogoSlugsByExactName: Record<string, string> = {
  alpine: 'alpine',
  'alpine f1 team': 'alpine',
  'aston martin': 'astonmartin',
  audi: 'audi',
  cadillac: 'cadillac',
  'cadillac f1 team': 'cadillac',
  ferrari: 'ferrari',
  'haas f1 team': 'haas',
  mclaren: 'mclaren',
  mercedes: 'mercedes',
  'red bull': 'redbull',
  williams: 'williamsracing',
};

const teamAssetFiles: Record<number, Record<string, { logo: string; car: string }>> = {
  2024: {
    red_bull: { logo: '01_red_bull_racing_2024.png', car: '01_red_bull_rb20_2024.png' },
    ferrari: { logo: '02_ferrari_2024.png', car: '03_ferrari_sf24_2024.png' },
    mclaren: { logo: '03_mclaren_2024.png', car: '02_mclaren_mcl38_2024.png' },
    mercedes: { logo: '04_mercedes_2024.png', car: '04_mercedes_w15_2024.png' },
    aston_martin: { logo: '05_aston_martin_2024.png', car: '05_aston_martin_amr24_2024.png' },
    alpine: { logo: '06_alpine_2024.png', car: '06_alpine_a524_2024.png' },
    williams: { logo: '07_williams_racing_2024.png', car: '07_williams_fw46_2024.png' },
    rb: { logo: '08_visa_cash_app_rb_2024.png', car: '09_vcarb01_2024.png' },
    haas: { logo: '09_haas_2024.png', car: '08_haas_vf24_2024.png' },
    sauber: { logo: '10_kick_sauber_2024.png', car: '10_kick_sauber_c44_2024.png' },
  },
  2025: {
    mclaren: { logo: '01_mclaren_2025.png', car: '02_mclaren_mcl39_2025_fixed_wheels.png' },
    ferrari: { logo: '02_ferrari_2025.png', car: '03_ferrari_sf25_2025_fixed_wheels.png' },
    red_bull: { logo: '03_red_bull_racing_2025.png', car: '01_red_bull_rb21_2025_fixed_wheels.png' },
    mercedes: { logo: '04_mercedes_2025.png', car: '04_mercedes_w16_2025_fixed_wheels.png' },
    aston_martin: { logo: '05_aston_martin_2025.png', car: '05_aston_martin_amr25_2025_fixed_wheels.png' },
    alpine: { logo: '06_alpine_2025.png', car: '06_alpine_a525_2025_fixed_wheels.png' },
    williams: { logo: '07_williams_2025.png', car: '07_williams_fw47_2025_fixed_wheels.png' },
    haas: { logo: '08_haas_2025.png', car: '08_haas_vf25_2025_fixed_wheels.png' },
    rb: { logo: '09_racing_bulls_2025.png', car: '09_racing_bulls_vcarb02_2025_fixed_wheels.png' },
    sauber: { logo: '10_kick_sauber_2025.png', car: '10_kick_sauber_c45_2025_fixed_wheels.png' },
  },
  2026: {
    mclaren: { logo: '01_mclaren_2026.png', car: '2026mclarencarright.avif' },
    ferrari: { logo: '02_ferrari_2026.png', car: '2026ferraricarright.avif' },
    red_bull: { logo: '03_red_bull_racing_2026.png', car: '2026redbullracingcarright.avif' },
    mercedes: { logo: '04_mercedes_2026.png', car: '2026mercedescarright.avif' },
    aston_martin: { logo: '05_aston_martin_2026.png', car: '2026astonmartincarright.avif' },
    alpine: { logo: '06_alpine_2026.png', car: '2026alpinecarright.avif' },
    williams: { logo: '07_williams_2026.png', car: '2026williamscarright.avif' },
    haas: { logo: '08_haas_2026.png', car: '2026haascarright.avif' },
    rb: { logo: '09_racing_bulls_2026.png', car: '2026racingbullscarright.avif' },
    audi: { logo: '10_audi_2026.png', car: '2026audicarright.avif' },
    cadillac: { logo: '11_cadillac_2026.png', car: '2026cadillaccarright.avif' },
  },
};

function normalizedTeamId(constructorId?: string | null, constructorName?: string | null) {
  const id = constructorId?.trim().toLowerCase();
  if (id === 'red_bull_racing') return 'red_bull';
  if (id === 'kick_sauber') return 'sauber';
  if (id === 'racing_bulls' || id === 'visa_cash_app_rb') return 'rb';
  if (id) return id;
  const name = constructorName?.trim().toLowerCase() ?? '';
  if (name.includes('racing bulls') || name === 'rb f1 team' || name.includes('visa cash app')) return 'rb';
  if (name.includes('red bull')) return 'red_bull';
  if (name.includes('aston martin')) return 'aston_martin';
  if (name.includes('sauber')) return 'sauber';
  if (name.includes('williams')) return 'williams';
  if (name.includes('alpine')) return 'alpine';
  if (name.includes('haas')) return 'haas';
  if (name.includes('mclaren')) return 'mclaren';
  if (name.includes('mercedes')) return 'mercedes';
  if (name.includes('ferrari')) return 'ferrari';
  if (name.includes('cadillac')) return 'cadillac';
  if (name.includes('audi')) return 'audi';
  return '';
}

export function driverCountryCode(driverId: string | null | undefined, countryCode?: string | null) {
  const normalizedCode = countryCode?.trim().toLowerCase();
  if (normalizedCode && /^[a-z]{2}$/.test(normalizedCode)) return normalizedCode;
  return driverId ? driverCountries[driverId] ?? null : null;
}

export function countryFlagUrl(countryCode: string) {
  const code = countryCode.trim().toLowerCase();
  return /^[a-z]{2}$/.test(code) ? `/assets/flags/${code}.svg` : null;
}

export function teamLogoUrl(constructorId?: string | null, constructorName?: string | null, season?: number | null) {
  const localAsset = season ? teamAssetFiles[season]?.[normalizedTeamId(constructorId, constructorName)] : null;
  if (localAsset) return `/assets/f1/teams/${season}/logos/${localAsset.logo}`;
  const normalizedId = constructorId?.trim().toLowerCase();
  const normalizedName = constructorName?.trim().toLowerCase();
  const slug = normalizedId
    ? teamLogoSlugsByConstructorId[normalizedId]
    : normalizedName
      ? teamLogoSlugsByExactName[normalizedName]
      : null;
  return slug ? `https://cdn.simpleicons.org/${slug}/ffffff` : null;
}

export function teamCarUrl(season: number, constructorId?: string | null, constructorName?: string | null) {
  const asset = teamAssetFiles[season]?.[normalizedTeamId(constructorId, constructorName)];
  if (!asset) return null;
  const folder = season === 2026 ? 'cars/cars2026' : 'cars';
  return `/assets/f1/teams/${season}/${folder}/${asset.car}`;
}

export function flagFallbackDataUrl(code: string) {
  const label = code.toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="34" viewBox="0 0 50 34"><rect width="50" height="34" rx="3" fill="#17232c"/><rect x=".5" y=".5" width="49" height="33" rx="2.5" fill="none" stroke="#718590"/><text x="25" y="22" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#d7e0e5">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function DriverFlag({
  driverId,
  countryCode,
  className = '',
}: {
  driverId?: string | null;
  countryCode?: string | null;
  className?: string;
}) {
  const code = driverCountryCode(driverId, countryCode);
  if (!code) return <span className={`driver-flag driver-flag--empty ${className}`.trim()} aria-hidden="true" />;
  return (
    <img
      className={`driver-flag ${className}`.trim()}
      src={countryFlagUrl(code) ?? flagFallbackDataUrl(code)}
      alt=""
      aria-hidden="true"
      onError={(event) => {
        event.currentTarget.onerror = null;
        event.currentTarget.src = flagFallbackDataUrl(code);
      }}
    />
  );
}

export function TeamLogo({
  constructorId,
  constructorName,
  teamColor,
  season,
  logoUrl,
  className = '',
}: {
  constructorId?: string | null;
  constructorName?: string | null;
  teamColor?: string | null;
  season?: number | null;
  logoUrl?: string | null;
  className?: string;
}) {
  const source = logoUrl ?? teamLogoUrl(constructorId, constructorName, season);
  const initials = (constructorName ?? 'F1').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className={`team-logo ${className}`.trim()} style={{ '--team-logo-color': teamColor ?? '#718590' } as CSSProperties} aria-hidden="true">
      {source ? <img src={source} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.hidden = true; }} /> : null}
      <i>{initials}</i>
    </span>
  );
}

export function TeamCar({ season, constructorId, constructorName, carImageUrl }: { season: number; constructorId?: string | null; constructorName?: string | null; carImageUrl?: string | null }) {
  const source = carImageUrl ?? teamCarUrl(season, constructorId, constructorName);
  return source ? <img className="team-car-image" src={source} alt="" aria-hidden="true" loading="lazy" decoding="async" /> : <span className="team-car-mark" aria-hidden="true"><i /><i /></span>;
}

export function DriverPortrait({ driverId, name }: { driverId?: string | null; name: string }) {
  const source = driverPhotoUrl(driverId);
  return source ? (
    <img className="driver-photo" src={source} alt={name} onError={(event) => { event.currentTarget.hidden = true; }} />
  ) : null;
}
