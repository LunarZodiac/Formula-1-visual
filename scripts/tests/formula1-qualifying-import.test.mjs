import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseQualifyingTable,
  parseRaceLinks,
} from '../formula1-qualifying-import.mjs';

test('parseRaceLinks keeps the official meeting order and removes duplicates', () => {
  const html = `
    <a href="/en/results/2002/races/720/australia/race-result">Australia</a>
    <a href="/en/results/2002/races/720/australia/race-result">Australia</a>
    <a href="/en/results/2002/races/721/malaysia/race-result">Malaysia</a>
  `;
  assert.deepEqual(parseRaceLinks(html, 2002), [
    { meetingId: 720, slug: 'australia' },
    { meetingId: 721, slug: 'malaysia' },
  ]);
});

test('parseQualifyingTable preserves classified and NC positions', () => {
  const html = `
    <table><tbody>
      <tr>
        <td>1</td><td>2</td>
        <td><span><span>Rubens</span>&nbsp;<span>Barrichello</span> <span>BAR</span></span></td>
        <td>Ferrari</td><td>1:25.843</td><td>9</td>
      </tr>
      <tr>
        <td>NC</td><td>10</td>
        <td><span><span>Takuma</span>&nbsp;<span>Sato</span> <span>SAT</span></span></td>
        <td>Jordan Honda</td><td>1:53.351</td><td>7</td>
      </tr>
    </tbody></table>
  `;
  assert.deepEqual(parseQualifyingTable(html), [
    {
      positionOrder: 1,
      positionText: '1',
      carNumber: 2,
      driverName: 'Rubens Barrichello',
      teamName: 'Ferrari',
      time: '1:25.843',
      laps: 9,
    },
    {
      positionOrder: 2,
      positionText: 'NC',
      carNumber: 10,
      driverName: 'Takuma Sato',
      teamName: 'Jordan Honda',
      time: '1:53.351',
      laps: 7,
    },
  ]);
});

