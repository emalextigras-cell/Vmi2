import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBluetoothHistoryRow } from '../js/modules/bluetooth-history-row.js';

test('accepte une ligne historique complète avec champs optionnels vides', () => {
  const fields = Array(119).fill('');
  fields[0] = '10/11/2026 16:55:00';
  fields[11] = '1234';
  const result = validateBluetoothHistoryRow(fields.join(';'));
  assert.equal(result.valid, true);
  assert.equal(result.fields.length, 119);
});

test('rejette une ligne tronquée avant la colonne compteur de jours', () => {
  assert.deepEqual(validateBluetoothHistoryRow('10/11/2026 16:55:00;event;volume').reason, 'truncated');
});

test('rejette une date impossible même si son format est correct', () => {
  assert.equal(validateBluetoothHistoryRow('31/02/2026 16:55:00;1;2;3;4;5;6;7;8;9;10;123').reason, 'date-invalid');
});

test('rejette un compteur de jours vide ou non numérique', () => {
  const prefix = '10/11/2026 16:55:00;1;2;3;4;5;6;7;8;9;10;';
  assert.equal(validateBluetoothHistoryRow(prefix).reason, 'duration-invalid');
  assert.equal(validateBluetoothHistoryRow(prefix + 'abc').reason, 'duration-invalid');
});

test('rejette les lignes vides et les dates mal formées', () => {
  assert.equal(validateBluetoothHistoryRow('').reason, 'empty');
  assert.equal(validateBluetoothHistoryRow('2026-11-10;1;2;3;4;5;6;7;8;9;10;123').reason, 'date-format');
});
