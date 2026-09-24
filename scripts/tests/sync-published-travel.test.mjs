import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePublicationArgs, publicationSummary } from '../lib/travel-publication-plan.mjs';

test('синхронизация по умолчанию только показывает план для всех трасс', () => {
  assert.deepEqual(parsePublicationArgs([]), { circuitId: null, apply: false });
  assert.deepEqual(parsePublicationArgs(['--all']), { circuitId: null, apply: false });
  assert.deepEqual(parsePublicationArgs(['--circuit=spa']), { circuitId: 'spa', apply: false });
  assert.deepEqual(parsePublicationArgs(['--apply', '--circuit=spa']), { circuitId: 'spa', apply: true });
  assert.deepEqual(parsePublicationArgs(['--apply', '--all']), { circuitId: null, apply: true });
});

test('опасные и неоднозначные параметры отклоняются', () => {
  for (const args of [
    ['--circuit='], ['--circuit=../spa'], ['--circuit=spa', '--all'],
    ['--circuit=spa', '--circuit=monaco'], ['--apply', '--apply'], ['--apply'], ['--unknown'],
  ]) assert.throws(() => parsePublicationArgs(args), undefined, args.join(' '));
});

test('счётчики PostgreSQL преобразуются без потери структуры плана', () => {
  assert.deepEqual(publicationSummary({
    poi: '3', zones: '2', routes: '1', skipped_poi: '4', skipped_zones: '5', skipped_routes: '6',
  }), {
    counts: { poi: 3, zones: 2, routes: 1 },
    skippedNonpublished: { poi: 4, zones: 5, routes: 6 },
  });
});
