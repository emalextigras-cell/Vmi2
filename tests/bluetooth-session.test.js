import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runBleSessionSequence } from '../js/modules/bluetooth-session.js';
import { createBluetoothService } from '../js/modules/bluetooth-service.js';

test('arrête la séquence dès que la session BLE change', async () => {
  let token = 1;
  const sent = [];
  const result = await runBleSessionSequence({
    token,
    getToken: () => token,
    isActive: () => true,
    steps: [
      async () => { sent.push('horloge'); token++; return true; },
      async () => { sent.push('historique'); return true; }
    ]
  });
  assert.equal(result, false);
  assert.deepEqual(sent, ['horloge']);
});

test('exécute toutes les étapes dans la même session', async () => {
  const sent = [];
  const result = await runBleSessionSequence({
    token: 7,
    getToken: () => 7,
    isActive: () => true,
    steps: [
      async () => { sent.push(1); return true; },
      async () => { sent.push(2); return true; }
    ]
  });
  assert.equal(result, true);
  assert.deepEqual(sent, [1, 2]);
});

test('arrête la séquence après un échec d’écriture', async () => {
  const sent = [];
  const result = await runBleSessionSequence({
    token: 7,
    getToken: () => 7,
    isActive: () => true,
    steps: [
      async () => { sent.push(1); return false; },
      async () => { sent.push(2); return true; }
    ]
  });
  assert.equal(result, false);
  assert.deepEqual(sent, [1]);
});

function makeBluetoothFixture() {
  const events = [];
  const listeners = new Map();
  const makeCharacteristic = name => ({
    name,
    properties: { write: true },
    addEventListener: type => events.push(name + ':add:' + type),
    removeEventListener: type => events.push(name + ':remove:' + type),
    startNotifications: async () => { events.push(name + ':start'); },
    writeValueWithResponse: async () => {
      events.push(name + ':write');
      queueMicrotask(() => service.notifyResponse('state', { ok: true }));
    }
  });
  const command = makeCharacteristic('command');
  const telemetry = makeCharacteristic('telemetry');
  const server = {
    getPrimaryService: async uuid => ({
      getCharacteristic: async characteristicUuid =>
        characteristicUuid === '0003cbb1-0000-1000-8000-00805f9b0131' ? command : telemetry
    })
  };
  const device = {
    id: 'purevent-test',
    name: 'Purevent simulée',
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: type => listeners.delete(type),
    gatt: {
      connected: false,
      connect: async () => {
        device.gatt.connected = true;
        return server;
      },
      disconnect: () => {
        device.gatt.connected = false;
        listeners.get('gattserverdisconnected')?.();
      }
    }
  };
  let service;
  const calls = { connected: 0, cleanup: 0, notifications: 0 };
  service = createBluetoothService({
    navigatorRef: { bluetooth: { requestDevice: async () => device, getDevices: async () => [device] } },
    storageRef: { getItem: () => '', setItem: () => {} },
    sleep: async () => {},
    setStatus: () => {},
    log: () => {},
    showError: () => {},
    onNotification: () => { calls.notifications++; },
    onSessionCleanup: () => { calls.cleanup++; },
    onConnected: () => { calls.connected++; },
    getLastStateAt: () => 0,
    isDownloadActive: () => true,
    isCommandPending: () => false,
    onSnapshot: () => {},
    onAutoHistory: () => {},
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
    setIntervalFn: () => 1,
    clearIntervalFn: () => {}
  });
  return { service, device, events, calls };
}

test('le service BLE installe les écouteurs avant startNotifications', async () => {
  const { service, events, calls } = makeBluetoothFixture();
  await service.connectBLE();
  assert.equal(service.connected(), true);
  assert.equal(calls.connected, 1);
  const commandListener = events.indexOf('command:add:characteristicvaluechanged');
  const telemetryListener = events.indexOf('telemetry:add:characteristicvaluechanged');
  const commandStart = events.indexOf('command:start');
  const telemetryStart = events.indexOf('telemetry:start');
  assert.ok(commandListener >= 0 && telemetryListener >= 0);
  assert.ok(commandListener < commandStart);
  assert.ok(telemetryListener < telemetryStart);
});

test('le service BLE corrèle une réponse typée à son écriture', async () => {
  const { service } = makeBluetoothFixture();
  await service.connectBLE();
  const result = await service.sendAndWait(3, 0, 'state', 100);
  assert.deepEqual(result, { written: true, responded: true, response: { ok: true } });
});

test('une déconnexion manuelle nettoie la session et invalide son token', async () => {
  const { service, calls } = makeBluetoothFixture();
  await service.connectBLE();
  const token = service.getSessionToken();
  service.disconnect();
  assert.equal(service.connected(), false);
  assert.notEqual(service.getSessionToken(), token);
  assert.equal(calls.cleanup, 1);
});

test('app.js délègue le transport et le cycle de vie BLE au service dédié', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.ok(source.includes("import { createBluetoothService } from './modules/bluetooth-service.js'"));
  assert.ok(source.includes('bluetoothService=createBluetoothService('));
  for (const forbidden of [
    'navigator.bluetooth', 'requestDevice(', 'getPrimaryService(', 'startNotifications(',
    'createBleWriteQueue(', 'createBleResponseGate(', 'async function connectDevice(',
    'function connectCharacteristics(', 'function checkBleFreshness(', 'function poll('
  ]) assert.equal(source.includes(forbidden), false, 'app.js ne doit plus contenir ' + forbidden);
});
