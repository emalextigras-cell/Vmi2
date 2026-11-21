import test from 'node:test';
import assert from 'node:assert/strict';
import { createBleResponseGate, BLE_RESPONSE_KIND_BY_REGISTER } from '../js/modules/bluetooth-response-gate.js';

test('associe les registres Purevent aux bons types de réponse', () => {
  assert.equal(BLE_RESPONSE_KIND_BY_REGISTER[0x03], 'state');
  assert.equal(BLE_RESPONSE_KIND_BY_REGISTER[0x06], 'room');
  assert.equal(BLE_RESPONSE_KIND_BY_REGISTER[0x07], 'probes');
  assert.equal(BLE_RESPONSE_KIND_BY_REGISTER[0x18], 'state');
  assert.equal(BLE_RESPONSE_KIND_BY_REGISTER[0x19], 'state');
  assert.equal(BLE_RESPONSE_KIND_BY_REGISTER[0x1A], 'state');
});

test('ne valide une requête que par une réponse du type attendu', async () => {
  const gate = createBleResponseGate();
  const response = gate.waitFor('state', 100);
  assert.equal(gate.notify('probes', { temperature: 12 }), false);
  assert.equal(gate.pendingKind, 'state');
  const frame = { volume: 180 };
  assert.equal(gate.notify('state', frame), true);
  assert.equal(await response, frame);
  assert.equal(gate.pendingKind, null);
});

test('refuse deux attentes simultanées', async () => {
  const gate = createBleResponseGate();
  const first = gate.waitFor('state', 100);
  await assert.rejects(gate.waitFor('room', 100), /déjà attendue/);
  gate.notify('state', {});
  await first;
});

test('libère une attente après expiration', async () => {
  const gate = createBleResponseGate();
  await assert.rejects(gate.waitFor('probes', 5), /Délai dépassé/);
  assert.equal(gate.pendingKind, null);
  const next = gate.waitFor('room', 100);
  gate.notify('room', {});
  await next;
});

test('annule proprement une attente lors de la perte de session', async () => {
  const gate = createBleResponseGate();
  const waiting = gate.waitFor('state', 100);
  gate.cancel(new Error('session terminée'));
  await assert.rejects(waiting, /session terminée/);
  assert.equal(gate.pendingKind, null);
});
