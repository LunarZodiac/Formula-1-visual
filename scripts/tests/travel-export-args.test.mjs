import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTravelExportArgs } from '../lib/travel-export-args.mjs';

test('проверка экспорта не меняет режим записи и поддерживает оба синтаксиса ID', () => {
  assert.deepEqual(parseTravelExportArgs(['--check', '--circuit=spa']), { circuitId: 'spa', checkOnly: true });
  assert.deepEqual(parseTravelExportArgs(['--circuit', 'spa', '--check']), { circuitId: 'spa', checkOnly: true });
  assert.deepEqual(parseTravelExportArgs(['--circuit', 'spa']), { circuitId: 'spa', checkOnly: false });
});

test('ошибка в параметрах не запускает запись всех трасс', () => {
  for (const args of [['--checks'], ['--circuit'], ['--circuit=../spa'], ['--circuit=spa', '--circuit=monza'], ['--check', '--check']]) {
    assert.throws(() => parseTravelExportArgs(args), undefined, args.join(' '));
  }
});
