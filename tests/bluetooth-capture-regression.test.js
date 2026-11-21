import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeVmiNotification } from '../js/modules/bluetooth-decoder.js';
import { recFrom } from '../js/modules/dataio.js';

test('rejoue la notification BLE réelle de la télécommande du salon', () => {
  // Extrait minimal de la notification 0x02 observée dans btsnoop_hci.log.
  // Les octets utiles sont conservés ; aucune adresse Bluetooth ni historique n'est embarqué.
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

test('importe séparément Tempext et la température/humidité de la télécommande salon', () => {
  // Valeurs représentatives de la ligne du CSV VMI+ du 10/11/2026 à 16:45:35.
  const row = Array(124).fill('');
  row[0] = '10/11/2026 16:45:35';
  row[39] = '17,6';  // Tempext
  row[117] = '019,7'; // Télécommande salon : température
  row[118] = '062,0'; // Télécommande salon : humidité relative

  const record = recFrom(row, null);

  assert.ok(record);
  assert.equal(record.tExt, 17.6);
  assert.equal(record.st, 19.7);
  assert.equal(record.sh, 62);
});
