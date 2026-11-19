import test from 'node:test';
import assert from 'node:assert/strict';
import { persistCompletedHistorySync } from '../js/modules/sync.js';

test('enregistre les métadonnées seulement après la sauvegarde de l’historique', async () => {
  const calls = [];
  const result = await persistCompletedHistorySync({
    saveHistory: async () => { calls.push('history'); return true; },
    saveMetadata: async () => { calls.push('meta'); }
  });

  assert.equal(result, true);
  assert.deepEqual(calls, ['history', 'meta']);
});

test('ne publie pas lastSync si la sauvegarde de l’historique échoue', async () => {
  const calls = [];
  const result = await persistCompletedHistorySync({
    saveHistory: async () => { calls.push('history'); return false; },
    saveMetadata: async () => { calls.push('meta'); }
  });

  assert.equal(result, false);
  assert.deepEqual(calls, ['history']);
});

test('ne publie pas lastSync si la sauvegarde de l’historique rejette', async () => {
  const calls = [];
  await assert.rejects(
    persistCompletedHistorySync({
      saveHistory: async () => { calls.push('history'); throw new Error('quota exceeded'); },
      saveMetadata: async () => { calls.push('meta'); }
    }),
    /quota exceeded/
  );

  assert.deepEqual(calls, ['history']);
});
