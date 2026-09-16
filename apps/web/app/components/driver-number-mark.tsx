/* eslint-disable @next/next/no-img-element */

import type { DriverCatalogItem, DriverListItem } from '../data/competitor-contract';
import numberMedia from '../data/catalogs/driver-number-media.json';

type NumberDriver = Pick<DriverCatalogItem, 'number' | 'permanentNumber' | 'seasonHistory'> | Pick<DriverListItem, 'number' | 'permanentNumber' | 'seasonHistory'>;

export function resolveDriverNumber(driver: NumberDriver, season: number) {
  if (driver.number !== null) return driver.number;
  const seasonNumbers = driver.seasonHistory?.find((entry) => entry.season === season)?.numbers;
  if (seasonNumbers?.length === 1) return seasonNumbers[0];
  return season >= 2014 ? driver.permanentNumber ?? null : null;
}

type NumberAsset = { number: number; url: string };

const numberAssets = numberMedia.seasons as Record<string, Record<string, NumberAsset>>;

function numberEra(season: number) {
  if (season < 1960) return 'is-era-1950s';
  if (season < 1980) return 'is-era-1960s-1970s';
  if (season < 2000) return 'is-era-1980s-1990s';
  if (season < 2014) return 'is-era-2000s-2013';
  return 'is-era-modern';
}

export function DriverNumberMark({
  driverId,
  season,
  number,
  className = '',
}: {
  driverId: string;
  season: number;
  number: number | null;
  className?: string;
}) {
  const label = number === null ? 'Номер не указан' : `Гоночный номер ${number}`;
  const asset = numberAssets[String(season)]?.[driverId];
  const imageUrl = asset?.number === number ? asset.url : null;
  const classes = ['driver-number-mark', numberEra(season), imageUrl ? 'has-image' : '', className].filter(Boolean).join(' ');
  return <span className={classes} aria-label={label}>
    {imageUrl
      ? <img src={imageUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" />
      : <span aria-hidden="true" data-number={number ?? '—'}>{number ?? '—'}</span>}
  </span>;
}
