import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { acceptedSpaCulturalRecords, validateSpaCulturalReview } from '../lib/spa-travel-cultural-review.mjs';

const reviewPath = path.resolve(import.meta.dirname, '..', '..', 'data', 'review', 'spa-travel-cultural-review.json');
const review = JSON.parse(await readFile(reviewPath, 'utf8'));

test('проверка Спа содержит только доказательные редакционные решения', () => {
  const validated = validateSpaCulturalReview(review);
  assert.equal(validated.records.length, 4);
  assert.equal(acceptedSpaCulturalRecords(validated).length, 3);
});

test('редакционная проверка не подменяет географию и режим доступа', () => {
  for (const record of review.records) {
    assert.equal('latitude' in record, false);
    assert.equal('longitude' in record, false);
    assert.equal('openingHours' in record, false);
    assert.equal('wheelchairAccess' in record, false);
    assert.equal('isFeatured' in record, false);
  }
});
