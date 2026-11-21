import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTechnicalDiagnosticSnapshot } from '../js/modules/technical-diagnostic.js';

test('diagnostic sans trame : indique les valeurs indisponibles', () => {
  const result = buildTechnicalDiagnosticSnapshot({ cur: {}, lastSeen: {}, connected: true, now: 100000 });
  assert.equal(result.status, 'missing');
  assert.equal(result.items.find(item => item.key === 'volume').value, 'Non disponible');
});

test('diagnostic à jour : conserve les zéros et les états booléens', () => {
  const result = buildTechnicalDiagnosticSnapshot({
    cur: { days: 0, filter: 0, volume: 0, boost: false, holidayDays: 0, preheatOn: false, preheatSetpoint: 0, airChangesPerHour: 0, airflowM3h: 0 },
    lastSeen: { state: 99000 }, connected: true, now: 100000
  });
  assert.equal(result.status, 'fresh');
  assert.equal(result.items.find(item => item.key === 'days').value, '0 j');
  assert.equal(result.items.find(item => item.key === 'boost').value, 'Arrêté');
  assert.equal(result.items.find(item => item.key === 'preheatSetpoint').value, 'Aucune');
  assert.equal(result.items.find(item => item.key === 'airflowM3h').value, '0 m³/h');
});

test('diagnostic marque une trame ancienne comme périmée', () => {
  const result = buildTechnicalDiagnosticSnapshot({
    cur: { days: 12, volume: 250 }, lastSeen: { state: 1000 }, connected: true, now: 37001
  });
  assert.equal(result.status, 'stale');
  assert.match(result.freshness, /Données périmées/);
});

test('diagnostic hors connexion ne présente jamais les dernières données comme actuelles', () => {
  const result = buildTechnicalDiagnosticSnapshot({
    cur: { days: 12 }, lastSeen: { state: 99000 }, connected: false, now: 100000
  });
  assert.equal(result.status, 'stale');
  assert.match(result.freshness, /Hors connexion/);
});

test('champ absent ou non fini reste non disponible', () => {
  const result = buildTechnicalDiagnosticSnapshot({
    cur: { days: Number.NaN, volume: null, boost: false },
    lastSeen: { state: 99000 }, connected: true, now: 100000
  });
  assert.equal(result.items.find(item => item.key === 'days').value, 'Non disponible');
  assert.equal(result.items.find(item => item.key === 'volume').value, 'Non disponible');
  assert.equal(result.items.find(item => item.key === 'boost').value, 'Arrêté');
});
