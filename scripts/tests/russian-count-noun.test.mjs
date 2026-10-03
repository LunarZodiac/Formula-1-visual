import assert from 'node:assert/strict';
import test from 'node:test';
import { russianCountNoun } from '../../apps/web/app/data/russian-count-noun.ts';

test('Russian result counts use singular, few and many forms', () => {
  const forms = ['победа', 'победы', 'побед'];
  for (const value of [1, 21, 101]) assert.equal(russianCountNoun(value, forms), 'победа');
  for (const value of [2, 4, 22, 104]) assert.equal(russianCountNoun(value, forms), 'победы');
  for (const value of [0, 5, 11, 12, 14, 25, 111]) assert.equal(russianCountNoun(value, forms), 'побед');
});

test('fractional and negative points retain correct noun forms', () => {
  const forms = ['очко', 'очка', 'очков'];
  assert.equal(russianCountNoun(0.5, forms), 'очка');
  assert.equal(russianCountNoun(1.5, forms), 'очка');
  assert.equal(russianCountNoun(-1, forms), 'очко');
  assert.equal(russianCountNoun(-12, forms), 'очков');
});
