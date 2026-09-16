import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const catalogDirectory = path.join(projectRoot, 'apps', 'web', 'app', 'data', 'catalogs');

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await rename(temporaryPath, filePath);
      return;
    } catch (error) {
      const canRetry = error?.code === 'EPERM' || error?.code === 'EBUSY';
      if (!canRetry || attempt === 10) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 50));
    }
  }
}

function applyEntry(team, entry) {
  if (!team || team.id !== entry.constructorId) return false;
  team.name = entry.displayName;
  team.engineName = entry.engineName;
  team.color = entry.teamColour;
  team.carModel = entry.carModel;
  team.carImageUrl = entry.carImageUrl;
  team.logoUrl = entry.logoImageUrl;
  const history = team.seasonHistory?.find((item) => item.season === entry.season);
  if (history) history.name = entry.displayName;
  return true;
}

export async function syncConstructorPublicData(client, constructorId, season) {
  const result = await client.query(`
    SELECT season_year, constructor_id, display_name, engine_name, team_colour,
           car_model, car_image_url, logo_image_url
    FROM atlas.constructor_entries
    WHERE season_year = $1 AND constructor_id = $2
  `, [season, constructorId]);
  if (!result.rows[0]) throw new Error(`Команда ${constructorId} не найдена в сезоне ${season}`);
  const row = result.rows[0];
  const entry = {
    season: Number(row.season_year), constructorId: String(row.constructor_id),
    displayName: String(row.display_name), engineName: row.engine_name ?? null,
    teamColour: row.team_colour?.trim() ?? null, carModel: row.car_model ?? null,
    carImageUrl: row.car_image_url ?? null, logoImageUrl: row.logo_image_url ?? null,
  };
  const seasonFile = path.join(catalogDirectory, `teams-${season}.json`);
  const document = JSON.parse(await readFile(seasonFile, 'utf8'));
  const team = document.teams?.find((item) => item.id === constructorId);
  if (!applyEntry(team, entry)) throw new Error(`Команда ${constructorId} не найдена в каталоге сезона ${season}`);
  document.generatedAt = new Date().toISOString();
  await writeJsonAtomic(seasonFile, document);

  const driverFile = path.join(catalogDirectory, `drivers-${season}.json`);
  const driverDocument = JSON.parse(await readFile(driverFile, 'utf8'));
  for (const driver of driverDocument.drivers ?? []) {
    if (driver.team?.id !== constructorId) continue;
    driver.team.name = entry.displayName;
    driver.team.color = entry.teamColour;
    driver.team.logoUrl = entry.logoImageUrl;
  }
  driverDocument.generatedAt = new Date().toISOString();
  await writeJsonAtomic(driverFile, driverDocument);

  const allTeamsFile = path.join(catalogDirectory, 'teams-all.json');
  const allTeamsDocument = JSON.parse(await readFile(allTeamsFile, 'utf8'));
  const indexedTeam = allTeamsDocument.teams?.find((item) => item.id === constructorId);
  if (indexedTeam) {
    if (season >= indexedTeam.latestSeason) {
      indexedTeam.name = entry.displayName;
      indexedTeam.color = entry.teamColour;
      indexedTeam.logoUrl = entry.logoImageUrl;
      indexedTeam.carImageUrl = entry.carImageUrl;
    }
    indexedTeam.aliases = [...new Set([...(indexedTeam.aliases ?? []), entry.displayName])].sort((a, b) => a.localeCompare(b));
    const indexedSeason = indexedTeam.seasons?.find((item) => item.season === season);
    if (indexedSeason) indexedSeason.name = entry.displayName;
    allTeamsDocument.generatedAt = new Date().toISOString();
    await writeJsonAtomic(allTeamsFile, allTeamsDocument);
  }

  if (season === 2024) {
    const legacyFile = path.join(catalogDirectory, 'teams.json');
    const legacy = JSON.parse(await readFile(legacyFile, 'utf8'));
    const legacyTeam = Array.isArray(legacy) ? legacy.find((item) => item.id === constructorId) : null;
    if (legacyTeam) {
      legacyTeam.name = entry.displayName;
      legacyTeam.officialName2024 = entry.displayName;
      legacyTeam.color2024 = entry.teamColour;
      legacyTeam.carImage2024 = entry.carImageUrl;
      await writeJsonAtomic(legacyFile, legacy);
    }
  }
  return { updatedFiles: (season === 2024 ? 3 : 2) + (indexedTeam ? 1 : 0), entry };
}

export async function syncConstructorCarPublicData(client, constructorId, season) {
  return syncConstructorPublicData(client, constructorId, season);
}
