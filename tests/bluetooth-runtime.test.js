import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBluetoothNotificationHandler,
  createReconnectHandler
} from '../js/modules/bluetooth-runtime.js';
import { createHistoryStreamState, acceptHistoryFragment } from '../js/modules/bluetooth-history-stream.js';

function makeNotificationHandler(overrides = {}) {
  const elements = new Map();
  const cur = {};
  const lastSeen = {};
  const download = {
    on: false, rows: [], buf: '', historyStream: {},
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

test('transmet au coordinateur la réponse de protocole validée', () => {
  const decoded = {
    kind: 'state', rawFrame: [0xA5, 0xB6, 0x01], filter: 12, days: 34, volume: 210, maxTemperature: 27,
    rawSpeed: 2, boost: true, holiday: false
  };
  let received = null;
  const h = makeNotificationHandler({
    decodeVmiNotification: () => decoded,
    onDecodedFrame: (kind, frame) => { received = { kind, frame }; }
  });

  h.handler({ target: { value: new DataView(new Uint8Array([1, 2]).buffer) } });

  assert.deepEqual(received, { kind: 'state', frame: decoded });
});

test('transmet un accusé protocolaire valide au coordinateur', () => {
  let received = null;
  const h = makeNotificationHandler({
    decodeVmiNotification: () => ({ kind: 'ack', length: 6 }),
    onDecodedFrame: (kind, frame) => { received = { kind, frame }; }
  });

  h.handler({ target: { value: new DataView(new Uint8Array([1, 2]).buffer) } });

  assert.deepEqual(received, { kind: 'ack', frame: { kind: 'ack', length: 6 } });
});

test('notification état met à jour les valeurs VMI et l’horodatage', () => {
  const decoded = {
    kind: 'state', filter: 12, days: 34, volume: 210, maxTemperature: 27,
    rawSpeed: 2, boost: true, holiday: false
  };
  const h = makeNotificationHandler({ decodeVmiNotification: () => decoded });

  h.handler({ target: { value: new DataView(new Uint8Array([1, 2]).buffer) } });

  assert.equal(h.cur.vit, 3);
  assert.deepEqual(h.cur.stateFrame, [0xA5, 0xB6, 0x01]);
  assert.equal(h.cur.filtre, 12);
  assert.equal(h.cur.boost, true);
  assert.equal(h.cur.hol, false);
  assert.equal(h.lastSeen.state, 123456);
  assert.equal(h.elements.get('sp').textContent, 3);
  assert.equal(h.elements.get('bo').textContent, 'Actif');
  assert.equal(h.updates, 1);
});

test('notification sondes met à jour les deux températures et humidités', () => {
  const decoded = {
    kind: 'probes', firstTemperature: 13, firstHumidity: 96,
    secondTemperature: 12, secondHumidity: 97
  };
  const h = makeNotificationHandler({ decodeVmiNotification: () => decoded });

  h.handler({ target: { value: new DataView(new Uint8Array([1, 2]).buffer) } });

  assert.equal(h.cur.s1_t, 13);
  assert.equal(h.cur.s1_h, 96);
  assert.equal(h.cur.s2_t, 12);
  assert.equal(h.cur.s2_h, 97);
  assert.equal(h.elements.get('ti').textContent, 13);
  assert.equal(h.elements.get('hi').textContent, 96);
  assert.equal(h.elements.get('t2').textContent, 12);
  assert.equal(h.elements.get('h2').textContent, 97);
  assert.equal(h.updates, 1);
});



test('ignore les emplacements de sondes marqués vides par le protocole', () => {
  const decoded = {
    kind: 'probes',
    firstLocation: 0x08, firstTemperature: 0, firstHumidity: 0,
    secondLocation: 1, secondTemperature: 12, secondHumidity: 97
  };
  const h = makeNotificationHandler({ decodeVmiNotification: () => decoded });

  h.handler({ target: { value: new DataView(new Uint8Array([1, 2]).buffer) } });

  assert.equal(h.cur.s1_t, null);
  assert.equal(h.cur.s1_h, null);
  assert.equal(h.cur.s2_t, 12);
  assert.equal(h.cur.s2_h, 97);
  assert.equal(h.elements.get('ti').textContent, '–');
  assert.equal(h.elements.get('hi').textContent, '–');
  assert.equal(h.elements.get('t2').textContent, 12);
  assert.equal(h.elements.get('h2').textContent, 97);
});

test('identifie les lignes historiques CSV et attend leurs cinq fragments', () => {
  let received = null;
  const payload = '\n12/11/2026 14:31:00;35;337;1;';
  const h = makeNotificationHandler({
    decodeVmiNotification: () => ({
      kind: 'history', valid: true, payload: new TextEncoder().encode(payload),
      sequence: 25, chunkIndex: 0, final: false
    }),
    acceptHistoryFragment: (_state, fragment) => {
      received = fragment;
      return { accepted: false, duplicate: false, gap: false, resetBuffer: false };
    }
  });
  h.download.on = true;
  h.handler({ target: { value: new DataView(new Uint8Array([1]).buffer) } });
  assert.equal(received.expectedFragments, 5);
  assert.equal(received.payload, payload);
});

test('une trame SimpleData inconnue ne certifie pas la fin du téléchargement', () => {
  const h = makeNotificationHandler({
    decodeVmiNotification: () => ({ kind: 'unknown', type: 0x04, length: 11 })
  });
  h.download.on = true;

  h.handler({ target: { value: new DataView(new Uint8Array([1, 2]).buffer) } });

  assert.equal(h.download.on, true);
  assert.equal(h.download.rows.length, 0);
});

test('conserve le compteur global annoncé sans le confondre avec les lignes téléchargées', () => {
  const h = makeNotificationHandler({
    decodeVmiNotification: () => ({ kind: 'history-count', count: 824, length: 11 })
  });
  h.download.on = true;

  h.handler({ target: { value: new DataView(new Uint8Array([1, 2]).buffer) } });

  assert.equal(h.download.announcedTotalRows, 824);
  assert.equal(h.download.rows.length, 0);
  assert.equal(h.download.on, true);
  assert.match(h.logs.join(' '), /824/);
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


test('termine dès que la ligne de coupure complète est reconnue au début de la séquence suivante', () => {
  let current = null;
  let downloadRef = null;
  let finishCalls = 0;
  const h = makeNotificationHandler({
    decodeVmiNotification: () => current,
    acceptHistoryFragment,
    parseDownloadLine: line => {
      if (line.startsWith('12/11/2026 14:31:00;')) downloadRef.reachedCut = true;
    },
    finishDownload: () => { finishCalls++; }
  });
  downloadRef = h.download;
  h.download.on = true;
  h.download.historyStream = createHistoryStreamState();
  h.download.buf = 'Date;Event;Vol(m3);mode;Duree\r';

  for (let sequence = 0; sequence < 25; sequence++) {
    acceptHistoryFragment(h.download.historyStream, {
      sequence, chunkIndex: 0, payload: 'metadata-' + sequence
    });
  }

  const row = '12/11/2026 14:31:00;35;337;1;04;00;28;25;09,3;1;6.4.2;188;' + 'x'.repeat(270);
  const fragments = [
    [0, '\n' + row.slice(0, 84)],
    [10, row.slice(84, 169)],
    [20, row.slice(169, 254)],
    [30, row.slice(254, 339)],
    [40, row.slice(339)]
  ];
  for (const [chunkIndex, payload] of fragments) {
    current = {
      kind: 'history',
      valid: true,
      payload: new TextEncoder().encode(payload),
      sequence: 25,
      chunkIndex
    };
    h.handler({ target: { value: new DataView(new Uint8Array([1]).buffer) } });
    if (chunkIndex === 0) assert.equal(h.download.historyStream.expectedFragments, 5);
    assert.equal(finishCalls, 0);
  }

  assert.equal(h.download.historyStream.expectedChunk, 50);
  current = {
    kind: 'history',
    valid: true,
    payload: new TextEncoder().encode('\n12/11/2026 14:20:00;ligne plus ancienne;'),
    sequence: 26,
    chunkIndex: 0
  };
  h.handler({ target: { value: new DataView(new Uint8Array([1]).buffer) } });

  assert.equal(h.download.reachedCut, true);
  assert.equal(finishCalls, 1);
  assert.equal(h.download.buf, '');
});


test('conserve les mesures BLE brutes tout en exposant les valeurs filtrées', () => {
  const h = makeNotificationHandler({
    decodeVmiNotification: () => ({ kind: 'room', temperature: 20, humidity: 55 }),
    filterMeasurement: (_key, value) => ({ value: value + 1, status: 'accepted' })
  });

  h.handler({ target: { value: new DataView(new Uint8Array([1, 2]).buffer) } });

  assert.equal(h.cur.sal_t_raw, 20);
  assert.equal(h.cur.sal_h_raw, 55);
  assert.equal(h.cur.sal_t, 21);
  assert.equal(h.cur.sal_h, 56);
});

test('réinitialise le filtre d’un emplacement de sonde vide sans perdre les octets bruts', () => {
  const reset = [];
  const h = makeNotificationHandler({
    decodeVmiNotification: () => ({
      kind: 'probes',
      firstLocation: 0x08, firstTemperature: 0, firstHumidity: 0,
      secondLocation: 1, secondTemperature: 12, secondHumidity: 97
    }),
    resetMeasurementFilter: key => reset.push(key),
    filterMeasurement: (_key, value) => ({ value, status: 'accepted' })
  });

  h.handler({ target: { value: new DataView(new Uint8Array([1, 2]).buffer) } });

  assert.deepEqual(reset, ['s1_t', 's1_h']);
  assert.equal(h.cur.s1_t_raw, 0);
  assert.equal(h.cur.s1_h_raw, 0);
  assert.equal(h.cur.s1_t, null);
  assert.equal(h.cur.s1_h, null);
  assert.equal(h.cur.s2_t_raw, 12);
  assert.equal(h.cur.s2_h_raw, 97);
});
