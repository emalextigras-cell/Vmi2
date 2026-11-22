import test from 'node:test';
import assert from 'node:assert/strict';
import { requestPersistentStorage } from '../js/modules/storage-persistence.js';

test('reconnaît un stockage déjà persistant sans nouvelle demande', async () => {
  let requested = false;
  const result = await requestPersistentStorage({
    persisted: async () => true,
    persist: async () => { requested = true; return true; }
  });
  assert.deepEqual(result, { status: 'persisted' });
  assert.equal(requested, false);
});

test('demande le stockage persistant et rapporte son acceptation', async () => {
  const result = await requestPersistentStorage({
    persisted: async () => false,
    persist: async () => true
  });
  assert.deepEqual(result, { status: 'granted' });
});

test('signale explicitement un refus du navigateur', async () => {
  const result = await requestPersistentStorage({
    persisted: async () => false,
    persist: async () => false
  });
  assert.deepEqual(result, { status: 'denied' });
});

test('gère les navigateurs sans API de stockage persistant', async () => {
  assert.deepEqual(await requestPersistentStorage(undefined), { status: 'unsupported' });
});

test('ne bloque pas l’application si l’API de stockage échoue', async () => {
  const result = await requestPersistentStorage({
    persisted: async () => { throw new Error('permission unavailable'); },
    persist: async () => true
  });
  assert.deepEqual(result, { status: 'error', error: 'permission unavailable' });
});
