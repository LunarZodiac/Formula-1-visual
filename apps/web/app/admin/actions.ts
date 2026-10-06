'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { clearAdminSession, createAdminSession, getAdminSession, verifyAdminCredentials } from '../lib/admin-auth';
import { applyAdminTrackAnnotationImportPreview, createAdminTrackAnnotationImportPreview, getAdminTrackAnnotationImportPreview, getAdminTrackAnnotations } from '../lib/admin-database';
import { buildLegacyTrackAnnotationPackage } from './circuits/[id]/layouts/[layoutId]/annotations/legacy-track-markup';
import { changeAdminTravelRouteLifecycle, deleteAdminArchivedTravelRoute } from '../lib/admin-database';
import { createAdminTravelRouteGeometryPreview } from '../lib/admin-database';
import { createAdminTrackSectorSegmentation } from '../lib/admin-database';
import { applyAdminTravelImportPreview, applyAdminTravelPointOsmTranslations, applyAdminTravelRouteGenerationPreview, applyAdminTravelRouteTailPreview, createAdminConstructorLineage, createAdminHistoryEraBlock, createAdminTravelImportPreview, createAdminTravelRouteGenerationPreview, createAdminTravelRouteTailPreview, deleteAdminConstructorLineage, deleteAdminHistoryEraBlock, deleteAdminSessionResult, deleteAdminTrackAnnotation, getAdminDriver, importAdminTrackGeometry, inspectAdminTrackGeometry, previewAdminCircuitCardImage, previewAdminConstructorCar, previewAdminConstructorLogo, previewAdminDriverPhoto, previewAdminGameLogo, previewAdminTravelPointPhoto, saveAdminEvent, saveAdminEventSession, saveAdminSeason, saveAdminSessionResult, saveAdminSessionResults, saveAdminTrackLayout, syncAdminSeasonFromJolpica, updateAdminCircuit, updateAdminCircuitMediaOrder, updateAdminConstructorEntry, updateAdminConstructorLineage, updateAdminDriver, updateAdminDriverEditorial, updateAdminHistoryEra, updateAdminHistoryEraBlock, updateAdminHistoryEraBlockOrder, updateAdminMapUiSettings, updateAdminMediaAsset, updateAdminTableRow, updateAdminTrackAnnotation, updateAdminTravelAccessAnchor, updateAdminTravelCategoryIcon, updateAdminTravelPoint, updateAdminTravelPointsBulk, updateAdminTravelRoute, updateAdminTravelZone, uploadAdminCircuitCardImage, uploadAdminConstructorCar, uploadAdminConstructorLogo, uploadAdminDriverPhoto, uploadAdminGameLogo, uploadAdminTravelCategoryIcon, uploadAdminTravelPointPhoto, type AdminCircuitCardImageInput, type AdminCircuitInput, type AdminConstructorCarInput, type AdminConstructorLineageInput, type AdminDriverInput, type AdminEventInput, type AdminEventSessionInput, type AdminGameLogoInput, type AdminHistoryEraBlockContentInput, type AdminHistoryEraBlockInput, type AdminHistoryEraInput, type AdminSeason, type AdminSessionResultInput, type AdminTrackLayoutInput, type AdminTravelPointPhotoInput } from '../lib/admin-database';

function optionalText(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();
  return value || null;
}

function optionalNumber(formData: FormData, name: string, minimum: number, maximum: number) {
  const value = optionalText(formData, name);
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`Некорректное значение ${name}`);
  return String(number);
}

function optionalDate(formData: FormData, name: string) {
  const value = optionalText(formData, name);
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error(`Некорректная дата ${name}`);
  return value;
}

export async function loginAdmin(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  if (!verifyAdminCredentials(email, password)) redirect('/admin/login?error=invalid');
  await createAdminSession(email.trim().toLocaleLowerCase('en-US'));
  redirect('/admin/overview');
}

export async function updateCircuitMediaOrder(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const circuitId = String(formData.get('circuitId') ?? '').trim();
  const section = String(formData.get('section') ?? '');
  if (!/^[A-Za-z0-9_-]+$/.test(circuitId) || !['history', 'gallery'].includes(section)) redirect('/admin/overview?error=invalid-circuit');
  let publicDataSynced = true;
  let circuitSlug = circuitId;
  try {
    const orderedIds = JSON.parse(String(formData.get('orderedIds') ?? '[]')) as unknown;
    if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) throw new Error('Некорректный порядок материалов');
    const result = await updateAdminCircuitMediaOrder(circuitId, section as 'history' | 'gallery', orderedIds);
    publicDataSynced = result.publicDataSynced;
    circuitSlug = result.slug;
  } catch (error) {
    console.error('Не удалось сохранить порядок материалов трассы', error);
    redirect(`/admin/circuits/${encodeURIComponent(circuitId)}/media?error=${encodeURIComponent(section)}`);
  }
  revalidatePath(`/admin/circuits/${circuitId}/media`);
  revalidatePath(`/circuits/${circuitSlug}`);
  redirect(`/admin/circuits/${encodeURIComponent(circuitId)}/media?saved=${encodeURIComponent(section)}${publicDataSynced ? '' : '&syncError=1'}`);
}

export async function logoutAdmin() {
  await clearAdminSession();
  redirect('/admin/login');
}

export async function saveSeason(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const year = Number(formData.get('year'));
  const status = String(formData.get('status') ?? '') as AdminSeason['status'];
  const roundsValue = optionalText(formData, 'roundsPlanned');
  const roundsPlanned = roundsValue === null ? null : Number(roundsValue);
  const create = formData.get('create') === '1';
  let publicDataSynced = true;
  try {
    if (!Number.isInteger(year) || year < 1950 || year > 2100) throw new Error('Некорректный год');
    if (!['planned', 'active', 'completed', 'cancelled'].includes(status)) throw new Error('Некорректный статус');
    if (roundsPlanned !== null && (!Number.isInteger(roundsPlanned) || roundsPlanned < 0 || roundsPlanned > 40)) throw new Error('Некорректное число этапов');
    const parsedSource = new URL(String(formData.get('sourceUrl') ?? '').trim());
    if (!['http:', 'https:'].includes(parsedSource.protocol) || parsedSource.username || parsedSource.password) throw new Error('Некорректный источник');
    const result = await saveAdminSeason({ year, status, roundsPlanned, sourceUrl: parsedSource.href }, create);
    publicDataSynced = result.publicDataSynced;
  } catch (error) {
    console.error('Не удалось сохранить сезон', error);
    redirect(`/admin/seasons?error=${encodeURIComponent(String(year || 'new'))}`);
  }
  revalidatePath('/admin/seasons'); revalidatePath('/'); revalidatePath('/history');
  redirect(`/admin/seasons?saved=${year}${publicDataSynced ? '' : '&syncError=1'}`);
}

export async function syncSeasonFromJolpica(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const season = Number(formData.get('season'));
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(season) || season < 1950 || season > currentYear + 1) redirect('/admin/seasons?syncFailed=invalid-season');
  let snapshotFileName = '';
  try {
    const result = await syncAdminSeasonFromJolpica(season);
    snapshotFileName = result.snapshot.fileName;
  } catch (error) {
    console.error(`Не удалось обновить сезон ${season} через Jolpica`, error);
    const message = error instanceof Error ? error.message : String(error);
    redirect(`/admin/seasons?syncFailed=${season}&syncMessage=${encodeURIComponent(message.slice(0, 320))}`);
  }
  revalidatePath('/');
  revalidatePath('/admin/seasons');
  revalidatePath('/admin/events');
  revalidatePath('/drivers');
  revalidatePath('/teams');
  redirect(`/admin/seasons?synced=${season}&snapshot=${encodeURIComponent(snapshotFileName)}`);
}

