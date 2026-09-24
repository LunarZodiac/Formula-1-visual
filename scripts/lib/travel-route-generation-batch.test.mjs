import assert from 'node:assert/strict';
import test from 'node:test';
import { applyGeneratedRouteBatch } from './travel-route-generation-batch.mjs';

function fakeTransaction() {
  const calls = [];
  const committed = [];
  let pending = [];
  return {
    calls, committed,
    async query(sql, params) {
      calls.push([sql, params]);
      if (sql === 'BEGIN') pending = [];
      if (sql === 'COMMIT') committed.push(...pending);
      if (sql === 'ROLLBACK') pending = [];
    },
    insert(id) { pending.push(id); },
  };
}

const suggestions = [
  { id: 'one', semanticFingerprint: 'one' },
  { id: 'two', semanticFingerprint: 'two' },
];

test('rolls back the whole batch when a later route fails', async () => {
  const client = fakeTransaction();
  await assert.rejects(applyGeneratedRouteBatch({
    client, circuitId: 'spa', suggestions,
    checkSources: async () => {}, loadFingerprints: async () => new Set(),
    save: async (transaction, suggestion) => {
      if (suggestion.id === 'two') throw new Error('invalid stop');
      transaction.insert(suggestion.id);
      return { created: true };
    },
  }), /invalid stop/);
  assert.deepEqual(client.committed, []);
  assert.deepEqual(client.calls.map(([sql]) => sql).filter(sql => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)), ['BEGIN', 'ROLLBACK']);
});

test('serializes by circuit and skips existing semantic routes', async () => {
  const client = fakeTransaction();
  const result = await applyGeneratedRouteBatch({
    client, circuitId: 'spa', suggestions,
    checkSources: async () => {}, loadFingerprints: async () => new Set(['one']),
    save: async (transaction, suggestion) => { transaction.insert(suggestion.id); return { created: true }; },
  });
  assert.deepEqual(result, { created: 1, skipped: 1 });
  assert.deepEqual(client.committed, ['two']);
  assert.deepEqual(client.calls[1], ['SELECT pg_advisory_xact_lock(hashtext($1))', ['route-generation:spa']]);
});

test('does not open a transaction for an empty selection', async () => {
  const client = fakeTransaction();
  await assert.rejects(applyGeneratedRouteBatch({ client, circuitId: 'spa', suggestions: [] }), /Выберите хотя бы один/);
  assert.equal(client.calls.length, 0);
});
