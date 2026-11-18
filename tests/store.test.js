import * as storeModule from '../js/modules/store.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/modules/store.js';

function installIndexedDB({ fail = false, failRead = false } = {}) {
  const writes = [];
  const database = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const tx = {
        error: fail ? new Error('quota exceeded') : null,
        objectStore() {
          return {
            put(value, key) { writes.push([key, value]); },
            get() {
              const request = { result: undefined, error: failRead ? new Error('read failed') : null };
              queueMicrotask(() => {
                if (failRead) request.onerror?.();
                else request.onsuccess?.();
              });
              return request;
            }
          };
        }
      };
      queueMicrotask(() => {
        if (fail) tx.onerror?.();
        else tx.oncomplete?.();
      });
      return tx;
    }
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  globalThis.indexedDB = {
    open() {
      const request = { result: database };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    }
  };
  return {
    writes,
    restore() {
      if (previous) Object.defineProperty(globalThis, 'indexedDB', previous);
      else delete globalThis.indexedDB;
    }
  };
}

test('setMany écrit toutes les clés dans une transaction unique', async () => {
  const mock = installIndexedDB();
  try {
    const store = createStore({ databaseName: 'test', storeName: 'data' });
    await store.setMany([['hist', [{ t: 1 }]], ['live', [{ t: 2 }]], ['migrated', true]]);
    assert.deepEqual(mock.writes.map(([key]) => key), ['hist', 'live', 'migrated']);
    assert.equal(mock.writes[0][1][0].t, 1);
    assert.equal(mock.writes[2][1], true);
  } finally {
    mock.restore();
  }
});

test('set propage un échec d’écriture au lieu de le masquer', async () => {
  const mock = installIndexedDB({ fail: true });
  const errors = [];
  try {
    const store = createStore({ databaseName: 'test', storeName: 'data', onError: message => errors.push(message) });
    await assert.rejects(store.set('hist', []), /quota exceeded/);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /IndexedDB écriture/);
  } finally {
    mock.restore();
  }
});

test('setMany propage un échec de transaction au lieu de le masquer', async () => {
  const mock = installIndexedDB({ fail: true });
  const errors = [];
  try {
    const store = createStore({ databaseName: 'test', storeName: 'data', onError: message => errors.push(message) });
    await assert.rejects(store.setMany([['hist', []], ['live', []]]), /quota exceeded/);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /IndexedDB restauration/);
  } finally {
    mock.restore();
  }
});

test('setMany refuse une liste d’écritures mal formée', async () => {
  const mock = installIndexedDB();
  try {
    const store = createStore({ databaseName: 'test', storeName: 'data' });
    await assert.rejects(store.setMany([['hist']]), /Écritures IndexedDB invalides/);
    assert.equal(mock.writes.length, 0);
  } finally {
    mock.restore();
  }
});


test('get propage une erreur de lecture au lieu de la transformer en valeur absente', async () => {
  const mock = installIndexedDB({ failRead: true });
  const errors = [];
  try {
    const store = createStore({ databaseName: 'test', storeName: 'data', onError: message => errors.push(message) });
    await assert.rejects(store.get('hist'), /read failed/);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /IndexedDB lecture/);
    assert.equal(mock.writes.length, 0);
  } finally {
    mock.restore();
  }
});


test('le contrat StoreSnapshot normalise les quatre collections et préserve les relevés bruts', () => {
  const { normalizeStoreSnapshot } = storeModule;
  assert.equal(typeof normalizeStoreSnapshot, 'function');
  const history = [{ sh: 52 }, { t: 1760000000000, sh: 48 }];
  const live = [{ sh: 53 }];
  const energyReadings = [{ id:'e1', meterType:'ventilation', t:1760000000000, kwh:1.2 }];
  const meta = { lastSync:'2026-11-18T12:00:00.000Z' };
  const snapshot = normalizeStoreSnapshot({ history, live, energyReadings, meta });

  assert.deepEqual(snapshot, { history, live, energyReadings, meta });
  assert.strictEqual(snapshot.history, history);
  assert.strictEqual(snapshot.live, live);
  assert.strictEqual(snapshot.energyReadings, energyReadings);
  assert.strictEqual(snapshot.meta, meta);
});

test('le contrat StoreSnapshot remplace les conteneurs de premier niveau mal formés par des valeurs sûres', () => {
  const snapshot = storeModule.normalizeStoreSnapshot({
    history:{ t:1760000000000 },
    live:null,
    energyReadings:'invalid',
    meta:['lastSync', '2026-11-18T12:00:00.000Z']
  });

  assert.deepEqual(snapshot, { history:[], live:[], energyReadings:[], meta:{} });
});
