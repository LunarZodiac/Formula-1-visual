import assert from 'node:assert/strict';
import test from 'node:test';
import { serializePublicTrackAnnotation } from '../lib/public-track-annotation.mjs';

const row = {
  id: 'turn-1', annotation_type: 'turn', sequence: '1',
  valid_from_year: '2007', geometry: { type: 'Point', coordinates: [5.97, 50.43] },
  source_name: 'Редакционная разметка', source_url: 'https://example.org/source',
};

test('exports the exact saved label position without moving track geometry', () => {
  const result = serializePublicTrackAnnotation({ ...row, callout_point: [5.971, 50.432], properties: { private: true } });
  assert.deepEqual(result.calloutPoint, [5.971, 50.432]);
  assert.deepEqual(result.geometry, row.geometry);
  assert.equal(result.sequence, 1);
  assert.equal(result.validFromYear, 2007);
  assert.deepEqual(result.source, { name: row.source_name, url: row.source_url });
  assert.equal('properties' in result, false);
});

test('legacy annotations without saved positions omit the optional field', () => {
  assert.equal('calloutPoint' in serializePublicTrackAnnotation(row), false);
});

test('rejects invalid coordinates rather than publishing a broken position', () => {
  assert.throws(() => serializePublicTrackAnnotation({ ...row, callout_point: [200, 50] }));
});

test('does not allow label positions on sector geometry', () => {
  assert.throws(() => serializePublicTrackAnnotation({ ...row, annotation_type: 'sector', callout_point: [5, 50] }));
});
