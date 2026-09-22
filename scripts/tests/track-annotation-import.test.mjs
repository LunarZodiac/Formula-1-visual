import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTrackAnnotationPackage as validateFeatureCollection } from '../import-track-annotations.mjs';

const base = { type: 'FeatureCollection', circuitId: 'spa', layoutId: 'spa-2024', sourceUrl: 'https://example.com/data', sourceName: 'Example', features: [{ type: 'Feature', properties: { id: 'turn-1', annotationType: 'turn', labelRu: '1' }, geometry: { type: 'Point', coordinates: [5.97, 50.44] } }] };
test('validates a collection', () => assert.equal(validateFeatureCollection(base).features.length, 1));
test('rejects missing collection metadata', () => assert.throws(() => validateFeatureCollection({ ...base, sourceUrl: '' }), /sourceUrl/));
test('rejects wrong geometry for type', () => assert.throws(() => validateFeatureCollection({ ...base, features: [{ ...base.features[0], geometry: { type: 'LineString', coordinates: [[1, 2], [2, 3]] } }] }), /Point/));
test('rejects duplicate IDs and invalid years', () => assert.throws(() => validateFeatureCollection({ ...base, features: [{ ...base.features[0], properties: { ...base.features[0].properties, validFromYear: 2025 } }, { ...base.features[0], properties: { ...base.features[0].properties, validToYear: 2024 } }] }), /Дублирующийся ID/));
test('rejects reversed years', () => assert.throws(() => validateFeatureCollection({ ...base, features: [{ ...base.features[0], properties: { ...base.features[0].properties, validFromYear: 2025, validToYear: 2024 } }] }), /validToYear/));
test('rejects unsafe identifiers', () => assert.throws(() => validateFeatureCollection({ ...base, layoutId: '../spa' }), /недопустимые символы/));
test('rejects credentials in source URL', () => assert.throws(() => validateFeatureCollection({ ...base, sourceUrl: 'https://user:pass@example.com/data' }), /credentials/));
