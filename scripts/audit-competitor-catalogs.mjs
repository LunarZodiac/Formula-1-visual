import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {assertCompetitorCatalog} from '../apps/web/app/data/competitor-contract.ts';

const client=new pg.Client({application_name:'atlas-competitor-audit'});
const repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalogDirectory=path.join(repositoryRoot,'apps','web','app','data','catalogs');
const reviewDirectory=path.join(repositoryRoot,'data','review');
await client.connect();
try {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const {rows:[{season}]}=await client.query('SELECT max(season_year)::integer AS season FROM atlas.driver_standings WHERE season_year IN (SELECT season_year FROM atlas.constructor_standings)');
  const drivers=JSON.parse(await readFile(path.join(catalogDirectory,`drivers-${season}.json`),'utf8'));
  const teams=JSON.parse(await readFile(path.join(catalogDirectory,`teams-${season}.json`),'utf8'));
  assertCompetitorCatalog(drivers,'drivers'); assertCompetitorCatalog(teams,'teams');
  const errors=[];
  for(const [kind,catalog] of [['drivers',drivers],['teams',teams]]) for(const item of catalog[kind]) {
    if(item.careerTitles!==item.seasonHistory.filter(r=>r.isFinal&&r.position===1).length) errors.push(`${kind}:${item.id}: title mismatch`);
    if(item.raceStatistics.winningCircuits!==item.resultGeography.filter(r=>r.wins>0).length) errors.push(`${kind}:${item.id}: geography mismatch`);
    if(item.raceStatistics.wins!==item.resultGeography.reduce((sum,r)=>sum+r.wins,0)) errors.push(`${kind}:${item.id}: wins mismatch`);
    if(kind==='teams' && item.driverCount!==item.drivers.length) errors.push(`teams:${item.id}: roster mismatch`);
    const sql=kind==='drivers'
      ? `SELECT count(DISTINCT s.id)::integer AS entries FROM atlas.session_results x JOIN atlas.sessions s ON s.id=x.session_id AND s.session_type='race' JOIN atlas.races r ON r.id=s.race_id WHERE x.driver_id=$1 AND r.season_year=$2`
      : `SELECT count(DISTINCT s.id)::integer AS entries FROM atlas.session_results x JOIN atlas.sessions s ON s.id=x.session_id AND s.session_type='race' JOIN atlas.races r ON r.id=s.race_id JOIN atlas.constructor_entries e ON e.id=x.constructor_entry_id WHERE e.constructor_id=$1 AND r.season_year=$2`;
    const {rows:[{entries}]}=await client.query(sql,[item.id,season]);
    if(entries!==item.seasonRaceStatistics.raceEntries) errors.push(`${kind}:${item.id}: database coverage mismatch`);
  }
  const coverage=await client.query(`SELECT r.season_year,count(DISTINCT r.id)::integer AS grand_prix_with_results,
      count(*)::integer AS driver_result_rows,count(*) FILTER(WHERE x.source_id IS NULL)::integer AS missing_result_sources
    FROM atlas.session_results x JOIN atlas.sessions s ON s.id=x.session_id AND s.session_type='race'
    JOIN atlas.races r ON r.id=s.race_id GROUP BY r.season_year ORDER BY r.season_year DESC`);
  const report={generatedAt:new Date().toISOString(),season,drivers:drivers.drivers.length,teams:teams.teams.length,errors,
    coverage:coverage.rows,
    referenceProfiles:{driver:drivers.drivers.find(d=>d.id==='max_verstappen'),team:teams.teams.find(t=>t.id==='mercedes')},
    warnings:['Показатели отражают импортированный набор, не независимую сверку всех результатов с официальными протоколами','raceEntries — наличие записи результата Гран-при, не подтверждённый старт','Очки из результатов гонок исключают спринты и не заменяют очки чемпионата','В ранних гонках общие места учитываются один раз на команду; результат пилота сохраняется отдельно']};
  await client.query('COMMIT');
  await mkdir(reviewDirectory,{recursive:true});
  await writeFile(path.join(reviewDirectory,'competitor-catalog-audit.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({season,drivers:report.drivers,teams:report.teams,errors,missingResultSources:coverage.rows.reduce((s,r)=>s+r.missing_result_sources,0)},null,2));
  if(errors.length) process.exitCode=1;
} finally {await client.end();}
