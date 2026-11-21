import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeVmiNotification } from '../js/modules/bluetooth-decoder.js';
import { parseCsvRows, findVmiHeaderRowIndex, getColumnMapping, recFrom } from '../js/modules/dataio.js';

const hexBytes = value => Uint8Array.from(value.trim().split(/\s+/), byte => parseInt(byte, 16));

test('rejoue la notification BLE réelle de la télécommande du salon', () => {
  // Trame complète extraite de la capture : longueur déclarée 128, XOR inclus.
  const bytes = hexBytes(`
    a5 b6 02 06 7a 3a f3 2e 04 01 03 18 00 39 00 ff
    00 00 00 00 00 00 00 00 00 ff 00 00 00 00 00 00 00 00 00 ff
    00 00 00 00 00 00 00 00 00 ff 00 00 00 00 00 00 00 00 00 ff
    00 00 00 00 00 00 00 00 00 ff 00 00 00 00 00 00 00 00 00 ff
    00 00 00 00 00 00 00 00 00 ff 00 00 00 00 00 00 00 00 00 ff
    00 00 00 00 00 00 00 00 00 ff 00 00 00 00 00 00 00 00 00 00
    00 00 00 00 00 00 00 00 00 00 00 be
  `);

  assert.deepEqual(decodeVmiNotification(bytes), {
    kind: 'room',
    temperature: 24,
    humidity: 57
  });
});

test('rejoue la trame 0x03 réelle : deux sondes filaires avec leur humidité', () => {
  // Trame complète extraite de la capture : longueur déclarée 31, XOR inclus.
  const bytes = hexBytes(`
    a5 b6 03 06 19 00 0d 00 60 00 01 0c 00 61 00
    08 00 00 00 00 08 00 00 00 00 08 00 00 00 00 15
  `);

  assert.deepEqual(decodeVmiNotification(bytes), {
    kind: 'probes',
    firstLocation: 0,
    firstTemperature: 13,
    firstHumidity: 96,
    secondLocation: 1,
    secondTemperature: 12,
    secondHumidity: 97
  });
});

test('lit la vraie ligne VMI+ sans confondre Tempext, sondes et télécommande salon', () => {
  // En-tête et ligne copiés de l'export fourni (10/11/2026 16:45:35).
  // La ligne réelle est conservée ici en version minimale : colonnes utiles et
  // positions originales sont maintenues afin de tester le mapping d'import.
  const header = Array(124).fill('NA');
  Object.assign(header, {
    0: 'Date', 3: 'mode', 23: 'Debit', 39: 'Tempext',
    40: 'Temp', 41: 'Hum rel (%)', 42: 'Hum abs (%)',
    43: 'Temp', 44: 'Hum rel (%)', 45: 'Hum abs (%)',
    115: 'Type/Zone', 116: 'Id', 117: 'Data1', 118: 'Data2',
    119: 'Data3', 120: 'att'
  });
  const row = Array(124).fill('');
  Object.assign(row, {
    0: '10/11/2026 16:45:35', 3: '1', 23: '121',
    39: '17,6',
    40: '17,7', 41: '73', 42: '09,05',
    43: '17,6', 44: '74', 45: '09,12',
    115: 'ASSIS/01', 116: '042EF33A',
    117: '019,7', 118: '062,0', 119: '0', 120: '53'
  });

  const rows = parseCsvRows(
    [header.join(','), row.map((value, index) =>
      [9, 39, 40, 42, 43, 45, 116, 117, 118].includes(index) && value !== ''
        ? '"' + value + '"'
        : value
    ).join(',')].join('\n')
  );
  const headerIndex = findVmiHeaderRowIndex(rows);
  assert.equal(headerIndex, 0);
  const mapping = getColumnMapping(rows[headerIndex]);
  const record = recFrom(rows[headerIndex + 1], null, mapping);

  assert.ok(record);
  assert.equal(record.tExt, 17.6, 'Tempext est la colonne extérieure dédiée');
  assert.equal(record.st, 19.7, 'Data1 de ASSIS/01 est la température salon');
  assert.equal(record.sh, 62, 'Data2 de ASSIS/01 est l’humidité salon');
  assert.equal(record.t1, 17.7, 'la sonde P0 reste distincte');
  assert.equal(record.h1, 73);
  assert.equal(record.te, 17.6, 'la sonde P1 reste distincte de Tempext');
  assert.equal(record.he, 74);
});

test('rejette une vraie trame historique dont le XOR est invalide', () => {
  // Fragment 40 de la séquence 77 : octet final 0x4f, XOR calculé 0x45.
  const bytes = hexBytes(`
    a5 b6 30 06 6e 37 27 51 12 4d 00 05 28 00 30 30 30 3b 30 35 34 3b 00 00
    00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
    30 3b 32 38 3b 32 35 3b 30 39 2c 33 3b 31 3b 36 2e 34 2e 32 3b 31 38 37
    3b 30 31 3b 30 34 3b 30 30 3b 34 32 32 35 3b 34 37 3b 31 32 36 38 3b 39
    39 3b 31 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 4f
  `);
  assert.deepEqual(decodeVmiNotification(bytes), {
    kind: 'history', valid: false, length: 116, reason: 'checksum'
  });
});

test('décode les températures négatives du protocole VMI+ sans toucher aux humidités', () => {
  const seal = bytes => {
    let checksum = 0;
    for (let i = 2; i < bytes.length - 1; i++) checksum ^= bytes[i];
    bytes[bytes.length - 1] = checksum;
    return bytes;
  };
  const probes = new Uint8Array(31);
  probes.set([0xA5, 0xB6, 0x03, 0x06, 0x19, 0x00, 0xFB, 0x00, 0x60, 0x00,
    0x01, 0x80, 0x00, 0x61, 0x00]);
  const decodedProbes = decodeVmiNotification(seal(probes));
  assert.equal(decodedProbes.kind, 'probes');
  assert.equal(decodedProbes.firstTemperature, -4);
  assert.equal(decodedProbes.firstHumidity, 96);
  assert.equal(decodedProbes.secondTemperature, -127);
  assert.equal(decodedProbes.secondHumidity, 97);

  const room = new Uint8Array(128);
  room.set([0xA5, 0xB6, 0x02, 0x06, 0x7A]);
  room[11] = 0xFE;
  room[13] = 57;
  assert.equal(decodeVmiNotification(seal(room)).temperature, -1);
  assert.equal(decodeVmiNotification(seal(room)).humidity, 57);
});
