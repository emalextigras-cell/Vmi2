import test from 'node:test';
import assert from 'node:assert/strict';
import { commitHistorySync } from '../js/modules/history-sync-commit.js';

test('la synchronisation conserve la dernière ligne à +6 s et commit historique et métadonnées ensemble', async () => {
  const syncFinishedAt = 1_800_000_000_000;
  const latest = { t: syncFinishedAt + 6_000, d: 197, st: 20, sh: 50 };
  const metadata = { lastSync: syncFinishedAt };
  let committedEntries;

  const result = await commitHistorySync({
    currentRecords: [],
    importedRecords: [latest],
    maxTimestamp: syncFinishedAt,
    futureToleranceMs: 30_000,
    metadata,
    persistMany: async entries => { committedEntries = entries; }
  });

  assert.deepEqual(result.history, [latest]);
  assert.deepEqual(committedEntries, [['hist', [latest]], ['meta', metadata]]);
});

test('la tolérance Bluetooth ne conserve pas une ligne située à +60 s', async () => {
  const syncFinishedAt = 1_800_000_000_000;
  let committedEntries;

  const result = await commitHistorySync({
    currentRecords: [],
    importedRecords: [{ t: syncFinishedAt + 60_000, d: 197 }],
    maxTimestamp: syncFinishedAt,
    futureToleranceMs: 30_000,
    metadata: { lastSync: syncFinishedAt },
    persistMany: async entries => { committedEntries = entries; }
  });

  assert.deepEqual(result.history, []);
  assert.deepEqual(committedEntries, [['hist', []], ['meta', { lastSync: syncFinishedAt }]]);
});

test('la limite future reste stricte sans tolérance explicite', async () => {
  const now = 1_800_000_000_000;
  const result = await commitHistorySync({
    currentRecords: [],
    importedRecords: [{ t: now + 1, d: 1 }],
    maxTimestamp: now,
    persistMany: async () => {}
  });
  assert.deepEqual(result.history, []);
});

test('un échec IndexedDB fait échouer le commit et ne retourne aucun succès', async () => {
  const now = 1_800_000_000_000;
  let attemptedEntries;
  await assert.rejects(
    commitHistorySync({
      currentRecords: [{ t: now - 1, d: 196, st: 19, sh: 48 }],
      importedRecords: [{ t: now + 6_000, d: 197, st: 20, sh: 50 }],
      maxTimestamp: now,
      futureToleranceMs: 30_000,
      metadata: { lastSync: now },
      persistMany: async entries => {
        attemptedEntries = entries;
        throw new Error('IndexedDB indisponible');
      }
    }),
    /IndexedDB indisponible/
  );
  assert.deepEqual(attemptedEntries, [
    ['hist', [{ t: now - 1, d: 196 }, { t: now + 6_000, d: 197 }]],
    ['meta', { lastSync: now }]
  ]);
});
