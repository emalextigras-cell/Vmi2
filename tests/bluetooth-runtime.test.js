import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBluetoothNotificationHandler,
  createReconnectHandler
} from '../js/modules/bluetooth-runtime.js';

function makeNotificationHandler(overrides = {}) {
  const elements = new Map();
  const cur = {};
  const lastSeen = {};
  const download = {
    on: false, rows: [], buf: '', total: 0, historyStream: {},
    integrityGap: false
  };
  let frameCount = 0;
  let updates = 0;
  const logs = [];
  const deps = {
    decodeVmiNotification: () => null,
    getDownload: () => download,
    getCur: () => cur,
    getLastSeen: () => lastSeen,
    acceptHistoryFragment: () => ({ accepted: true }),
    markHistoryStreamInvalid: () => {},
    parseDownloadLine: () => {},
    incrementDlFrames: () => ++frameCount,
    armTimer: () => {},
    finishDownload: () => { download.on = false; },
    updateLiveMetrics: () => { updates++; },
    log: message => logs.push(message),
    hex: () => '01 02',
    $: id => {
      if (!elements.has(id)) elements.set(id, { textContent: '' });
      return elements.get(id);
    },
    now: () => 123456,
    ...overrides
  };
  return {
    handler: createBluetoothNotificationHandler(deps),
    cur, lastSeen, download, elements, logs,
    get updates() { return updates; }
  };
}

test('notification état met à jour les valeurs VMI et l’horodatage', () => {
  const decoded = {
    kind: 'state', filter: 12, days: 34, volume: 210, maxTemperature: 27,
    rawSpeed: 2, boost: true, holiday: false
  };
  const h = makeNotificationHandler({ decodeVmiNotification: () => decoded });

  h.handler({ target: { value: new DataView(new Uint8Array([1, 2]).buffer) } });

  assert.equal(h.cur.vit, 3);
  assert.equal(h.cur.filtre, 12);
  assert.equal(h.cur.boost, true);
  assert.equal(h.cur.hol, false);
  assert.equal(h.lastSeen.state, 123456);
  assert.equal(h.elements.get('sp').textContent, 3);
  assert.equal(h.elements.get('bo').textContent, 'Actif');
  assert.equal(h.updates, 1);
});

test('notification historique invalide marque le flux incomplet', () => {
  let invalidated = false;
  const h = makeNotificationHandler({
    decodeVmiNotification: () => ({ kind: 'history', valid: false }),
    markHistoryStreamInvalid: () => { invalidated = true; }
  });
  h.download.on = true;
  h.download.buf = 'fragment incomplet';

  h.handler({ target: { value: new DataView(new Uint8Array([1]).buffer) } });

  assert.equal(invalidated, true);
  assert.equal(h.download.integrityGap, true);
  assert.equal(h.download.buf, '');
  assert.match(h.logs.join(' '), /transfert marqué incomplet/);
});

test('reconnexion ignorée après une déconnexion manuelle', async () => {
  let connectCalls = 0;
  const reconnect = createReconnectHandler({
    isManualDisconnect: () => true,
    getDevice: () => ({ id: 'vmi' }),
    isConnectionRequestPending: () => false,
    getConnectionIntentGeneration: () => 1,
    connectDevice: async () => { connectCalls++; },
    log: () => {},
    clearTimeout: () => {},
    setTimeout: () => 1,
    getReconnectTimer: () => null,
    setReconnectTimer: () => {}
  });

  await reconnect();
  assert.equal(connectCalls, 0);
});

test('reconnexion échouée programme un nouvel essai après 7 secondes', async () => {
  let scheduledDelay = null;
  let timerCleared = null;
  const device = { id: 'vmi' };
  const reconnect = createReconnectHandler({
    isManualDisconnect: () => false,
    getDevice: () => device,
    isConnectionRequestPending: () => false,
    getConnectionIntentGeneration: () => 4,
    connectDevice: async (_device, intent) => {
      assert.equal(_device, device);
      assert.equal(intent, 4);
      throw new Error('liaison perdue');
    },
    log: message => assert.match(message, /liaison perdue/),
    clearTimeout: timer => { timerCleared = timer; },
    setTimeout: (_callback, delay) => { scheduledDelay = delay; return 99; },
    getReconnectTimer: () => 12,
    setReconnectTimer: timer => { assert.equal(timer, 99); }
  });

  await reconnect();
  assert.equal(timerCleared, 12);
  assert.equal(scheduledDelay, 7000);
});
