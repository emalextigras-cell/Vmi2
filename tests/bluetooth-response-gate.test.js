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

test('un timeout invalide la corrélation pour toute la session', async () => {
  const gate = createBleResponseGate();
  await assert.rejects(gate.waitFor('state', 5), /reconnexion requise/);
  assert.equal(gate.pendingKind, null);
  assert.equal(gate.isInvalidated, true);
  await assert.rejects(gate.waitFor('state', 100), /reconnexion requise/);
});

test('une réponse tardive ne peut pas valider une attente après timeout', async () => {
  const gate = createBleResponseGate();
  await assert.rejects(gate.waitFor('state', 5), /reconnexion requise/);
  assert.equal(gate.notify('state', { stale: true }), false);
  await assert.rejects(gate.waitFor('state', 100), /reconnexion requise/);
});

test('une nouvelle session réinitialise la corrélation invalidée', async () => {
  const gate = createBleResponseGate();
  await assert.rejects(gate.waitFor('state', 5), /reconnexion requise/);
  gate.reset();
  const next = gate.waitFor('state', 100);
  const fresh = { fresh: true };
  assert.equal(gate.notify('state', fresh), true);
  assert.equal(await next, fresh);
  assert.equal(gate.isInvalidated, false);
});

test('annule et invalide une attente lors de la perte de session', async () => {
  const gate = createBleResponseGate();
  const waiting = gate.waitFor('state', 100);
  gate.cancel(new Error('session terminée'));
  await assert.rejects(waiting, /session terminée/);
  assert.equal(gate.pendingKind, null);
  assert.equal(gate.isInvalidated, true);
});

test('une notification ne traverse jamais une session invalidée puis réinitialisée', async () => {
  const gate = createBleResponseGate();
  gate.invalidate(new Error('ancienne session'));
  assert.equal(gate.notify('state', { stale: true }), false);
  gate.reset();
  const waiting = gate.waitFor('state', 100);
  assert.equal(gate.notify('state', { fresh: true }), true);
  assert.deepEqual(await waiting, { fresh: true });
});
