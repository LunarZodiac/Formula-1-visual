import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRaces, resultGeography, isFinalStanding, teamHistoryForSeason } from '../lib/competitor-statistics.mjs';

const fact = (overrides = {}) => ({session_id:'2026-1-race', driver_id:'a', season_year:2026, round:1, position_order:1, points:25, circuit_id:'spa', country_code:'be', circuit_name:'Спа', longitude:5.9, latitude:50.4, slug:'spa', editorial_status:'published', constructor_id:'team', team_name:'Team', ...overrides});

test('empty coverage is unknown rather than invented years', () => {
  assert.deepEqual(summarizeRaces([]), {raceEntries:0,wins:0,podiums:0,points:0,circuits:0,countries:0,winningCircuits:0,firstSeason:null,lastSeason:null,throughRound:null});
});
test('two cars are one team GP appearance but two podium positions', () => {
  const stats=summarizeRaces([fact(),fact({driver_id:'b',position_order:2,points:18})]);
  assert.equal(stats.raceEntries,1); assert.equal(stats.podiums,2); assert.equal(stats.wins,1); assert.equal(stats.points,43);
});
test('shared historical classified position counts once for a team', () => {
  const stats=summarizeRaces([fact({points:4}),fact({driver_id:'b',points:4})]);
  assert.equal(stats.wins,1); assert.equal(stats.podiums,1); assert.equal(stats.points,8);
});
test('geography is not capped at eight and preserves locations', () => {
  const rows=Array.from({length:11},(_,i)=>fact({session_id:`race-${i}`,circuit_id:`circuit-${i}`}));
  assert.equal(summarizeRaces(rows).winningCircuits,11); assert.equal(resultGeography(rows).length,11);
  assert.deepEqual(resultGeography(rows)[0].coordinates,[5.9,50.4]);
});
test('season coverage does not borrow prior seasons or round maxima', () => {
  const rows=[fact({season_year:2025,round:24}),fact({round:3,session_id:'2026-3'})];
  const stats=summarizeRaces(rows); assert.equal(stats.firstSeason,2025); assert.equal(stats.throughRound,3);
  assert.equal(summarizeRaces(rows.filter(r=>r.season_year===2026)).raceEntries,1);
});
test('only completed and complete standings can award titles', () => {
  assert.equal(isFinalStanding('active',24,24),false);
  assert.equal(isFinalStanding('completed',20,24),false);
  assert.equal(isFinalStanding('completed',0,0),false);
  assert.equal(isFinalStanding('completed',24,24),true);
});
test('mid-season transfers retain both teams and team-specific race points', () => {
  const rows=[fact(),fact({session_id:'2026-2',constructor_id:'other',team_name:'Other',points:10}),fact({season_year:2025})];
  const teams=teamHistoryForSeason(rows,2026); assert.equal(teams.length,2);
  assert.equal(teams.find(t=>t.id==='other').points,10); assert.equal(teams.find(t=>t.id==='team').raceEntries,1);
});
test('race points preserve fractional historical awards',()=>assert.equal(summarizeRaces([fact({points:4.5}),fact({driver_id:'b',points:4.5})]).points,9));
