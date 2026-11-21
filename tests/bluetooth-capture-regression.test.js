import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeVmiNotification } from '../js/modules/bluetooth-decoder.js';
import { parseCsvRows, findVmiHeaderRowIndex, getColumnMapping, recFrom } from '../js/modules/dataio.js';

test('rejoue la notification BLE réelle de la télécommande du salon', () => {
  // Les 14 premiers octets de la notification 0x02 réellement capturée.
  // L'emplacement physique est confirmé par l'utilisateur : télécommande du salon.
  const bytes = new Uint8Array([
    0xA5, 0xB6, 0x02, 0x06, 0x7A, 0x3A, 0xF3,
    0x2E, 0x04, 0x01, 0x03, 0x18, 0x00, 0x39
  ]);

  assert.deepEqual(decodeVmiNotification(bytes), {
    kind: 'room',
    temperature: 24,
    humidity: 57
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
