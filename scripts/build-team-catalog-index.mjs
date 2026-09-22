#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const outputDirectory = path.resolve(import.meta.dirname, '..', 'apps', 'web', 'app', 'data', 'catalogs');
const localizationPath = path.resolve(import.meta.dirname, '..', 'data', 'editorial', 'team-localizations.json');
const preview = process.argv.includes('--preview');
const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Не заданы параметры базы: ${missing.join(', ')}`);

const localizationRegistry = JSON.parse(await readFile(localizationPath, 'utf8'));
const localizations = Array.isArray(localizationRegistry.localizations) ? localizationRegistry.localizations : [];
const duplicateLocalizationIds = localizations.map((item) => item.id)
  .filter((id, index, ids) => ids.indexOf(id) !== index);
if (duplicateLocalizationIds.length) {
  throw new Error(`Повторяющиеся локализации команд: ${[...new Set(duplicateLocalizationIds)].join(', ')}`);
}
const invalidLocalizations = localizations.filter((item) => !item.id || !item.officialName || !item.nameRu
  || !item.sourceUrl || !item.sourceTitle || !/^\d{4}-\d{2}-\d{2}$/.test(item.accessedAt)
  || !['high', 'medium', 'low'].includes(item.confidence));
if (invalidLocalizations.length) {
  throw new Error(`Некорректные локализации команд: ${invalidLocalizations.map((item) => item.id || '?').join(', ')}`);
}
const localizationById = new Map(localizations.map((item) => [item.id, item]));

const client = new pg.Client({ application_name: 'f1-geovisual-atlas-all-team-index' });
await client.connect();
try {
  const factsResult = await client.query(`SELECT constructor.id, constructor.name, constructor.nationality,
      min(race.season_year)::integer AS first_season, max(race.season_year)::integer AS latest_season,
      count(DISTINCT race.season_year)::integer AS season_count,
      count(DISTINCT result.session_id)::integer AS race_entries,
      count(*) FILTER (WHERE result.position_order=1)::integer AS wins,
      count(*) FILTER (WHERE result.position_order<=3)::integer AS podiums,
      coalesce(sum(result.points),0) AS points
      FROM atlas.constructors constructor
      JOIN atlas.constructor_entries entry ON entry.constructor_id=constructor.id
      JOIN atlas.session_results result ON result.constructor_entry_id=entry.id
      JOIN atlas.sessions session ON session.id=result.session_id AND session.session_type='race'
      JOIN atlas.races race ON race.id=session.race_id
      GROUP BY constructor.id ORDER BY latest_season DESC,constructor.name`);
  const entriesResult = await client.query(`SELECT entry.constructor_id,entry.season_year::integer AS season,entry.display_name AS name,
      entry.team_colour AS color,entry.logo_image_url AS logo_url,entry.car_image_url AS car_image_url
      FROM atlas.constructor_entries entry WHERE EXISTS(
        SELECT 1 FROM atlas.session_results result WHERE result.constructor_entry_id=entry.id)
      ORDER BY entry.constructor_id,entry.season_year`);
  const standingsResult = await client.query(`WITH final_rounds AS(
        SELECT season_year,max(after_round) AS after_round FROM atlas.constructor_standings GROUP BY season_year)
      SELECT entry.constructor_id,standing.season_year::integer AS season,standing.position::integer,
        standing.points,standing.wins::integer,(season.status='completed') AS is_final
      FROM atlas.constructor_standings standing JOIN final_rounds USING(season_year,after_round)
      JOIN atlas.constructor_entries entry ON entry.id=standing.constructor_entry_id
      JOIN atlas.seasons season ON season.year=standing.season_year
      ORDER BY entry.constructor_id,standing.season_year`);
  const lineagesResult = await client.query(`SELECT link.predecessor_constructor_id,link.successor_constructor_id,
      predecessor.name AS predecessor_name,successor.name AS successor_name,link.relationship_type,
      link.valid_from_year,link.valid_to_year,link.description_ru,source.url AS source_url
      FROM atlas.constructor_lineage_links AS link
      JOIN atlas.constructors AS predecessor ON predecessor.id=link.predecessor_constructor_id
      JOIN atlas.constructors AS successor ON successor.id=link.successor_constructor_id
      JOIN atlas.data_sources AS source ON source.id=link.source_id
      WHERE link.review_status='published'
      ORDER BY coalesce(link.valid_from_year,9999),link.id`);
  const entriesByTeam = Map.groupBy(entriesResult.rows, (row) => row.constructor_id);
  const standingsByKey = new Map(standingsResult.rows.map((row) => [`${row.constructor_id}:${row.season}`, row]));
  const lineagesByTeam = new Map();
  for (const link of lineagesResult.rows) {
    const shared = { relationshipType:link.relationship_type,validFromYear:link.valid_from_year===null?null:Number(link.valid_from_year),
      validToYear:link.valid_to_year===null?null:Number(link.valid_to_year),descriptionRu:link.description_ru,sourceUrl:link.source_url };
    const predecessorLinks=lineagesByTeam.get(link.predecessor_constructor_id)??[];
    predecessorLinks.push({ direction:'successor',teamId:link.successor_constructor_id,teamName:link.successor_name,...shared });
    lineagesByTeam.set(link.predecessor_constructor_id,predecessorLinks);
    const successorLinks=lineagesByTeam.get(link.successor_constructor_id)??[];
    successorLinks.push({ direction:'predecessor',teamId:link.predecessor_constructor_id,teamName:link.predecessor_name,...shared });
    lineagesByTeam.set(link.successor_constructor_id,successorLinks);
  }
  const teams = factsResult.rows.map((row) => {
    const entries = entriesByTeam.get(row.id) ?? [];
    const latestEntry = entries.at(-1);
    const seasons = entries.map((entry) => {
      const standing = standingsByKey.get(`${row.id}:${entry.season}`);
      return { season:Number(entry.season),name:entry.name,position:standing?.position??null,
        points:Number(standing?.points??0),wins:Number(standing?.wins??0),isFinal:Boolean(standing?.is_final) };
    });
    const localization = localizationById.get(row.id);
    const officialName = latestEntry?.name ?? row.name;
    if (localization && ![row.name, ...entries.map((entry) => entry.name)].includes(localization.officialName)) {
      throw new Error(`Локализация ${row.id} относится к неизвестному официальному названию ${localization.officialName}`);
    }
    return { id:row.id,name:officialName,...(localization ? { nameRu:localization.nameRu } : {}),nationality:row.nationality,
      firstSeason:Number(row.first_season),latestSeason:Number(row.latest_season),seasonCount:Number(row.season_count),
      aliases:[...new Set([row.name,...entries.map((entry)=>entry.name)].filter(Boolean))].sort((a,b)=>a.localeCompare(b)),
      careerTitles:seasons.filter((season)=>season.isFinal&&season.position===1).length,
      raceEntries:Number(row.race_entries),wins:Number(row.wins),podiums:Number(row.podiums),points:Number(row.points),
      color:latestEntry?.color??null,logoUrl:latestEntry?.logo_url??null,carImageUrl:latestEntry?.car_image_url??null,
      lineages:lineagesByTeam.get(row.id)??[],seasons };
  });
  const unknownLocalizationIds = localizations.map((item) => item.id)
    .filter((id) => !teams.some((team) => team.id === id));
  if (unknownLocalizationIds.length) {
    throw new Error(`Локализации без команды в каталоге: ${unknownLocalizationIds.join(', ')}`);
  }
  const index = { schemaVersion:1,generatedAt:new Date().toISOString(),teams };
  if (!preview) {
    await mkdir(outputDirectory,{recursive:true});
    const outputPath=path.join(outputDirectory,'teams-all.json'),temporaryPath=`${outputPath}.tmp-${process.pid}`;
    await writeFile(temporaryPath,`${JSON.stringify(index,null,2)}\n`,'utf8');await rename(temporaryPath,outputPath);
  }
  console.log(JSON.stringify({ mode: preview ? 'preview' : 'write', teamCount: teams.length,
    firstSeason:Math.min(...teams.map((team)=>team.firstSeason)),latestSeason:Math.max(...teams.map((team)=>team.latestSeason)),
    localizedTeamCount:teams.filter((team)=>team.nameRu).length,
    localizedTeams:teams.filter((team)=>team.nameRu).map((team)=>({id:team.id,name:team.name,nameRu:team.nameRu})) },null,2));
} finally {
  await client.end();
}
