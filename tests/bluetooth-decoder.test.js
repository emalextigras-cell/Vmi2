import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeVmiNotification } from '../js/modules/bluetooth-decoder.js';

const frame = (type, length, declaredLength = length) => {
  const bytes = new Uint8Array(length);
  bytes[0] = 0xA5;
  bytes[1] = 0xB6;
  bytes[2] = type;
  if (length >= 5) bytes[4] = declaredLength - 6;
  return bytes;
};

const seal = bytes => {
  const frameLength = bytes[4] + 6;
  let checksum = 0;
  for (let i = 2; i < frameLength - 1; i++) checksum ^= bytes[i];
  bytes[frameLength - 1] = checksum;
  return bytes;
};

test('ignore les notifications sans en-tête VMI complet', () => {
  assert.equal(decodeVmiNotification(new Uint8Array([0xA5, 0xB6])), null);
  assert.equal(decodeVmiNotification(new Uint8Array([0, 0, 1])), null);
});

test('signale les trames connues tronquées sans les décoder comme des notifications inconnues', () => {
  for (const [type, length, requiredLength] of [
    [0x01, 60, 61], [0x02, 127, 128], [0x03, 30, 31], [0x04, 10, 11]
  ]) {
    assert.deepEqual(decodeVmiNotification(frame(type, length, requiredLength)), {
      kind: 'invalid', type, length, requiredLength, reason: 'truncated'
    });
  }
});

test('décode les champs de la trame état après validation XOR', () => {
  const bytes = frame(0x01, 61);
  bytes[22] = 0x34; bytes[23] = 0x12;
  bytes[26] = 19; bytes[27] = 1; bytes[28] = 2; bytes[29] = 1; bytes[34] = 1;
  bytes[38] = 35; bytes[43] = 1; bytes[44] = 0;
  assert.deepEqual(decodeVmiNotification(seal(bytes)), {
    kind: 'state', filter: 258, days: 275, volume: 0x1234,
    maxTemperature: 35, rawSpeed: 1, boost: 0, holiday: 1
  });
});

test('décode les mesures salon et les deux sondes après validation XOR', () => {
  const room = frame(0x02, 128); room[11] = 21; room[13] = 56;
  assert.deepEqual(decodeVmiNotification(seal(room)), { kind: 'room', temperature: 21, humidity: 56 });
  const probes = frame(0x03, 31);
  probes[6] = 8; probes[8] = 9; probes[11] = 10; probes[13] = 11;
  assert.deepEqual(decodeVmiNotification(seal(probes)), {
    kind: 'probes', firstTemperature: 8, firstHumidity: 9,
    secondTemperature: 10, secondHumidity: 11
  });
});

test('rejette les notifications connues dont le contrôle XOR est incorrect', () => {
  const bytes = frame(0x03, 31);
  bytes[6] = 12;
  seal(bytes);
  bytes[30] ^= 0x01;
  assert.deepEqual(decodeVmiNotification(bytes), {
    kind: 'invalid', type: 0x03, length: 31, requiredLength: 31, reason: 'checksum'
  });
});

test('décode le compteur historique sans interpréter l’octet 13 comme marqueur de fin', () => {
  const total = frame(0x04, 11); total[6] = 0x34; total[7] = 0x12;
  assert.deepEqual(decodeVmiNotification(seal(total)), { kind: 'history-total', total: 0x1234 });

  const history = frame(0x30, 116);
  history[9] = 7; history[10] = 1; history[13] = 1;
  history.set([65, 66, 0], 14);
  const decoded = decodeVmiNotification(seal(history));
  assert.equal(decoded.kind, 'history');
  assert.equal(decoded.sequence, 263);
  assert.equal(decoded.chunkIndex, 0);
  assert.equal(decoded.received, 263);
  assert.equal('final' in decoded, false);
  assert.deepEqual([...decoded.payload], [65, 66]);

  const fragment = frame(0x30, 116);
  fragment[9] = 25; fragment[11] = 1; fragment[12] = 10;
  fragment.set([65, 66, 0], 14);
  const decodedFragment = decodeVmiNotification(seal(fragment));
  assert.equal(decodedFragment.sequence, 25);
  assert.equal(decodedFragment.chunkIndex, 10);
  assert.equal('final' in decodedFragment, false);
});

test('signale les trames historiques trop courtes ou dont le XOR est invalide', () => {
  assert.deepEqual(decodeVmiNotification(frame(0x30, 13, 116)), {
    kind: 'history', valid: false, length: 13, reason: 'truncated'
  });
  const corrupt = frame(0x30, 116);
  seal(corrupt);
  corrupt[115] ^= 0x80;
  assert.deepEqual(decodeVmiNotification(corrupt), {
    kind: 'history', valid: false, length: 116, reason: 'checksum'
  });
  assert.deepEqual(decodeVmiNotification(frame(0x10, 4)), { kind: 'unknown', type: 0x10, length: 4 });
});
