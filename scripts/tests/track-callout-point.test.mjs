import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTrackCalloutPoint } from '../lib/track-callout-point.mjs';

test('turn and straight callouts accept a bounded free label point', () => {
  assert.deepEqual(normalizeTrackCalloutPoint('[5.97,50.43]', 'turn'), [5.97, 50.43]);
  assert.deepEqual(normalizeTrackCalloutPoint([5.98, 50.44], 'straight'), [5.98, 50.44]);
  assert.equal(normalizeTrackCalloutPoint('', 'turn'), null);
});

test('invalid or unrelated callouts cannot be saved', () => {
  assert.throws(() => normalizeTrackCalloutPoint('[5.97,50.43]', 'drs_zone'), /только для поворота или прямой/);
  assert.throws(() => normalizeTrackCalloutPoint('[181,50.43]', 'turn'), /Некорректная координата/);
  assert.throws(() => normalizeTrackCalloutPoint('not json', 'turn'), /Некорректная координата/);
});
