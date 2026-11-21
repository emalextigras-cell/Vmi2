import test from 'node:test';
import assert from 'node:assert/strict';
import { isBleStateStale } from '../js/modules/bluetooth-freshness.js';

const base = {
  connected: true,
  now: 100000,
  connectedAt: 50000,
  lastStateAt: 80000
};

test('ne déclare pas une liaison déconnectée comme silencieuse', () => {
  assert.equal(isBleStateStale({ ...base, connected: false }), false);
});

test('suspend le watchdog pendant le téléchargement historique', () => {
  assert.equal(isBleStateStale({ ...base, downloadActive: true, lastStateAt: 1000 }), false);
});

test('suspend le watchdog pendant une commande utilisateur', () => {
  assert.equal(isBleStateStale({ ...base, commandPending: true, lastStateAt: 1000 }), false);
});

test('conserve une liaison qui reçoit régulièrement des trames état', () => {
  assert.equal(isBleStateStale({ ...base, now: 100000, lastStateAt: 70000 }), false);
});

test('détecte une trame état trop ancienne après la période de grâce', () => {
  assert.equal(isBleStateStale({ ...base, now: 100000, lastStateAt: 64000 }), true);
});

test('détecte aussi une connexion qui ne reçoit jamais sa première trame état', () => {
  assert.equal(isBleStateStale({ ...base, now: 90000, lastStateAt: null }), true);
});

test('ne déclenche pas avant 35 secondes exactes', () => {
  assert.equal(isBleStateStale({ ...base, now: 84999, lastStateAt: 50000 }), false);
  assert.equal(isBleStateStale({ ...base, now: 85000, lastStateAt: 50000 }), true);
});
