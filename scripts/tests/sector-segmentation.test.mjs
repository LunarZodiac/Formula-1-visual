import assert from 'node:assert/strict';
import test from 'node:test';
import { previewFirstTrackSector, segmentTrackIntoSectors } from '../../apps/web/app/admin/circuits/[id]/layouts/[layoutId]/annotations/sector-segmentation.ts';

const closedCenterline = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];

test('first sector is visible immediately after choosing its two snapped ends', () => {
  const preview = previewFirstTrackSector(closedCenterline, [0, 0], [0.5, 0.1]);
  const sectors = segmentTrackIntoSectors(closedCenterline, [0, 0], [0.5, 0.1], [1.1, 0.5]);
  assert.deepEqual(preview, sectors[0]);
});

test('two snapped boundaries produce three contiguous sectors covering the full closed axis', () => {
  const sectors = segmentTrackIntoSectors(closedCenterline, [0, 0], [0.5, 0.1], [1.1, 0.5]);
  assert.equal(sectors.length, 3);
  assert.deepEqual(sectors[0][0], [0, 0]);
  assert.deepEqual(sectors[0].at(-1), sectors[1][0]);
  assert.deepEqual(sectors[1].at(-1), sectors[2][0]);
  assert.deepEqual(sectors[2].at(-1), [0, 0]);
  assert.deepEqual(sectors[0].at(-1), [0.5, 0]);
  assert.deepEqual(sectors[1].at(-1), [1, 0.5]);
});

test('rejects boundaries out of centerline order', () => {
  assert.throws(() => segmentTrackIntoSectors(closedCenterline, [0, 0], [1, 0.5], [0.5, 0]), /по направлению оси/);
});

test('rejects an open or degenerate centerline', () => {
  assert.throws(() => segmentTrackIntoSectors(closedCenterline.slice(0, -1), [0, 0], [0.5, 0], [1, 0.5]), /замкнута/);
  assert.throws(() => segmentTrackIntoSectors([[0, 0], [0, 0], [0, 0], [0, 0]], [0, 0], [0, 0], [0, 0]), /не содержит отрезков/);
});

test('uses a manually marked start/finish instead of the arbitrary first coordinate', () => {
  const sectors = segmentTrackIntoSectors(closedCenterline, [0.5, 0], [1, 0.5], [0, 1]);
  assert.deepEqual(sectors[0][0], [0.5, 0]);
  assert.deepEqual(sectors[2].at(-1), [0.5, 0]);
  assert.deepEqual(sectors[0].at(-1), sectors[1][0]);
  assert.deepEqual(sectors[1].at(-1), sectors[2][0]);
});