export async function saveCircuit(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const id = String(formData.get('id') ?? '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) redirect('/admin/circuits?error=invalid-circuit');
  let publicDataSynced = true;
  try {
    const requiredText = (name: string) => {
      const value = optionalText(formData, name);
      if (!value) throw new Error(`Поле ${name} обязательно`);
      return value;
    };
    const requiredNumber = (name: string, minimum: number, maximum: number) => {
      const value = Number(requiredText(name));
      if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`Некорректное значение ${name}`);
      return value;
    };
    const nullableNumber = (name: string, minimum: number, maximum: number) => {
      const value = optionalText(formData, name);
      if (value === null) return null;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new Error(`Некорректное значение ${name}`);
      return parsed;
    };
    const sourceUrl = new URL(requiredText('sourceUrl'));
    if (!['http:', 'https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) throw new Error('Некорректный источник');
    const websiteValue = optionalText(formData, 'websiteUrl');
    let websiteUrl: string | null = null;
    if (websiteValue) {
      const parsed = new URL(websiteValue);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Некорректный официальный сайт');
      websiteUrl = parsed.href;
    }
    const editorialStatus = requiredText('editorialStatus') as AdminCircuitInput['editorialStatus'];
    const input: AdminCircuitInput = {
      id, officialName: requiredText('officialName'), shortName: optionalText(formData, 'shortName'),
      locality: optionalText(formData, 'locality'), countryCode: requiredText('countryCode'),
      circuitType: requiredText('circuitType'), longitude: requiredNumber('longitude', -180, 180),
      latitude: requiredNumber('latitude', -90, 90),
      openedYear: nullableNumber('openedYear', 1800, new Date().getUTCFullYear()), websiteUrl,
      slug: requiredText('slug'), geometryId: optionalText(formData, 'geometryId'),
      nameRu: requiredText('nameRu'), cityRu: requiredText('cityRu'), countryRu: requiredText('countryRu'),
      summaryRu: optionalText(formData, 'summaryRu'), circuitTypeRu: optionalText(formData, 'circuitTypeRu'),
      editorialStatus, sourceUrl: sourceUrl.href, sourceName: optionalText(formData, 'sourceName'),
      sourceNotes: optionalText(formData, 'sourceNotes'), sourceVerified: formData.get('sourceVerified') === 'yes',
    };
    if (!['draft', 'review', 'published'].includes(editorialStatus)) throw new Error('Некорректный статус');
    const result = await updateAdminCircuit(input);
    publicDataSynced = result.publicDataSynced;
  } catch (error) {
    console.error('Не удалось сохранить трассу', error);
    redirect(`/admin/circuits/${encodeURIComponent(id)}?error=save`);
  }
  revalidatePath('/admin/circuits');
  revalidatePath(`/admin/circuits/${id}`);
  revalidatePath('/circuits');
  revalidatePath('/search');
  const publicSlug = String(formData.get('slug') ?? '').trim();
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(publicSlug)) revalidatePath(`/circuits/${publicSlug}`);
  redirect(`/admin/circuits/${encodeURIComponent(id)}?saved=1${publicDataSynced ? '' : '&syncError=1'}`);
}

async function circuitCardImageInput(formData: FormData, requireRights: boolean): Promise<AdminCircuitCardImageInput> {
  const id = String(formData.get('id') ?? '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Некорректный ID трассы');
  const file = formData.get('cardImage');
  if (!(file instanceof File) || !file.size) throw new Error('Изображение не выбрано');
  if (file.size > 8 * 1024 * 1024) throw new Error('Изображение больше 8 МБ');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Разрешены JPG, PNG и WebP');
  if (requireRights && formData.get('rightsConfirmed') !== 'yes') throw new Error('Не подтверждены права на использование');
  const sourceValue = String(formData.get('photoSourceUrl') ?? '').trim();
  const source = requireRights ? new URL(sourceValue) : null;
  if (source && (!['http:', 'https:'].includes(source.protocol) || source.username || source.password)) throw new Error('Некорректный источник');
  const altTextRu = optionalText(formData, 'photoAltTextRu') ?? '';
  const author = optionalText(formData, 'photoAuthor') ?? '';
  const licence = optionalText(formData, 'photoLicence') ?? '';
  if (requireRights && (!altTextRu || !author || !licence)) throw new Error('Не заполнены сведения об изображении');
  return { id, fileName: file.name, mimeType: file.type, bytes: await file.arrayBuffer(),
    altTextRu, author, licence, sourceUrl: source?.href ?? 'https://preview.invalid/',
    previewToken: String(formData.get('previewToken') ?? ''),
    cropZoom: Number(formData.get('cropZoom') ?? 1), cropX: Number(formData.get('cropX') ?? 0), cropY: Number(formData.get('cropY') ?? 0) };
}

export async function previewCircuitCardImage(formData: FormData) {
  if (!await getAdminSession()) return { ok: false as const, error: 'Сессия завершена. Обновите страницу и войдите снова' };
  try {
    const result = await previewAdminCircuitCardImage(await circuitCardImageInput(formData, false));
    if (!result.token || !result.imageDataUrl) throw new Error('Сервер не вернул предпросмотр');
    return { ok: true as const, token: result.token, imageDataUrl: result.imageDataUrl };
  } catch (error) {
    console.error('Не удалось создать предпросмотр карточки трассы', error);
    return { ok: false as const, error: error instanceof Error ? error.message : 'Не удалось создать предпросмотр' };
  }
}

export async function uploadCircuitCardImage(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const id = String(formData.get('id') ?? '').trim();
  let publicDataSynced = true;
  try { publicDataSynced = (await uploadAdminCircuitCardImage(await circuitCardImageInput(formData, true))).publicDataSynced !== false; }
  catch (error) { console.error('Не удалось загрузить изображение карточки трассы', error); redirect(`/admin/circuits/${encodeURIComponent(id)}?error=card-image#card-image`); }
  revalidatePath('/admin/circuits'); revalidatePath(`/admin/circuits/${id}`); revalidatePath('/circuits');
  redirect(`/admin/circuits/${encodeURIComponent(id)}?cardImageSaved=1${publicDataSynced ? '' : '&syncError=1'}#card-image`);
}

export async function saveTrackLayout(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const circuitId = String(formData.get('circuitId') ?? '').trim();
  const id = String(formData.get('id') ?? '').trim();
  const create = formData.get('create') === '1';
  if (!/^[A-Za-z0-9_-]+$/.test(circuitId) || !/^[A-Za-z0-9_-]+$/.test(id)) redirect('/admin/circuits?error=invalid-layout');
  let publicDataSynced = true;
  try {
    const text = (name: string) => String(formData.get(name) ?? '').trim();
    const nullableNumber = (name: string) => {
      const value = text(name); if (!value) return null;
      const parsed = Number(value); if (!Number.isFinite(parsed)) throw new Error(`Некорректное поле ${name}`);
      return parsed;
    };
    const sourceUrl = new URL(text('sourceUrl'));
    if (!['http:', 'https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) throw new Error('Некорректный источник');
    const input: AdminTrackLayoutInput = {
      id, circuitId, name: text('name'), validFromYear: nullableNumber('validFromYear'),
      validToYear: nullableNumber('validToYear'), lengthM: nullableNumber('lengthM'),
      turns: nullableNumber('turns'), direction: text('direction') || null,
      elevationMinM: nullableNumber('elevationMinM'), elevationMaxM: nullableNumber('elevationMaxM'),
      provenanceType: text('provenanceType') as AdminTrackLayoutInput['provenanceType'],
      reviewStatus: text('reviewStatus') as AdminTrackLayoutInput['reviewStatus'], sourceUrl: sourceUrl.href,
      sourceName: text('sourceName') || null, sourceNotes: text('sourceNotes') || null,
      sourceVerified: formData.get('sourceVerified') === 'yes',
    };
    if (!input.name) throw new Error('Название обязательно');
    const result = await saveAdminTrackLayout(input, create);
    publicDataSynced = result.publicDataSynced;
  } catch (error) {
    console.error('Не удалось сохранить конфигурацию', error);
    redirect(`/admin/circuits/${encodeURIComponent(circuitId)}/layouts/${create ? 'new' : encodeURIComponent(id)}?error=save`);
  }
  revalidatePath(`/admin/circuits/${circuitId}`);
  revalidatePath(`/admin/circuits/${circuitId}/layouts/${id}`);
  revalidatePath('/search');
  redirect(`/admin/circuits/${encodeURIComponent(circuitId)}/layouts/${encodeURIComponent(id)}?saved=1${publicDataSynced ? '' : '&syncError=1'}`);
}

export async function saveEvent(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const id = String(formData.get('id') ?? '').trim();
  const create = formData.get('create') === '1';
  if (!/^[A-Za-z0-9_-]+$/.test(id)) redirect('/admin/events?error=invalid-event');
  let publicDataSynced = true;
  try {
    const text = (name: string) => String(formData.get(name) ?? '').trim();
    const sourceUrl = new URL(text('sourceUrl'));
    if (!['http:', 'https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) throw new Error('Некорректный источник');
    const input: AdminEventInput = {
      id, seasonYear: Number(text('seasonYear')), round: Number(text('round')), name: text('name'),
      raceDate: text('raceDate') || null, startTimeUtc: text('startTimeUtc') || null,
      status: text('status') as AdminEventInput['status'], circuitId: text('circuitId'),
      layoutId: text('layoutId') || null, sourceUrl: sourceUrl.href,
      sourceVerified: formData.get('sourceVerified') === 'yes',
    };
    const result = await saveAdminEvent(input, create);
    publicDataSynced = result.publicDataSynced;
  } catch (error) {
    console.error('Не удалось сохранить этап', error);
    redirect(`/admin/events/${create ? 'new' : encodeURIComponent(id)}?error=save`);
  }
  revalidatePath('/admin/events'); revalidatePath(`/admin/events/${id}`);
  revalidatePath('/'); revalidatePath('/season'); revalidatePath('/search');
  redirect(`/admin/events/${encodeURIComponent(id)}?saved=1${publicDataSynced === false ? '&syncError=1' : ''}`);
}

function nullableNumber(formData: FormData, name: string) {
  const raw = String(formData.get(name) ?? '').trim();
  return raw === '' ? null : Number(raw);
}

function durationToMs(formData: FormData, name: string) {
  const raw = String(formData.get(name) ?? '').trim().replace(',', '.');
  if (!raw) return null;
  const parts = raw.split(':');
  if (parts.length > 3 || parts.some((part) => part === '' || !/^\d+(?:\.\d{1,3})?$/.test(part))) throw new Error(`Некорректное время ${name}`);
  const seconds = parts.reduce((total, part) => total * 60 + Number(part), 0);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`Некорректное время ${name}`);
  return Math.round(seconds * 1000);
}

export async function saveEventSession(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const raceId = String(formData.get('raceId') ?? '').trim();
  const id = String(formData.get('id') ?? '').trim();
  const create = formData.get('create') === '1';
  if (!/^[A-Za-z0-9_-]+$/.test(raceId) || (!create && !/^[A-Za-z0-9_-]+$/.test(id))) redirect('/admin/events?error=invalid-session');
  let savedId = id; let publicDataSynced = true;
  try {
    const text = (name: string) => String(formData.get(name) ?? '').trim();
    const sourceUrl = new URL(text('sourceUrl'));
    const input: AdminEventSessionInput = {
      id, raceId, sessionType: text('sessionType') as AdminEventSessionInput['sessionType'], name: text('name'),
      startsAt: text('startsAt') ? `${text('startsAt')}:00Z` : null, endsAt: text('endsAt') ? `${text('endsAt')}:00Z` : null,
      status: text('status') as AdminEventSessionInput['status'], sourceUrl: sourceUrl.href,
      sourceVerified: formData.get('sourceVerified') === 'yes',
    };
    const result = await saveAdminEventSession(input, create); savedId = result.id; publicDataSynced = result.publicDataSynced;
  } catch (error) {
    console.error('Не удалось сохранить сессию', error);
    redirect(`/admin/events/${encodeURIComponent(raceId)}?error=session`);
  }
  revalidatePath(`/admin/events/${raceId}`); revalidatePath(`/admin/events/${raceId}/sessions/${savedId}`);
  redirect(`/admin/events/${encodeURIComponent(raceId)}/sessions/${encodeURIComponent(savedId)}?saved=1${publicDataSynced ? '' : '&syncError=1'}`);
}

export async function saveSessionResult(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const raceId = String(formData.get('raceId') ?? '').trim(); const sessionId = String(formData.get('sessionId') ?? '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(raceId) || !/^[A-Za-z0-9_-]+$/.test(sessionId)) redirect('/admin/events?error=invalid-result');
  let publicDataSynced = true;
  try {
    const text = (name: string) => String(formData.get(name) ?? '').trim();
    const input: AdminSessionResultInput = {
      raceId, sessionId, originalDriverId: text('originalDriverId') || null, driverId: text('driverId'),
      positionOrder: Number(text('positionOrder')), positionText: text('positionText'),
      constructorEntryId: nullableNumber(formData, 'constructorEntryId'), gridPosition: nullableNumber(formData, 'gridPosition'),
      laps: nullableNumber(formData, 'laps'), status: text('resultStatus') || null, points: Number(text('points') || 0),
      elapsedMs: durationToMs(formData, 'elapsedTime'), gapMs: durationToMs(formData, 'gapTime'), gapText: text('gapText') || null,
      fastestLapRank: nullableNumber(formData, 'fastestLapRank'), fastestLapNumber: nullableNumber(formData, 'fastestLapNumber'),
      fastestLapMs: durationToMs(formData, 'fastestLapTime'), q1Ms: durationToMs(formData, 'q1Time'),
      q2Ms: durationToMs(formData, 'q2Time'), q3Ms: durationToMs(formData, 'q3Time'), penaltyNote: text('penaltyNote') || null,
      sourceUrl: new URL(text('sourceUrl')).href, sourceVerified: formData.get('sourceVerified') === 'yes',
    };
    const result = await saveAdminSessionResult(input); publicDataSynced = result.publicDataSynced;
  } catch (error) {
    console.error('Не удалось сохранить результат', error);
    redirect(`/admin/events/${encodeURIComponent(raceId)}/sessions/${encodeURIComponent(sessionId)}?error=result`);
  }
  revalidatePath(`/admin/events/${raceId}`); revalidatePath(`/admin/events/${raceId}/sessions/${sessionId}`);
  redirect(`/admin/events/${encodeURIComponent(raceId)}/sessions/${encodeURIComponent(sessionId)}?resultSaved=1${publicDataSynced ? '' : '&syncError=1'}`);
}

export async function deleteSessionResult(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const raceId = String(formData.get('raceId') ?? '').trim(); const sessionId = String(formData.get('sessionId') ?? '').trim();
  const driverId = String(formData.get('driverId') ?? '').trim();
  if (formData.get('confirmDelete') !== 'yes' || ![raceId, sessionId, driverId].every((value) => /^[A-Za-z0-9_-]+$/.test(value))) {
    redirect(`/admin/events/${encodeURIComponent(raceId)}/sessions/${encodeURIComponent(sessionId)}?error=delete`);
  }
  let publicDataSynced = true;
  try { const result = await deleteAdminSessionResult(raceId, sessionId, driverId); publicDataSynced = result.publicDataSynced; }
  catch (error) {
    console.error('Не удалось удалить результат', error);
    redirect(`/admin/events/${encodeURIComponent(raceId)}/sessions/${encodeURIComponent(sessionId)}?error=delete`);
  }
  revalidatePath(`/admin/events/${raceId}`); revalidatePath(`/admin/events/${raceId}/sessions/${sessionId}`);
  redirect(`/admin/events/${encodeURIComponent(raceId)}/sessions/${encodeURIComponent(sessionId)}?deleted=1${publicDataSynced ? '' : '&syncError=1'}`);
}

export async function saveSessionResultsBulk(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const raceId = String(formData.get('raceId') ?? '').trim(); const sessionId = String(formData.get('sessionId') ?? '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(raceId) || !/^[A-Za-z0-9_-]+$/.test(sessionId)) redirect('/admin/events?error=invalid-result');
  let publicDataSynced = true; let saved = 0;
  try {
    const rawRows = JSON.parse(String(formData.get('rows') ?? '[]')) as Array<Record<string, unknown>>;
    const sourceUrl = new URL(String(formData.get('sourceUrl') ?? '').trim()).href;
    const asText = (value: unknown) => String(value ?? '').trim();
    const asNumber = (value: unknown) => asText(value) === '' ? null : Number(value);
    const asDuration = (value: unknown) => {
      const temporary = new FormData(); temporary.set('duration', asText(value)); return durationToMs(temporary, 'duration');
    };
    const rows: AdminSessionResultInput[] = rawRows.map((row) => ({
      raceId, sessionId, originalDriverId: asText(row.originalDriverId) || null, driverId: asText(row.driverId),
      positionOrder: Number(row.positionOrder), positionText: asText(row.positionText), constructorEntryId: asNumber(row.constructorEntryId),
      gridPosition: asNumber(row.gridPosition), laps: asNumber(row.laps), status: asText(row.status) || null,
      points: Number(row.points ?? 0), elapsedMs: asDuration(row.elapsedTime), gapMs: asDuration(row.gapTime),
      gapText: asText(row.gapText) || null, fastestLapRank: asNumber(row.fastestLapRank),
      fastestLapNumber: asNumber(row.fastestLapNumber), fastestLapMs: asDuration(row.fastestLapTime),
      q1Ms: asDuration(row.q1Time), q2Ms: asDuration(row.q2Time), q3Ms: asDuration(row.q3Time),
      penaltyNote: asText(row.penaltyNote) || null, sourceUrl, sourceVerified: formData.get('sourceVerified') === 'yes',
    }));
    const result = await saveAdminSessionResults({ raceId, sessionId, rows }); saved = result.saved; publicDataSynced = result.publicDataSynced;
  } catch (error) {
    console.error('Не удалось пакетно сохранить классификацию', error);
    redirect(`/admin/events/${encodeURIComponent(raceId)}/sessions/${encodeURIComponent(sessionId)}?error=bulk`);
  }
  revalidatePath(`/admin/events/${raceId}`); revalidatePath(`/admin/events/${raceId}/sessions/${sessionId}`);
  redirect(`/admin/events/${encodeURIComponent(raceId)}/sessions/${encodeURIComponent(sessionId)}?bulkSaved=${saved}${publicDataSynced ? '' : '&syncError=1'}`);
}

export async function previewTrackGeometry(circuitId: string, layoutId: string, rawGeoJson: string) {
  if (!await getAdminSession()) return { ok: false as const, error: 'Сессия завершена. Обновите страницу и войдите снова' };
  try {
    if (rawGeoJson.length > 1_800_000) throw new Error('GeoJSON больше 1,8 МБ');
    const result = await inspectAdminTrackGeometry(circuitId, layoutId, JSON.parse(rawGeoJson));
    return { ok: true as const, result };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'Не удалось проверить GeoJSON' };
  }
}

export async function importTrackGeometry(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const circuitId = String(formData.get('circuitId') ?? '').trim();
  const layoutId = String(formData.get('layoutId') ?? '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(circuitId) || !/^[A-Za-z0-9_-]+$/.test(layoutId)) redirect('/admin/circuits?error=invalid-layout');
  let publicDataSynced = true;
  try {
    const rawGeoJson = String(formData.get('geoJson') ?? '');
    if (!rawGeoJson || rawGeoJson.length > 1_800_000) throw new Error('Некорректный размер GeoJSON');
    if (formData.get('confirmed') !== 'yes') throw new Error('Импорт не подтверждён');
    const result = await importAdminTrackGeometry(circuitId, layoutId, JSON.parse(rawGeoJson));
    publicDataSynced = result.publicDataSynced;
  } catch (error) {
    console.error('Не удалось импортировать контур', error);
    redirect(`/admin/circuits/${encodeURIComponent(circuitId)}/layouts/${encodeURIComponent(layoutId)}?geometryError=1`);
  }
  revalidatePath(`/admin/circuits/${circuitId}`);
  revalidatePath(`/admin/circuits/${circuitId}/layouts/${layoutId}`);
  revalidatePath('/'); revalidatePath('/circuits'); revalidatePath('/season');
  redirect(`/admin/circuits/${encodeURIComponent(circuitId)}/layouts/${encodeURIComponent(layoutId)}?geometrySaved=1${publicDataSynced ? '' : '&syncError=1'}`);
}

export async function saveTrackAnnotation(formData:FormData){
  if(!await getAdminSession())redirect('/admin/login');const circuitId=String(formData.get('circuitId')??'').trim(),layoutId=String(formData.get('layoutId')??'').trim(),annotationType=String(formData.get('annotationType')??'').trim(),annotationId=String(formData.get('annotationId')??'').trim()||`${layoutId}-${annotationType}-${randomUUID().slice(0,8)}`;
  const destination=`/admin/circuits/${encodeURIComponent(circuitId)}/layouts/${encodeURIComponent(layoutId)}/annotations`;
  let publicDataSynced=true;
  try{const result=await updateAdminTrackAnnotation(circuitId,layoutId,annotationId,{annotationType,labelRu:optionalText(formData,'labelRu'),labelOriginal:optionalText(formData,'labelOriginal'),
    sequence:optionalText(formData,'sequence'),descriptionRu:optionalText(formData,'descriptionRu'),geometryGeoJson:String(formData.get('geometryGeoJson')??''),calloutPointJson:optionalText(formData,'calloutPointJson'),validFromYear:optionalText(formData,'validFromYear'),validToYear:optionalText(formData,'validToYear'),
    revision:optionalText(formData,'revision'),reviewStatus:String(formData.get('reviewStatus')??'candidate'),sourceName:optionalText(formData,'sourceName'),sourceUrl:String(formData.get('sourceUrl')??''),sourceNotes:optionalText(formData,'sourceNotes'),sourceVerified:formData.get('sourceVerified')==='yes'});
    if(!result)throw new Error('Разметка не сохранена');
    publicDataSynced=result.publicDataSynced;
  }catch(error){console.error('Не удалось сохранить разметку конфигурации',error);redirect(`${destination}?edit=${encodeURIComponent(annotationId)}&error=${error instanceof Error&&error.message.includes('Обновите страницу')?'conflict':'save'}`);}
  revalidatePath(destination);revalidatePath(`/circuits/${encodeURIComponent(circuitId)}`);
  redirect(`${destination}?saved=1${publicDataSynced?'':'&syncError=1'}`);
}

export async function saveTrackStartFinish(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const circuitId = String(formData.get('circuitId') ?? '').trim();
  const layoutId = String(formData.get('layoutId') ?? '').trim();
  const annotationId = `${layoutId}-start-finish`;
  const destination = `/admin/circuits/${encodeURIComponent(circuitId)}/layouts/${encodeURIComponent(layoutId)}/annotations`;
  let publicDataSynced = true;
  try {
    const result = await updateAdminTrackAnnotation(circuitId, layoutId, annotationId, {
      annotationType: 'timing_line', labelRu: 'Старт/финиш', labelOriginal: null,
      sequence: null, descriptionRu: null, geometryGeoJson: String(formData.get('geometryGeoJson') ?? ''), calloutPointJson: null,
      validFromYear: optionalText(formData, 'validFromYear'), validToYear: optionalText(formData, 'validToYear'),
      revision: optionalText(formData, 'revision'), reviewStatus: String(formData.get('reviewStatus') ?? 'candidate'),
      sourceName: optionalText(formData, 'sourceName'), sourceUrl: String(formData.get('sourceUrl') ?? ''),
      sourceNotes: optionalText(formData, 'sourceNotes'), sourceVerified: formData.get('sourceVerified') === 'yes',
    });
    if (!result) throw new Error('Положение старта/финиша не сохранено');
    publicDataSynced = result.publicDataSynced;
  } catch (error) {
    console.error('Не удалось сохранить положение старта/финиша', error);
    redirect(`${destination}?panel=finish&error=${error instanceof Error && error.message.includes('Обновите страницу') ? 'conflict' : 'finish'}`);
  }
  revalidatePath(destination);
  revalidatePath(`/circuits/${encodeURIComponent(circuitId)}`);
  redirect(`${destination}?panel=finish&saved=finish${publicDataSynced ? '' : '&syncError=1'}`);
}

export async function saveTrackSectorSegmentation(formData:FormData){
  if(!await getAdminSession())redirect('/admin/login');
  const circuitId=String(formData.get('circuitId')??'').trim(),layoutId=String(formData.get('layoutId')??'').trim();
  const destination=`/admin/circuits/${encodeURIComponent(circuitId)}/layouts/${encodeURIComponent(layoutId)}/annotations`;
  try{
    const boundaries=JSON.parse(String(formData.get('boundariesJson')??''));
    await createAdminTrackSectorSegmentation(circuitId,layoutId,{boundaries,
      validFromYear:optionalText(formData,'validFromYear'),validToYear:optionalText(formData,'validToYear'),
      sourceName:optionalText(formData,'sourceName'),sourceUrl:String(formData.get('sourceUrl')??''),sourceNotes:optionalText(formData,'sourceNotes')});
  }catch(error){console.error('Не удалось создать сектора',error);redirect(`${destination}?error=sectors`);}
  revalidatePath(destination);redirect(`${destination}?saved=sectors`);
}

export async function removeTrackAnnotation(formData:FormData){
  if(!await getAdminSession())redirect('/admin/login');const circuitId=String(formData.get('circuitId')??'').trim(),layoutId=String(formData.get('layoutId')??'').trim(),annotationId=String(formData.get('annotationId')??'').trim();
  const destination=`/admin/circuits/${encodeURIComponent(circuitId)}/layouts/${encodeURIComponent(layoutId)}/annotations`;
  let publicDataSynced=true;
  try{if(formData.get('confirmed')!=='yes')throw new Error('Удаление не подтверждено');const result=await deleteAdminTrackAnnotation(circuitId,layoutId,annotationId,String(formData.get('revision')??''));if(!result)throw new Error('Элемент разметки не найден');publicDataSynced=result.publicDataSynced;}catch(error){console.error('Не удалось удалить разметку конфигурации',error);redirect(`${destination}?error=${error instanceof Error&&error.message.includes('Обновите страницу')?'conflict':'delete'}`);}
  revalidatePath(destination);revalidatePath(`/circuits/${encodeURIComponent(circuitId)}`);
  redirect(`${destination}?deleted=1${publicDataSynced?'':'&syncError=1'}`);
}

export async function previewTrackAnnotationImport(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const circuitId = String(formData.get('circuitId') ?? '').trim();
  const layoutId = String(formData.get('layoutId') ?? '').trim();
  const destination = `/admin/circuits/${encodeURIComponent(circuitId)}/layouts/${encodeURIComponent(layoutId)}/annotations`;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(circuitId) || !/^[A-Za-z0-9_-]+$/.test(layoutId)) throw new Error('Некорректная конфигурация');
    const file = formData.get('packageFile');
    if (!(file instanceof File) || !file.size || file.size > 5_000_000) throw new Error('Выберите GeoJSON до 5 МБ');
    const packageData = JSON.parse(await file.text()) as Record<string, unknown>;
    if (packageData.circuitId !== circuitId || packageData.layoutId !== layoutId) throw new Error('Пакет относится к другой конфигурации');
    const preview = await createAdminTrackAnnotationImportPreview(packageData);
    if (!preview) throw new Error('Не удалось создать предпросмотр разметки');
    redirect(`${destination}?importPreview=${encodeURIComponent(preview.token)}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('Не удалось подготовить пакет разметки', error);
    redirect(`${destination}?error=import-preview`);
  }
}

export async function previewLegacyTrackAnnotationImport(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const circuitId = String(formData.get('circuitId') ?? '').trim();
  const layoutId = String(formData.get('layoutId') ?? '').trim();
  const destination = `/admin/circuits/${encodeURIComponent(circuitId)}/layouts/${encodeURIComponent(layoutId)}/annotations`;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(circuitId) || !/^[A-Za-z0-9_-]+$/.test(layoutId)) throw new Error('Некорректная конфигурация');
    const sourceName = String(formData.get('sourceName') ?? '').trim();
    const sourceUrl = new URL(String(formData.get('sourceUrl') ?? '').trim());
    if (!sourceName || !['http:', 'https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) throw new Error('Укажите документированный источник');
    if (formData.get('sourceAcknowledged') !== 'yes') throw new Error('Подтвердите применимость источника');
    const packageData = buildLegacyTrackAnnotationPackage(circuitId, layoutId, sourceName, sourceUrl.href);
    if (!packageData) throw new Error('Справочная разметка для этой конфигурации отсутствует');
    const registry = await getAdminTrackAnnotations(circuitId, layoutId);
    if (!registry) throw new Error('Конфигурация не найдена');
    const existing = new Set(registry.annotations.map(item => item.id));
    const occupied = new Set(registry.annotations.filter(item => item.sequence !== null && item.reviewStatus !== 'hidden').map(item => `${item.annotationType}:${item.sequence}:${item.validFromYear ?? 0}`));
    const features = packageData.features.filter(feature => !existing.has(String(feature.properties?.id))
      && !occupied.has(`${feature.properties?.annotationType}:${feature.properties?.sequence}:${feature.properties?.validFromYear ?? 0}`));
    if (!features.length) throw new Error('Все элементы уже перенесены');
    const preview = await createAdminTrackAnnotationImportPreview({ ...packageData, features });
    if (!preview) throw new Error('Не удалось создать предпросмотр');
    redirect(`${destination}?importPreview=${encodeURIComponent(preview.token)}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('Не удалось подготовить перенос существующей разметки', error);
    redirect(`${destination}?error=legacy-import`);
  }
}

export async function applyTrackAnnotationImport(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const circuitId = String(formData.get('circuitId') ?? '').trim();
  const layoutId = String(formData.get('layoutId') ?? '').trim();
  const token = String(formData.get('token') ?? '').trim();
  const destination = `/admin/circuits/${encodeURIComponent(circuitId)}/layouts/${encodeURIComponent(layoutId)}/annotations`;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(circuitId) || !/^[A-Za-z0-9_-]+$/.test(layoutId) || !/^[A-Za-z0-9-]+$/.test(token)) throw new Error('Некорректный предпросмотр');
    const preview = await getAdminTrackAnnotationImportPreview(token);
    if (!preview || preview.circuit.id !== circuitId || preview.layout.id !== layoutId) {
      throw new Error('Предпросмотр относится к другой конфигурации или устарел');
    }
    const result = await applyAdminTrackAnnotationImportPreview(token, circuitId, layoutId);
    if (!result) throw new Error('Предпросмотр разметки не найден или устарел');
    if (result.circuitId !== circuitId || result.layoutId !== layoutId) throw new Error('Предпросмотр относится к другой конфигурации');
    revalidatePath(destination);
    redirect(`${destination}?imported=${result.imported}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('Не удалось применить пакет разметки', error);
    redirect(`${destination}?importPreview=${encodeURIComponent(token)}&error=import-apply`);
  }
}

export async function updateDriver(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const id = String(formData.get('id') ?? '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) redirect('/admin?error=invalid-driver');
  let publicDataSynced = true;

  try {
    const nameRu = optionalText(formData, 'nameRu');
    if (!nameRu) throw new Error('Имя на русском обязательно');
    const birthDate = optionalDate(formData, 'birthDate');
    const deathDate = optionalDate(formData, 'deathDate');
    if (birthDate && deathDate && deathDate < birthDate) throw new Error('Дата смерти не может быть раньше даты рождения');
    const sourceUrl = String(formData.get('sourceUrl') ?? '').trim();
    const parsedSource = new URL(sourceUrl);
    if (!['http:', 'https:'].includes(parsedSource.protocol)) throw new Error('Источник должен быть HTTP(S)-ссылкой');
    if (parsedSource.username || parsedSource.password) throw new Error('Источник не должен содержать логин или пароль');

    const input: AdminDriverInput = {
      id,
      expectedRevision: String(formData.get('expectedRevision') ?? '').trim(),
      nameRu,
      birthDate,
      birthPlaceRu: optionalText(formData, 'birthPlaceRu'),
      deathDate,
      heightCm: optionalNumber(formData, 'heightCm', 120, 230),
      weightKg: optionalNumber(formData, 'weightKg', 35, 200),
      biographyRu: optionalText(formData, 'biographyRu'),
      sourceUrl: parsedSource.href,
    };
    const result = await updateAdminDriver(input);
    publicDataSynced = result.publicDataSynced;
  } catch (error) {
    console.error('Не удалось сохранить профиль пилота', error);
    redirect(`/admin/drivers/${encodeURIComponent(id)}?error=${error instanceof Error && error.message.includes('Обновите страницу') ? 'conflict' : 'save'}`);
  }

  revalidatePath('/admin');
  revalidatePath(`/admin/drivers/${id}`);
  revalidatePath(`/drivers/${id}`);
  redirect(`/admin/drivers/${encodeURIComponent(id)}?saved=1${publicDataSynced ? '' : '&syncError=1'}`);
}

export async function updateDriverEditorial(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const id = String(formData.get('id') ?? '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) redirect('/admin?error=invalid-driver');
  let publicDataSynced = true;
  try {
    const parsed = JSON.parse(String(formData.get('editorialJson') ?? '{}')) as {
      nicknames?: Array<Record<string, unknown>>; quotes?: Array<Record<string, unknown>>;
    };
    const clean = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
    const nicknames = (parsed.nicknames ?? []).map((row) => ({
      nameRu: clean(row.nameRu) ?? '', nameOriginal: clean(row.nameOriginal),
      contextRu: clean(row.contextRu), sourceUrl: clean(row.sourceUrl) ?? '',
    }));
    const quotes = (parsed.quotes ?? []).map((row) => ({
      quoteRu: clean(row.quoteRu) ?? '', quoteOriginal: clean(row.quoteOriginal),
      attributionRu: clean(row.attributionRu) ?? '', contextRu: clean(row.contextRu),
      quoteDate: clean(row.quoteDate), sourceUrl: clean(row.sourceUrl) ?? '',
    }));
    const result = await updateAdminDriverEditorial({ id, expectedRevision: String(formData.get('expectedRevision') ?? '').trim(), nicknames, quotes });
    publicDataSynced = result.publicDataSynced;
  } catch (error) {
    console.error('Не удалось сохранить прозвища и цитаты', error);
    redirect(`/admin/drivers/${encodeURIComponent(id)}?error=${error instanceof Error && error.message.includes('Обновите страницу') ? 'conflict' : 'editorial'}`);
  }
  revalidatePath(`/admin/drivers/${id}`);
  revalidatePath(`/drivers/${id}`);
  redirect(`/admin/drivers/${encodeURIComponent(id)}?editorialSaved=1${publicDataSynced ? '' : '&syncError=1'}`);
}

function safeAdminReturnPath(formData: FormData) {
  const value = String(formData.get('returnTo') ?? '/admin');
  return value === '/admin' || value.startsWith('/admin?') ? value : '/admin';
}

function returnPathWithStatus(returnTo: string, name: string, value: string) {
  const [pathname, query = ''] = returnTo.split('?', 2);
  const search = new URLSearchParams(query);
  search.set(name, value);
  return `${pathname}?${search}`;
}

export async function quickUpdateDriver(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const id = String(formData.get('id') ?? '').trim();
  const returnTo = safeAdminReturnPath(formData);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) redirect(returnPathWithStatus(returnTo, 'quickError', 'invalid-driver'));
  let publicDataSynced = true;

  try {
    const current = await getAdminDriver(id);
    if (!current) throw new Error('Пилот не найден');
    const initialValues = JSON.parse(String(formData.get('initialValues') ?? '{}')) as Record<string, unknown>;
    for (const field of ['nameRu', 'birthDate', 'birthPlaceRu', 'deathDate', 'heightCm', 'weightKg'] as const) {
      if (String(initialValues[field] ?? '') !== String(current[field] ?? '')) {
        throw new Error('Профиль изменился. Обновите страницу перед сохранением');
      }
    }
    const nameRu = optionalText(formData, 'nameRu');
    if (!nameRu) throw new Error('Имя на русском обязательно');
    const birthDate = optionalDate(formData, 'birthDate');
    const deathDate = optionalDate(formData, 'deathDate');
    if (birthDate && deathDate && deathDate < birthDate) throw new Error('Дата смерти не может быть раньше даты рождения');
    const sourceUrl = String(formData.get('sourceUrl') ?? '').trim();
    const parsedSource = new URL(sourceUrl);
    if (!['http:', 'https:'].includes(parsedSource.protocol) || parsedSource.username || parsedSource.password) throw new Error('Некорректная ссылка на источник');
    const result = await updateAdminDriver({
      id,
      expectedRevision: current.driverUpdatedAt,
      nameRu,
      birthDate,
      birthPlaceRu: optionalText(formData, 'birthPlaceRu'),
      deathDate,
      heightCm: optionalNumber(formData, 'heightCm', 120, 230),
      weightKg: optionalNumber(formData, 'weightKg', 35, 200),
      biographyRu: current.biographyRu,
      sourceUrl: parsedSource.href,
    });
    publicDataSynced = result.publicDataSynced;
  } catch (error) {
    console.error('Не удалось быстро сохранить профиль пилота', error);
    redirect(returnPathWithStatus(returnTo, 'quickError', id));
  }

  revalidatePath('/admin');
  revalidatePath(`/admin/drivers/${id}`);
  revalidatePath(`/drivers/${id}`);
  revalidatePath('/drivers');
  let destination = returnPathWithStatus(returnTo, 'savedDriver', id);
  if (!publicDataSynced) destination = returnPathWithStatus(destination, 'syncError', '1');
  redirect(destination);
}

export async function uploadDriverPhoto(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const id = String(formData.get('id') ?? '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) redirect('/admin?error=invalid-driver');
  let publicDataSynced = true;

  try {
    const file = formData.get('photo');
    if (!(file instanceof File) || !file.size) throw new Error('Фотография не выбрана');
    if (file.size > 8 * 1024 * 1024) throw new Error('Фотография больше 8 МБ');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Разрешены JPG, PNG и WebP');
    if (formData.get('rightsConfirmed') !== 'yes') throw new Error('Не подтверждены права на использование');
    const sourceUrl = String(formData.get('photoSourceUrl') ?? '').trim();
    const parsedSource = new URL(sourceUrl);
    if (!['http:', 'https:'].includes(parsedSource.protocol) || parsedSource.username || parsedSource.password) throw new Error('Некорректный источник фотографии');
    const altTextRu = optionalText(formData, 'photoAltTextRu');
    const author = optionalText(formData, 'photoAuthor');
    const licence = optionalText(formData, 'photoLicence');
    if (!altTextRu || !author || !licence) throw new Error('Не заполнены сведения о фотографии');
    const result = await uploadAdminDriverPhoto({
      id,
      fileName: file.name,
      mimeType: file.type,
      bytes: await file.arrayBuffer(),
      altTextRu,
      author,
      licence,
      sourceUrl: parsedSource.href,
      removeBackground: formData.get('removeBackground') === 'yes',
      previewToken: String(formData.get('previewToken') ?? ''),
      cropZoom: Number(formData.get('cropZoom') ?? 1),
      cropX: Number(formData.get('cropX') ?? 0),
      cropY: Number(formData.get('cropY') ?? 0),
    });
    publicDataSynced = result.publicDataSynced;
  } catch (error) {
    console.error('Не удалось загрузить фотографию пилота', error);
    const kind = error instanceof Error && /ISNet|rembg|Python 3\.11/.test(error.message)
      ? 'background'
      : error instanceof Error && /предпросмотр/i.test(error.message) ? 'preview' : 'photo';
    redirect(`/admin/drivers/${encodeURIComponent(id)}?error=${kind}`);
  }

  revalidatePath('/admin');
  revalidatePath(`/admin/drivers/${id}`);
  revalidatePath(`/drivers/${id}`);
  revalidatePath('/drivers');
  redirect(`/admin/drivers/${encodeURIComponent(id)}?photoSaved=1${publicDataSynced ? '' : '&syncError=1'}`);
}

export async function previewDriverPhoto(formData: FormData) {
  if (!await getAdminSession()) return { ok: false as const, error: 'Сессия завершена. Обновите страницу и войдите снова' };
  const id = String(formData.get('id') ?? '').trim();
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Некорректный ID пилота');
    const file = formData.get('photo');
    if (!(file instanceof File) || !file.size) throw new Error('Выберите фотографию');
    if (file.size > 8 * 1024 * 1024) throw new Error('Фотография больше 8 МБ');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Разрешены JPG, PNG и WebP');
    const result = await previewAdminDriverPhoto({
      id,
      fileName: file.name,
      mimeType: file.type,
      bytes: await file.arrayBuffer(),
      removeBackground: formData.get('removeBackground') === 'yes',
    });
    return { ok: true as const, ...result };
  } catch (error) {
    console.error('Не удалось создать предпросмотр фотографии', error);
    return { ok: false as const, error: error instanceof Error ? error.message : 'Не удалось создать предпросмотр' };
  }
}

function constructorIdentity(formData: FormData) {
  const season = Number(formData.get('season'));
  const constructorId = String(formData.get('constructorId') ?? '').trim();
  if (!Number.isInteger(season) || season < 1950 || season > 2100) throw new Error('Некорректный сезон');
  if (!/^[A-Za-z0-9_-]+$/.test(constructorId)) throw new Error('Некорректный ID команды');
  return { season, constructorId };
}

async function constructorCarInput(formData: FormData, requireRights: boolean): Promise<AdminConstructorCarInput> {
  const { season, constructorId } = constructorIdentity(formData);
  const file = formData.get('car');
  if (!(file instanceof File) || !file.size) throw new Error('Изображение не выбрано');
  if (file.size > 8 * 1024 * 1024) throw new Error('Изображение больше 8 МБ');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Разрешены JPG, PNG и WebP');
  if (requireRights && formData.get('rightsConfirmed') !== 'yes') throw new Error('Не подтверждены права на использование');
  const sourceValue = String(formData.get('photoSourceUrl') ?? '').trim();
  const parsedSource = requireRights ? new URL(sourceValue) : null;
  if (parsedSource && (!['http:', 'https:'].includes(parsedSource.protocol) || parsedSource.username || parsedSource.password)) throw new Error('Некорректный источник изображения');
  const altTextRu = optionalText(formData, 'photoAltTextRu') ?? '';
  const author = optionalText(formData, 'photoAuthor') ?? '';
  const licence = optionalText(formData, 'photoLicence') ?? '';
  if (requireRights && (!altTextRu || !author || !licence)) throw new Error('Не заполнены сведения об изображении');
  return {
    season, constructorId, fileName: file.name, mimeType: file.type, bytes: await file.arrayBuffer(),
    altTextRu, author, licence, sourceUrl: parsedSource?.href ?? 'https://preview.invalid/',
    removeBackground: formData.get('removeBackground') === 'yes',
    previewToken: String(formData.get('previewToken') ?? ''),
    cropZoom: Number(formData.get('cropZoom') ?? 1), cropX: Number(formData.get('cropX') ?? 0), cropY: Number(formData.get('cropY') ?? 0),
  };
}

async function gameLogoInput(formData: FormData, requireRights: boolean): Promise<AdminGameLogoInput> {
  const gameId = String(formData.get('gameId') ?? '').trim();
  if (!['outline', 'map', 'driver-geography', 'calendar-optimizer'].includes(gameId)) throw new Error('Неизвестная игра');
  const file = formData.get('gameLogo');
  if (!(file instanceof File) || !file.size) throw new Error('Изображение не выбрано');
  if (file.size > 8 * 1024 * 1024) throw new Error('Изображение больше 8 МБ');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Разрешены JPG, PNG и WebP');
  if (requireRights && formData.get('rightsConfirmed') !== 'yes') throw new Error('Не подтверждены права на использование');
  const sourceValue = String(formData.get('photoSourceUrl') ?? '').trim();
  const source = requireRights ? new URL(sourceValue) : null;
  if (source && (!['http:', 'https:'].includes(source.protocol) || source.username || source.password)) throw new Error('Некорректный источник изображения');
  const altTextRu = optionalText(formData, 'photoAltTextRu') ?? '';
  const author = optionalText(formData, 'photoAuthor') ?? '';
  const licence = optionalText(formData, 'photoLicence') ?? '';
  if (requireRights && (!altTextRu || !author || !licence)) throw new Error('Не заполнены сведения об изображении');
  return { gameId: gameId as AdminGameLogoInput['gameId'], fileName: file.name, mimeType: file.type, bytes: await file.arrayBuffer(), altTextRu, author, licence,
    sourceUrl: source?.href ?? 'https://preview.invalid/', previewToken: String(formData.get('previewToken') ?? ''),
    cropZoom: Number(formData.get('cropZoom') ?? 1), cropX: Number(formData.get('cropX') ?? 0), cropY: Number(formData.get('cropY') ?? 0) };
}

export async function previewGameLogo(formData: FormData) {
  if (!await getAdminSession()) return { ok: false as const, error: 'Сессия завершена. Обновите страницу и войдите снова' };
  try {
    const result = await previewAdminGameLogo(await gameLogoInput(formData, false));
    if (!result.token || !result.imageDataUrl) throw new Error('Сервер не вернул предпросмотр');
    return { ok: true as const, token: result.token, imageDataUrl: result.imageDataUrl };
  } catch (error) {
    console.error('Не удалось создать предпросмотр логотипа игры', error);
    return { ok: false as const, error: error instanceof Error ? error.message : 'Не удалось создать предпросмотр' };
  }
}

export async function uploadGameLogo(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  let gameId = '';
  let publicDataSynced = true;
  try {
    const input = await gameLogoInput(formData, true);
    gameId = input.gameId;
    const result = await uploadAdminGameLogo(input);
    publicDataSynced = result.publicDataSynced !== false;
  } catch (error) {
    console.error('Не удалось загрузить логотип игры', error);
    redirect(`/admin/games?error=${encodeURIComponent(gameId || 'upload')}`);
  }
  revalidatePath('/admin/games');
  revalidatePath('/games');
  redirect(`/admin/games?saved=${encodeURIComponent(gameId)}${publicDataSynced ? '' : '&syncError=1'}`);
}

export async function previewConstructorCar(formData: FormData) {
  if (!await getAdminSession()) return { ok: false as const, error: 'Сессия завершена. Обновите страницу и войдите снова' };
  try {
    const result = await previewAdminConstructorCar(await constructorCarInput(formData, false));
    if (!result.token || !result.imageDataUrl) throw new Error('Сервер не вернул предпросмотр');
    return { ok: true as const, token: result.token, imageDataUrl: result.imageDataUrl,
      backgroundRemoved: result.backgroundRemoved, expiresInMinutes: result.expiresInMinutes ?? 15 };
  } catch (error) {
    console.error('Не удалось создать предпросмотр болида', error);
    return { ok: false as const, error: error instanceof Error ? error.message : 'Не удалось создать предпросмотр' };
  }
}

export async function uploadConstructorCar(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  let identity: { season: number; constructorId: string };
  try { identity = constructorIdentity(formData); }
  catch { redirect('/admin/teams?error=invalid-entry'); }
  let publicDataSynced = true;
  try {
    const result = await uploadAdminConstructorCar(await constructorCarInput(formData, true));
    publicDataSynced = result.publicDataSynced !== false;
  } catch (error) {
    console.error('Не удалось загрузить изображение болида', error);
    const kind = error instanceof Error && /ISNet|rembg|Python 3\.11/.test(error.message) ? 'background'
      : error instanceof Error && /предпросмотр/i.test(error.message) ? 'preview' : 'photo';
    redirect(`/admin/teams/${identity.season}/${encodeURIComponent(identity.constructorId)}?error=${kind}`);
  }
  revalidatePath('/admin/teams');
  revalidatePath(`/admin/teams/${identity.season}/${identity.constructorId}`);
  revalidatePath('/teams');
  revalidatePath(`/teams/${identity.constructorId}`);
  redirect(`/admin/teams/${identity.season}/${encodeURIComponent(identity.constructorId)}?photoSaved=1${publicDataSynced ? '' : '&syncError=1'}`);
}

export async function updateConstructorEntry(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  let identity: { season: number; constructorId: string };
  try { identity = constructorIdentity(formData); }
  catch { redirect('/admin/teams?error=invalid-entry'); }
  let publicDataSynced = true;
  try {
    const displayName = optionalText(formData, 'displayName');
    if (!displayName) throw new Error('Название команды обязательно');
    const teamColour = optionalText(formData, 'teamColour');
    if (teamColour && !/^#[0-9A-Fa-f]{6}$/.test(teamColour)) throw new Error('Некорректный цвет');
    const sourceUrl = new URL(String(formData.get('sourceUrl') ?? '').trim());
    if (!['http:', 'https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) throw new Error('Некорректный источник');
    const result = await updateAdminConstructorEntry({
      ...identity, displayName, teamColour,
      engineName: optionalText(formData, 'engineName'), carModel: optionalText(formData, 'carModel'),
      sourceUrl: sourceUrl.href,
    });
    publicDataSynced = result.publicDataSynced;
  } catch (error) {
    console.error('Не удалось сохранить сезонную запись команды', error);
    redirect(`/admin/teams/${identity.season}/${encodeURIComponent(identity.constructorId)}?error=save`);
  }
  revalidatePath('/admin/teams'); revalidatePath(`/admin/teams/${identity.season}/${identity.constructorId}`);
  revalidatePath('/teams'); revalidatePath(`/teams/${identity.constructorId}`); revalidatePath('/drivers');
  redirect(`/admin/teams/${identity.season}/${encodeURIComponent(identity.constructorId)}?saved=1${publicDataSynced ? '' : '&syncError=1'}`);
}

function constructorLineageInput(formData: FormData): AdminConstructorLineageInput {
  const predecessorConstructorId = optionalText(formData, 'predecessorConstructorId');
  const successorConstructorId = optionalText(formData, 'successorConstructorId');
  if (!predecessorConstructorId || !successorConstructorId || predecessorConstructorId === successorConstructorId) throw new Error('Выберите две разные команды');
  const relationshipType = String(formData.get('relationshipType') ?? '');
  if (!['rename', 'ownership_change', 'factory_takeover', 'licence_transfer', 'continuation', 'other'].includes(relationshipType)) throw new Error('Некорректный тип связи');
  const reviewStatus = String(formData.get('reviewStatus') ?? 'candidate');
  if (!['candidate', 'reviewed', 'published', 'rejected'].includes(reviewStatus)) throw new Error('Некорректный статус');
  const sourceUrl = new URL(String(formData.get('sourceUrl') ?? '').trim());
  if (!['http:', 'https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) throw new Error('Некорректный источник');
  const from = optionalNumber(formData, 'validFromYear', 1950, 2100);
  const to = optionalNumber(formData, 'validToYear', 1950, 2100);
  if (from !== null && to !== null && Number(to) < Number(from)) throw new Error('Конечный год раньше начального');
  return {
    predecessorConstructorId, successorConstructorId,
    relationshipType: relationshipType as AdminConstructorLineageInput['relationshipType'],
    validFromYear: from === null ? null : Number(from), validToYear: to === null ? null : Number(to),
    descriptionRu: optionalText(formData, 'descriptionRu'),
    reviewStatus: reviewStatus as AdminConstructorLineageInput['reviewStatus'], sourceUrl: sourceUrl.href,
  };
}

export async function saveConstructorLineage(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  try {
    const idValue = optionalText(formData, 'id');
    const input = constructorLineageInput(formData);
    if (idValue === null) await createAdminConstructorLineage(input);
    else {
      const id = Number(idValue);
      if (!Number.isInteger(id) || id < 1) throw new Error('Некорректный ID связи');
      await updateAdminConstructorLineage(id, input);
    }
  } catch (error) {
    console.error('Не удалось сохранить связь преемственности', error);
    redirect('/admin/teams/lineage?error=save');
  }
  revalidatePath('/admin/teams/lineage');
  redirect('/admin/teams/lineage?saved=1');
}

export async function removeConstructorLineage(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  try {
    const id = Number(formData.get('id'));
    if (!Number.isInteger(id) || id < 1 || formData.get('confirmDelete') !== 'yes') throw new Error('Удаление не подтверждено');
    await deleteAdminConstructorLineage(id);
  } catch (error) {
    console.error('Не удалось удалить связь преемственности', error);
    redirect('/admin/teams/lineage?error=delete');
  }
  revalidatePath('/admin/teams/lineage');
  redirect('/admin/teams/lineage?deleted=1');
}

export async function previewConstructorLogo(formData: FormData) {
  if (!await getAdminSession()) return { ok: false as const, error: 'Сессия завершена. Обновите страницу и войдите снова' };
  try {
    const result = await previewAdminConstructorLogo(await constructorCarInput(formData, false));
    if (!result.token || !result.imageDataUrl) throw new Error('Сервер не вернул предпросмотр');
    return { ok: true as const, token: result.token, imageDataUrl: result.imageDataUrl, expiresInMinutes: result.expiresInMinutes ?? 15 };
  } catch (error) {
    console.error('Не удалось создать предпросмотр логотипа', error);
    return { ok: false as const, error: error instanceof Error ? error.message : 'Не удалось создать предпросмотр' };
  }
}

export async function uploadConstructorLogo(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  let identity: { season: number; constructorId: string };
  try { identity = constructorIdentity(formData); }
  catch { redirect('/admin/teams?error=invalid-entry'); }
  let publicDataSynced = true;
  try {
    const result = await uploadAdminConstructorLogo(await constructorCarInput(formData, true));
    publicDataSynced = result.publicDataSynced !== false;
  } catch (error) {
    console.error('Не удалось загрузить логотип команды', error);
    const kind = error instanceof Error && /предпросмотр/i.test(error.message) ? 'logo-preview' : 'logo';
    redirect(`/admin/teams/${identity.season}/${encodeURIComponent(identity.constructorId)}?error=${kind}`);
  }
  revalidatePath('/admin/teams'); revalidatePath(`/admin/teams/${identity.season}/${identity.constructorId}`);
  revalidatePath('/teams'); revalidatePath(`/teams/${identity.constructorId}`); revalidatePath('/drivers');
  redirect(`/admin/teams/${identity.season}/${encodeURIComponent(identity.constructorId)}?logoSaved=1${publicDataSynced ? '' : '&syncError=1'}`);
}

export async function updateMediaAsset(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const id = String(formData.get('id') ?? '').trim();
  if (!id || id.length > 255 || id.includes('/')) redirect('/admin/media?error=invalid-asset');
  let publicDataSynced = true;
  try {
    const usageRole = String(formData.get('usageRole') ?? '').trim();
    if (!/^[a-z][a-z0-9_]*$/.test(usageRole)) throw new Error('Некорректное назначение');
    const sourceUrl = optionalText(formData, 'sourceUrl') ?? '';
    if (sourceUrl) {
      const parsed = new URL(sourceUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Некорректный источник');
    }
    const result = await updateAdminMediaAsset({
      id, usageRole, sourceUrl,
      altTextRu: optionalText(formData, 'altTextRu') ?? '',
      author: optionalText(formData, 'author') ?? '',
      licence: optionalText(formData, 'licence') ?? '',
      rightsStatus: String(formData.get('rightsStatus') ?? ''),
      reviewStatus: String(formData.get('reviewStatus') ?? ''),
    });
    publicDataSynced = result.publicDataSynced;
  } catch (error) {
    console.error('Не удалось сохранить медиаматериал', error);
    redirect(`/admin/media/${encodeURIComponent(id)}?error=save`);
  }
  revalidatePath('/admin/media'); revalidatePath(`/admin/media/${id}`);
  revalidatePath('/drivers'); revalidatePath('/teams');
  redirect(`/admin/media/${encodeURIComponent(id)}?saved=1${publicDataSynced ? '' : '&syncError=1'}`);
}

export async function updateDatabaseRow(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const table = String(formData.get('table') ?? '');
  const page = Math.max(1, Number.parseInt(String(formData.get('page') ?? '1'), 10) || 1);
  if (!/^[a-z][a-z0-9_]*$/.test(table)) redirect('/admin/database?error=invalid-table');
  const destination = `/admin/database/${encodeURIComponent(table)}?page=${page}`;
  try {
    const key = JSON.parse(String(formData.get('key') ?? '{}')) as Record<string, unknown>;
    const values = Object.fromEntries(
      [...formData.entries()]
        .filter(([name]) => name.startsWith('field:'))
        .map(([name, value]) => [name.slice(6), String(value)]),
    );
    await updateAdminTableRow(table, key, values);
  } catch (error) {
    console.error(`Не удалось сохранить строку atlas.${table}`, error);
    redirect(`${destination}&error=save`);
  }
  revalidatePath(destination.split('?')[0]);
  redirect(`${destination}&saved=1`);
}

export async function previewTravelCandidates(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const circuitId = String(formData.get('circuitId') ?? '').trim();
  const groups = formData.getAll('groups').map(String);
  if (!/^[A-Za-z0-9_-]+$/.test(circuitId)) redirect('/admin/travel/import?error=circuit');
  const radius = (name: string, fallbackKm: number) => {
    const kilometres = Number(formData.get(name) ?? fallbackKm);
    if (!Number.isFinite(kilometres) || kilometres < 1 || kilometres > 250) throw new Error('Некорректный радиус');
    return Math.round(kilometres * 1000);
  };
  let token: string;
  try {
    const preview = await createAdminTravelImportPreview({
      circuitId, groups,
      radii: {
        airport: radius('airportRadius', 200),
        regionalTransport: radius('transportRadius', 50),
        stay: radius('stayRadius', 50),
        explore: radius('exploreRadius', 50),
        essential: radius('essentialRadius', 15),
      },
    });
    token = preview.token;
  } catch (error) {
    console.error('Не удалось найти туристические точки', error);
    redirect(`/admin/travel/import?circuit=${encodeURIComponent(circuitId)}&error=preview`);
  }
  redirect(`/admin/travel/import?preview=${encodeURIComponent(token)}`);
}

export async function applyTravelCandidates(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const token = String(formData.get('token') ?? '').trim();
  const selectedIds = formData.getAll('candidate').map(String);
  if (!/^[A-Za-z0-9-]+$/.test(token)) redirect('/admin/travel/import?error=expired');
  let result: { circuitId: string; imported: number };
  try { result = await applyAdminTravelImportPreview(token, selectedIds); }
  catch (error) {
    console.error('Не удалось импортировать туристические точки', error);
    redirect(`/admin/travel/import?preview=${encodeURIComponent(token)}&error=apply`);
  }
  revalidatePath('/admin/travel');
  redirect(`/admin/travel?imported=${result.imported}&circuit=${encodeURIComponent(result.circuitId)}`);
}

export async function saveTravelPoint(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const circuitId = String(formData.get('circuitId') ?? '').trim();
  const id = String(formData.get('id') ?? '').trim();
  const destination = `/admin/travel/${encodeURIComponent(circuitId)}/points/${encodeURIComponent(id)}`;
  if (!/^[A-Za-z0-9_-]+$/.test(circuitId) || !/^[A-Za-z0-9_-]+$/.test(id)) redirect('/admin/travel?error=invalid-point');
  let publicDataSynced = true;
  try {
    const integer = (name: string) => {
      const value = Number(formData.get(name));
      if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error(`Некорректное поле ${name}`);
      return value;
    };
    const coordinate = (name: string, minimum: number, maximum: number) => {
      const value = Number(formData.get(name));
      if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`Некорректное поле ${name}`);
      return value;
    };
    const name = optionalText(formData, 'name');
    if (!name) throw new Error('Исходное название обязательно');
    const result = await updateAdminTravelPoint({
      id, circuitId, name, nameRu: optionalText(formData, 'nameRu'), descriptionRu: optionalText(formData, 'descriptionRu'),
      categoryId: String(formData.get('categoryId') ?? ''), role: String(formData.get('role') ?? '') as 'transport' | 'stay' | 'explore' | 'essential' | 'circuit',
      latitude: coordinate('latitude', -90, 90), longitude: coordinate('longitude', -180, 180),
      address: optionalText(formData, 'address'), websiteUrl: optionalText(formData, 'websiteUrl'), openingHours: optionalText(formData, 'openingHours'),
      importance: integer('importance'), priority: integer('priority'), isFeatured: formData.get('isFeatured') === 'yes',
      reviewStatus: String(formData.get('reviewStatus') ?? '') as 'candidate' | 'reviewed' | 'published' | 'hidden',
      editorialNoteRu: optionalText(formData, 'editorialNoteRu'),
    });
    publicDataSynced = result.publicDataSynced;
  } catch (error) {
    console.error('Не удалось сохранить туристическую точку', error);
    redirect(`${destination}?error=save`);
  }
  revalidatePath('/admin/travel'); revalidatePath(`/admin/travel/${circuitId}`); revalidatePath(destination);
  redirect(`${destination}?saved=1${publicDataSynced ? '' : '&syncError=1'}`);
}

export async function updateTravelPointsBulk(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const circuitId = String(formData.get('circuitId') ?? '').trim();
  const fallback = `/admin/travel/${encodeURIComponent(circuitId)}`;
  const requestedReturnTo = String(formData.get('returnTo') ?? '');
  const returnTo = requestedReturnTo === fallback || requestedReturnTo.startsWith(`${fallback}?`) ? requestedReturnTo : fallback;
  const destination = (name: string, value: string) => {
    const [pathname, query = ''] = returnTo.split('?', 2);
    const search = new URLSearchParams(query);
    search.delete('bulkUpdated'); search.delete('bulkError'); search.delete('syncError');
    search.set(name, value);
    return `${pathname}?${search}`;
  };
  try {
    if (circuitId.length > 100 || !/^[A-Za-z0-9_-]+$/.test(circuitId)) throw new Error('Некорректный ID трассы');
    const pointIds = formData.getAll('pointId').map(String);
    const operation = String(formData.get('bulkOperation') ?? '');
    const status = operation.startsWith('status:') ? operation.slice(7) : null;
    const featured = operation === 'featured:yes' ? true : operation === 'featured:no' ? false : null;
    if (pointIds.length < 1 || pointIds.length > 100) throw new Error('Выберите от 1 до 100 точек');
    if (status !== null && !['candidate', 'reviewed', 'published', 'hidden'].includes(status)) throw new Error('Некорректный статус');
    if (status === null && featured === null) throw new Error('Не выбрано пакетное действие');
    const result = await updateAdminTravelPointsBulk({
      circuitId, pointIds,
      ...(status === null ? { isFeatured: featured as boolean } : { reviewStatus: status as 'candidate' | 'reviewed' | 'published' | 'hidden' }),
    });
    revalidatePath('/admin/travel'); revalidatePath(`/admin/travel/${circuitId}`);
    let target = destination('bulkUpdated', String(result.updated));
    if (!result.publicDataSynced) target += '&syncError=1';
    redirect(target);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('Не удалось пакетно обновить туристические точки', error);
    redirect(destination('bulkError', '1'));
  }
}

export async function applyTravelPointOsmTranslations(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const circuitId = String(formData.get('circuitId') ?? '').trim();
  const fallback = `/admin/travel/${encodeURIComponent(circuitId)}`;
  const requestedReturnTo = String(formData.get('returnTo') ?? '');
  const returnTo = requestedReturnTo === fallback || requestedReturnTo.startsWith(`${fallback}?`) ? requestedReturnTo : fallback;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(circuitId)) throw new Error('Некорректный ID трассы');
    const result = await applyAdminTravelPointOsmTranslations(circuitId);
    revalidatePath('/admin/travel'); revalidatePath(`/admin/travel/${circuitId}`);
    const separator = returnTo.includes('?') ? '&' : '?';
    redirect(`${returnTo}${separator}translated=${result.updated}${result.publicDataSynced ? '' : '&translationSyncError=1'}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('Не удалось применить русские названия OpenStreetMap', error);
    const separator = returnTo.includes('?') ? '&' : '?';
    redirect(`${returnTo}${separator}translationError=1`);
  }
}

async function travelPointPhotoInput(formData: FormData, requireRights: boolean): Promise<AdminTravelPointPhotoInput> {
  const circuitId = String(formData.get('circuitId') ?? '').trim();
  const pointId = String(formData.get('pointId') ?? '').trim();
  const file = formData.get('photo');
  if (!/^[A-Za-z0-9_-]+$/.test(circuitId) || !/^[A-Za-z0-9_-]+$/.test(pointId)) throw new Error('Некорректный ID точки');
  if (!(file instanceof File) || !file.size) throw new Error('Фотография не выбрана');
  if (file.size > 8 * 1024 * 1024) throw new Error('Фотография больше 8 МБ');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Разрешены JPG, PNG и WebP');
  if (requireRights && formData.get('rightsConfirmed') !== 'yes') throw new Error('Не подтверждены права на использование');
  const altTextRu = optionalText(formData, 'photoAltTextRu') ?? '';
  const author = optionalText(formData, 'photoAuthor') ?? '';
  const licence = optionalText(formData, 'photoLicence') ?? '';
  const sourceValue = String(formData.get('photoSourceUrl') ?? '').trim();
  const sourceUrl = requireRights ? new URL(sourceValue) : null;
  if (sourceUrl && (!['http:', 'https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password)) throw new Error('Некорректный источник фотографии');
  if (requireRights && (!altTextRu || !author || !licence)) throw new Error('Не заполнены сведения о фотографии');
  return {
    circuitId, pointId, fileName: file.name, mimeType: file.type, bytes: await file.arrayBuffer(),
    altTextRu, author, licence, sourceUrl: sourceUrl?.href ?? 'https://preview.invalid/',
    previewToken: String(formData.get('previewToken') ?? ''),
    cropZoom: Number(formData.get('cropZoom') ?? 1), cropX: Number(formData.get('cropX') ?? 0), cropY: Number(formData.get('cropY') ?? 0),
  };
}

export async function previewTravelPointPhoto(formData: FormData) {
  if (!await getAdminSession()) return { ok: false as const, error: 'Сессия завершена. Обновите страницу и войдите снова' };
  try {
    const result = await previewAdminTravelPointPhoto(await travelPointPhotoInput(formData, false));
    if (!result.token || !result.imageDataUrl) throw new Error('Сервер не вернул предпросмотр');
    return { ok: true as const, token: result.token, imageDataUrl: result.imageDataUrl };
  } catch (error) {
    console.error('Не удалось создать предпросмотр фотографии туристической точки', error);
    return { ok: false as const, error: error instanceof Error ? error.message : 'Не удалось создать предпросмотр' };
  }
}

export async function uploadTravelPointPhoto(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const circuitId = String(formData.get('circuitId') ?? '').trim();
  const pointId = String(formData.get('pointId') ?? '').trim();
  const destination = `/admin/travel/${encodeURIComponent(circuitId)}/points/${encodeURIComponent(pointId)}`;
  try {
    const result = await uploadAdminTravelPointPhoto(await travelPointPhotoInput(formData, true));
    revalidatePath('/admin/media'); revalidatePath('/admin/travel'); revalidatePath(`/admin/travel/${circuitId}`); revalidatePath(destination);
    redirect(`${destination}?photoSaved=1${result.publicDataSynced ? '' : '&syncError=1'}#photo-upload`);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('Не удалось загрузить фотографию туристической точки', error);
    redirect(`${destination}?error=photo#photo-upload`);
  }
}

export async function saveTravelZone(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const circuitId = String(formData.get('circuitId') ?? '').trim(); const zoneId = String(formData.get('zoneId') ?? '').trim();
  const destination = `/admin/travel/${encodeURIComponent(circuitId)}/zones/${encodeURIComponent(zoneId)}`;
  try {
    const lines = (name: string) => String(formData.get(name) ?? '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const selectedPoints = formData.getAll('selectedPoint').map(String);
    const result = await updateAdminTravelZone(circuitId, zoneId, {
      name: optionalText(formData,'name'), nameRu: optionalText(formData,'nameRu'), zoneType: String(formData.get('zoneType') ?? ''),
      descriptionRu: optionalText(formData,'descriptionRu'), geometryGeoJson: optionalText(formData,'geometryGeoJson'),
      priority: Number(formData.get('priority')), priceBand: formData.get('priceBand') ? Number(formData.get('priceBand')) : null,
      bestFor: lines('bestFor'), advantagesRu: lines('advantagesRu'), disadvantagesRu: lines('disadvantagesRu'),
      eventOnly: formData.get('eventOnly') === 'yes', reviewStatus: String(formData.get('reviewStatus') ?? ''),
      sortOrder: Number(formData.get('sortOrder')), characterRu: optionalText(formData,'characterRu'), travelTimeRu: optionalText(formData,'travelTimeRu'),
      tone: String(formData.get('tone') ?? '#F2C14E'), sourceUrl: String(formData.get('sourceUrl') ?? ''),
      selectedPoints, examplePoints: formData.getAll('examplePoint').map(String).filter((id) => selectedPoints.includes(id)),
    });
    revalidatePath('/admin/travel'); revalidatePath(`/admin/travel/${circuitId}`); revalidatePath(`/admin/travel/${circuitId}/zones`); revalidatePath(destination);
    redirect(`${destination}?saved=1${result?.publicDataSynced === false ? '&syncError=1' : ''}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('Не удалось сохранить район проживания',error); redirect(`${destination}?error=save`);
  }
}

export async function saveTravelRoute(formData:FormData){
  if(!await getAdminSession())redirect('/admin/login');const circuitId=String(formData.get('circuitId')??'').trim(),routeId=String(formData.get('routeId')??'').trim();const destination=`/admin/travel/${encodeURIComponent(circuitId)}/routes/${encodeURIComponent(routeId)}`;
  try{const lines=(name:string)=>String(formData.get(name)??'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean);const result=await updateAdminTravelRoute(circuitId,routeId,{
    routeType:String(formData.get('routeType')??''),travelMode:String(formData.get('travelMode')??''),name:optionalText(formData,'name'),nameRu:optionalText(formData,'nameRu'),summaryRu:optionalText(formData,'summaryRu'),
    geometryGeoJson:optionalText(formData,'geometryGeoJson'),distanceM:Number(formData.get('distanceM')),durationMinutes:Number(formData.get('durationMinutes')),difficulty:String(formData.get('difficulty')??''),
    eventOnly:formData.get('eventOnly')==='yes',bookingRequired:formData.get('bookingRequired')==='yes',accessibilityNotesRu:optionalText(formData,'accessibilityNotesRu'),scheduleNotesRu:optionalText(formData,'scheduleNotesRu'),
    routeEngine:optionalText(formData,'routeEngine'),routeEngineProfile:optionalText(formData,'routeEngineProfile'),reviewStatus:String(formData.get('reviewStatus')??''),sourceUrl:String(formData.get('sourceUrl')??''),
    routeGroup:optionalText(formData,'routeGroup'),sortOrder:Number(formData.get('sortOrder')),lineOffsetPx:Number(formData.get('lineOffsetPx')),lineColour:String(formData.get('lineColour')??''),
    minZoom:Number(formData.get('minZoom')),maxZoom:Number(formData.get('maxZoom')),visibleByDefault:formData.get('visibleByDefault')==='yes',notesRu:optionalText(formData,'notesRu'),
    rationaleRu:optionalText(formData,'rationaleRu'),highlightsRu:lines('highlightsRu'),practicalNotesRu:optionalText(formData,'practicalNotesRu'),
    terminalAccessAnchorId:optionalText(formData,'terminalAccessAnchorId'),
    routeVariantKind:String(formData.get('routeVariantKind')??''),displayPriority:Number(formData.get('displayPriority')),
    geometryMode:String(formData.get('geometryMode')??''),lifecycle:String(formData.get('lifecycle')??''),optimizeWaypointOrder:formData.get('optimizeWaypointOrder')==='yes',
    geometryModified:formData.get('geometryModified')==='yes',
    expectedUpdatedAt:String(formData.get('expectedUpdatedAt')??''),
    stops:JSON.parse(String(formData.get('stopsJson')??'[]'))});
    revalidatePath('/admin/travel');revalidatePath(`/admin/travel/${circuitId}`);revalidatePath(`/admin/travel/${circuitId}/routes`);revalidatePath(destination);redirect(`${destination}?saved=1${result?.publicDataSynced===false?'&syncError=1':''}`);
  }catch(error){if(error&&typeof error==='object'&&'digest'in error)throw error;console.error('Не удалось сохранить маршрут',error);redirect(`${destination}?error=save`);}
}

export async function previewTravelRouteGeometry(input:{circuitId:string;routeId:string;travelMode:'car';points:number[][]}) {
  if(!await getAdminSession())throw new Error('Требуется вход в админку');
  if(!/^[A-Za-z0-9_-]+$/.test(input.circuitId)||!/^[A-Za-z0-9_-]+$/.test(input.routeId)||input.travelMode!=='car')throw new Error('Некорректные данные маршрута');
  const result=await createAdminTravelRouteGeometryPreview(input.circuitId,input.routeId,{travelMode:'car',points:input.points});
  if(!result)throw new Error('Маршрут или трасса не найдены');
  return result;
}

export async function changeTravelRouteLifecycle(formData:FormData) {
  if(!await getAdminSession())redirect('/admin/login');
  const circuitId=String(formData.get('circuitId')??'').trim(),routeId=String(formData.get('routeId')??'').trim();
  const destination=`/admin/travel/${encodeURIComponent(circuitId)}/routes/${encodeURIComponent(routeId)}`;
  try {
    if(!/^[A-Za-z0-9_-]+$/.test(circuitId)||!/^[A-Za-z0-9_-]+$/.test(routeId))throw new Error('Некорректный маршрут');
    const operation=String(formData.get('operation')??'');
    if(operation!=='archive'&&operation!=='restore')throw new Error('Некорректное действие');
    const result=await changeAdminTravelRouteLifecycle(circuitId,routeId,{operation,expectedUpdatedAt:String(formData.get('expectedUpdatedAt')??'')});
    if (!result) throw new Error('Маршрут не найден');
    revalidatePath(`/admin/travel/${circuitId}/routes`);revalidatePath(destination);
    redirect(`${destination}?routeAction=${operation}${result.publicDataSynced?'':'&syncError=1'}`);
  }catch(error){if(error&&typeof error==='object'&&'digest'in error)throw error;console.error('Не удалось изменить состояние маршрута',error);redirect(`${destination}?error=lifecycle`);}
}

export async function deleteArchivedTravelRoute(formData:FormData) {
  if(!await getAdminSession())redirect('/admin/login');
  const circuitId=String(formData.get('circuitId')??'').trim(),routeId=String(formData.get('routeId')??'').trim();
  const destination=`/admin/travel/${encodeURIComponent(circuitId)}/routes/${encodeURIComponent(routeId)}`;
  try {
    if(!/^[A-Za-z0-9_-]+$/.test(circuitId)||!/^[A-Za-z0-9_-]+$/.test(routeId))throw new Error('Некорректный маршрут');
    const result=await deleteAdminArchivedTravelRoute(circuitId,routeId,{confirmRouteId:String(formData.get('confirmRouteId')??''),expectedUpdatedAt:String(formData.get('expectedUpdatedAt')??'')});
    if (!result) throw new Error('Архивный маршрут не найден');
    revalidatePath(`/admin/travel/${circuitId}/routes`);revalidatePath(destination);
    redirect(`/admin/travel/${encodeURIComponent(circuitId)}/routes?lifecycle=archived&deleted=1${result.publicDataSynced?'':'&syncError=1'}`);
  }catch(error){if(error&&typeof error==='object'&&'digest'in error)throw error;console.error('Не удалось удалить архивный маршрут',error);redirect(`${destination}?error=delete`);}
}

export async function saveTravelAccessAnchor(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const circuitId = String(formData.get('circuitId') ?? '').trim();
  const anchorId = String(formData.get('id') ?? '').trim();
  const destination = `/admin/travel/${encodeURIComponent(circuitId)}/access`;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(circuitId) || !/^[A-Za-z0-9_-]+$/.test(anchorId)) throw new Error('Некорректный ID точки доступа');
    await updateAdminTravelAccessAnchor(circuitId, anchorId, {
      poiId: String(formData.get('poiId') ?? '').trim(),
      accessKind: String(formData.get('accessKind') ?? ''),
      travelModes: formData.getAll('travelModes').map(String),
      eventScope: String(formData.get('eventScope') ?? ''),
      validFromYear: optionalText(formData, 'validFromYear'),
      validToYear: optionalText(formData, 'validToYear'),
      verificationStatus: String(formData.get('verificationStatus') ?? ''),
      confidence: Number(formData.get('confidence')),
      sourceUrl: optionalText(formData, 'sourceUrl'),
      evidenceNoteRu: optionalText(formData, 'evidenceNoteRu'),
    });
    revalidatePath(destination);
    revalidatePath(`/admin/travel/${circuitId}`);
    redirect(`${destination}?saved=${encodeURIComponent(anchorId)}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('Не удалось сохранить точку доступа', error);
    const editQuery = formData.get('editing') === 'yes' ? `&edit=${encodeURIComponent(anchorId)}` : '';
    redirect(`${destination}?error=save${editQuery}`);
  }
}

export async function previewGeneratedTravelRoutes(formData:FormData){
  if(!await getAdminSession())redirect('/admin/login');const circuitId=String(formData.get('circuitId')??'').trim();
  try{if(!/^[A-Za-z0-9_-]+$/.test(circuitId))throw new Error('Некорректный ID трассы');const orderedPoiIds=formData.getAll('orderedPoiId').map(String).map(value=>value.trim()).filter(Boolean);const preview=await createAdminTravelRouteGenerationPreview(circuitId,{orderedPoiIds,optimizeWaypointOrder:formData.get('optimizeWaypointOrder')==='yes'});if(!preview)throw new Error('Не удалось создать предпросмотр маршрутов');redirect(`/admin/travel/${encodeURIComponent(circuitId)}/routes/generate?preview=${encodeURIComponent(preview.token)}`);}
  catch(error){if(error&&typeof error==='object'&&'digest'in error)throw error;console.error('Не удалось предложить маршруты',error);redirect(`/admin/travel/${encodeURIComponent(circuitId)}/routes/generate?error=preview`);}
}

export async function applyGeneratedTravelRoutes(formData:FormData){
  if(!await getAdminSession())redirect('/admin/login');const circuitId=String(formData.get('circuitId')??'').trim(),token=String(formData.get('token')??'').trim();
  const routeIds=formData.getAll('routeId').map(String);
  if(!routeIds.length)redirect(`/admin/travel/${encodeURIComponent(circuitId)}/routes/generate?preview=${encodeURIComponent(token)}&error=selection`);
  try{const result=await applyAdminTravelRouteGenerationPreview(token,circuitId,routeIds);if(!result)throw new Error('Предпросмотр маршрутов не найден или устарел');if(result.circuitId!==circuitId)throw new Error('Предпросмотр относится к другой трассе');revalidatePath(`/admin/travel/${circuitId}/routes`);redirect(`/admin/travel/${encodeURIComponent(circuitId)}/routes?generated=${result.created}&skipped=${result.skipped}${result.publicDataSynced?'':'&syncError=1'}`);}
  catch(error){if(error&&typeof error==='object'&&'digest'in error)throw error;console.error('Не удалось сохранить предложенные маршруты',error);redirect(`/admin/travel/${encodeURIComponent(circuitId)}/routes/generate?preview=${encodeURIComponent(token)}&error=apply`);}
}

export async function previewTravelRouteTail(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const circuitId = String(formData.get('circuitId') ?? '').trim();
  const routeId = String(formData.get('routeId') ?? '').trim();
  const destination = `/admin/travel/${encodeURIComponent(circuitId)}/routes/${encodeURIComponent(routeId)}`;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(circuitId) || !/^[A-Za-z0-9_-]+$/.test(routeId)) throw new Error('Некорректный маршрут');
    const preview = await createAdminTravelRouteTailPreview(circuitId, routeId);
    if (!preview) throw new Error('Маршрут или точка доступа не найдены');
    redirect(`${destination}?tailPreview=${encodeURIComponent(preview.token)}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('Не удалось рассчитать новый хвост маршрута', error);
    redirect(`${destination}?error=tail-preview`);
  }
}

export async function applyTravelRouteTailPreview(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const circuitId = String(formData.get('circuitId') ?? '').trim();
  const routeId = String(formData.get('routeId') ?? '').trim();
  const token = String(formData.get('token') ?? '').trim();
  const destination = `/admin/travel/${encodeURIComponent(circuitId)}/routes/${encodeURIComponent(routeId)}`;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(circuitId) || !/^[A-Za-z0-9_-]+$/.test(routeId) || !/^[A-Za-z0-9-]+$/.test(token)) throw new Error('Некорректный предпросмотр');
    const result = await applyAdminTravelRouteTailPreview(token,circuitId,routeId);
    if (!result || result.circuitId !== circuitId || result.routeId !== routeId) throw new Error('Предпросмотр не относится к выбранному маршруту');
    revalidatePath(destination); revalidatePath(`/admin/travel/${circuitId}/routes`);
    redirect(`${destination}?saved=tail${result.publicDataSynced ? '' : '&syncError=1'}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('Не удалось применить новый хвост маршрута', error);
    redirect(`${destination}?error=tail-apply`);
  }
}

export async function saveMapUiSettings(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  try { await updateAdminMapUiSettings(formData.get('detailedAttribution') === 'yes'); }
  catch (error) { console.error('Не удалось обновить подписи карт', error); redirect('/admin/overview?error=map-settings'); }
  revalidatePath('/', 'layout');
  redirect('/admin/overview?mapSettingsSaved=1');
}

export async function saveTravelCategoryIcon(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const id = String(formData.get('id') ?? '').trim();
  const icon = String(formData.get('icon') ?? '').trim();
  if (!/^[a-z][a-z0-9_-]+$/.test(id)) redirect('/admin/travel?error=category');
  try { await updateAdminTravelCategoryIcon(id, icon); }
  catch (error) { console.error('Не удалось обновить значок', error); redirect('/admin/travel?error=category'); }
  revalidatePath('/admin/travel');
  redirect(`/admin/travel?categorySaved=${encodeURIComponent(id)}`);
}

export async function uploadTravelCategoryIcon(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const id = String(formData.get('id') ?? '').trim();
  const file = formData.get('iconFile');
  if (!/^[a-z][a-z0-9_-]+$/.test(id) || !(file instanceof File) || !file.size) redirect('/admin/travel?error=category-file');
  if (file.size > 2 * 1024 * 1024 || !['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    redirect('/admin/travel?error=category-file');
  }
  try { await uploadAdminTravelCategoryIcon(id, file.name, file.type, await file.arrayBuffer()); }
  catch (error) { console.error('Не удалось загрузить файл значка', error); redirect('/admin/travel?error=category-file'); }
  revalidatePath('/admin/travel');
  redirect(`/admin/travel?categorySaved=${encodeURIComponent(id)}`);
}

function historyEraDestination(slug: string) {
  return `/admin/history/${encodeURIComponent(slug)}`;
}

function historyEraBlockContentInput(formData: FormData): AdminHistoryEraBlockContentInput {
  const blockType = String(formData.get('blockType') ?? '') as AdminHistoryEraBlockInput['blockType'];
  const mediaPosition = String(formData.get('mediaPosition') ?? '') as AdminHistoryEraBlockInput['mediaPosition'];
  const editorialStatus = String(formData.get('editorialStatus') ?? '') as AdminHistoryEraBlockInput['editorialStatus'];
  if (!['text', 'media', 'quote', 'timeline', 'entities'].includes(blockType)) throw new Error('Некорректный тип блока');
  if (!['left', 'right', 'wide'].includes(mediaPosition)) throw new Error('Некорректное положение материала');
  if (!['draft', 'review', 'published'].includes(editorialStatus)) throw new Error('Некорректный статус блока');
  return {
    blockType, mediaPosition, editorialStatus,
    eyebrowRu: optionalText(formData, 'eyebrowRu'),
    titleRu: optionalText(formData, 'titleRu'),
    bodyRu: optionalText(formData, 'bodyRu'),
    mediaAssetId: optionalText(formData, 'mediaAssetId'),
    sourceUrl: optionalText(formData, 'sourceUrl'),
  };
}

function historyEraBlockInput(formData: FormData): AdminHistoryEraBlockInput {
  const sortOrder = Number(formData.get('sortOrder'));
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) throw new Error('Некорректный порядок блока');
  return { sortOrder, ...historyEraBlockContentInput(formData) };
}

export async function saveHistoryEra(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const slug = String(formData.get('slug') ?? '').trim();
  const destination = historyEraDestination(slug);
  try {
    if (!/^(?:\d{4}-\d{4}|\d{4}-present)$/.test(slug)) throw new Error('Некорректный идентификатор эпохи');
    const editorialStatus = String(formData.get('editorialStatus') ?? '') as AdminHistoryEraInput['editorialStatus'];
    if (!['draft', 'review', 'published'].includes(editorialStatus)) throw new Error('Некорректный статус эпохи');
    const input: AdminHistoryEraInput = {
      yearsLabel: String(formData.get('yearsLabel') ?? '').trim(),
      titleRu: String(formData.get('titleRu') ?? '').trim(),
      summaryRu: String(formData.get('summaryRu') ?? '').trim(),
      editorialStatus,
      heroMediaAssetId: optionalText(formData, 'heroMediaAssetId'),
    };
    if (!input.yearsLabel || !input.titleRu || !input.summaryRu) throw new Error('Заполните подпись периода, заголовок и аннотацию');
    const result = await updateAdminHistoryEra(slug, input);
    if (!result) throw new Error('Эпоха не найдена');
    revalidatePath('/admin/history'); revalidatePath(destination); revalidatePath('/history'); revalidatePath(`/history/${slug}`);
    redirect(`${destination}?saved=era${result.publicDataSynced ? '' : '&syncError=1'}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('Не удалось сохранить эпоху', error);
    redirect(`${destination}?error=era`);
  }
}

export async function saveHistoryEraBlock(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const eraSlug = String(formData.get('eraSlug') ?? '').trim();
  const destination = historyEraDestination(eraSlug);
  try {
    if (!/^(?:\d{4}-\d{4}|\d{4}-present)$/.test(eraSlug)) throw new Error('Некорректный идентификатор эпохи');
    const blockIdValue = optionalText(formData, 'blockId');
    const blockId = blockIdValue === null ? null : Number(blockIdValue);
    if (blockId !== null && (!Number.isInteger(blockId) || blockId <= 0)) throw new Error('Некорректный блок');
    const result = blockId === null
      ? await createAdminHistoryEraBlock(eraSlug, historyEraBlockInput(formData))
      : await updateAdminHistoryEraBlock(eraSlug, blockId, historyEraBlockContentInput(formData));
    if (!result) throw new Error('Блок эпохи не найден');
    revalidatePath('/admin/history'); revalidatePath(destination); revalidatePath('/history'); revalidatePath(`/history/${eraSlug}`);
    redirect(`${destination}?saved=block${result.publicDataSynced ? '' : '&syncError=1'}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('Не удалось сохранить блок эпохи', error);
    redirect(`${destination}?error=block`);
  }
}

export async function removeHistoryEraBlock(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const eraSlug = String(formData.get('eraSlug') ?? '').trim();
  const destination = historyEraDestination(eraSlug);
  try {
    const blockId = Number(formData.get('blockId'));
    if (!/^(?:\d{4}-\d{4}|\d{4}-present)$/.test(eraSlug) || !Number.isInteger(blockId) || blockId <= 0) throw new Error('Некорректный блок');
    const result = await deleteAdminHistoryEraBlock(eraSlug, blockId);
    if (!result) throw new Error('Блок эпохи не найден');
    revalidatePath('/admin/history'); revalidatePath(destination); revalidatePath('/history'); revalidatePath(`/history/${eraSlug}`);
    redirect(`${destination}?deleted=1${result.publicDataSynced ? '' : '&syncError=1'}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('Не удалось удалить блок эпохи', error);
    redirect(`${destination}?error=delete`);
  }
}

export async function reorderHistoryEraBlocks(formData: FormData) {
  if (!await getAdminSession()) redirect('/admin/login');
  const eraSlug = String(formData.get('eraSlug') ?? '').trim();
  const destination = historyEraDestination(eraSlug);
  try {
    if (!/^(?:\d{4}-\d{4}|\d{4}-present)$/.test(eraSlug)) throw new Error('Некорректный идентификатор эпохи');
    const orderedIds = JSON.parse(String(formData.get('orderedIds') ?? '[]')) as unknown;
    const expectedOrderedIds = JSON.parse(String(formData.get('expectedOrderedIds') ?? '[]')) as unknown;
    if (!Array.isArray(orderedIds)
      || orderedIds.some((id) => !Number.isSafeInteger(id) || Number(id) <= 0)
      || new Set(orderedIds).size !== orderedIds.length
      || !Array.isArray(expectedOrderedIds)
      || expectedOrderedIds.some((id) => !Number.isSafeInteger(id) || Number(id) <= 0)
      || new Set(expectedOrderedIds).size !== expectedOrderedIds.length) {
      throw new Error('Некорректный порядок блоков эпохи');
    }
    const result = await updateAdminHistoryEraBlockOrder(eraSlug, orderedIds as number[], expectedOrderedIds as number[]);
    if (!result) throw new Error('Эпоха не найдена');
    revalidatePath('/admin/history'); revalidatePath(destination); revalidatePath('/history'); revalidatePath(`/history/${eraSlug}`);
    redirect(`${destination}?saved=order${result.publicDataSynced ? '' : '&syncError=1'}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('Не удалось изменить порядок блоков эпохи', error);
    redirect(`${destination}?error=order`);
  }
}
