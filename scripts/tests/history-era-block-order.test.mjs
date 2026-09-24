import assert from 'node:assert/strict';
import test from 'node:test';

import { planHistoryEraBlockOrder } from '../lib/history-era-block-order.mjs';

test('plans a collision-free temporary phase before assigning the final order', () => {
  const existingRows = [
    { id: 11, sort_order: 0 },
    { id: 22, sort_order: 1 },
    { id: 33, sort_order: 2 },
  ];

  const plan = planHistoryEraBlockOrder(existingRows, {
    expectedOrderedIds: [11, 22, 33],
    orderedIds: [33, 11, 22],
  });

  assert.deepEqual(plan.temporaryAssignments, [
    { id: 33, sortOrder: 3 },
    { id: 11, sortOrder: 4 },
    { id: 22, sortOrder: 5 },
  ]);
  assert.deepEqual(plan.finalAssignments, [
    { id: 33, sortOrder: 0 },
    { id: 11, sortOrder: 1 },
    { id: 22, sortOrder: 2 },
  ]);

  const occupiedOrders = new Set(existingRows.map((row) => row.sort_order));
  assert.ok(plan.temporaryAssignments.every(({ sortOrder }) => !occupiedOrders.has(sortOrder)));
  assert.equal(new Set(plan.temporaryAssignments.map(({ sortOrder }) => sortOrder)).size, existingRows.length);
  assert.equal(new Set(plan.finalAssignments.map(({ sortOrder }) => sortOrder)).size, existingRows.length);
});

test('rejects a stale order even when the block set is unchanged', () => {
  assert.throws(() => planHistoryEraBlockOrder([
    { id: 22, sort_order: 0 },
    { id: 11, sort_order: 1 },
    { id: 33, sort_order: 2 },
  ], {
    expectedOrderedIds: [11, 22, 33],
    orderedIds: [33, 11, 22],
  }), /Порядок блоков уже изменился/);
});

test('rejects a request made against a changed block set', () => {
  assert.throws(() => planHistoryEraBlockOrder([
    { id: 11, sort_order: 0 },
    { id: 22, sort_order: 1 },
    { id: 44, sort_order: 2 },
  ], {
    expectedOrderedIds: [11, 22, 33],
    orderedIds: [33, 11, 22],
  }), /Набор блоков изменился/);
});

test('rejects a temporary range that would overflow the smallint column', () => {
  assert.throws(() => planHistoryEraBlockOrder([
    { id: 11, sort_order: 32766 },
    { id: 22, sort_order: 32767 },
  ], {
    expectedOrderedIds: [11, 22],
    orderedIds: [22, 11],
  }), /Не удалось выделить временный диапазон сортировки/);
});
