import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeVmiNotification } from '../js/modules/bluetooth-decoder.js';
import { createBluetoothNotificationHandler } from '../js/modules/bluetooth-runtime.js';

test('les états Boost et Vacances restent décodés après la vitesse brute', () => {
  const bytes = new Uint8Array(61);
  bytes[0] = 0xA5;
  bytes[1] = 0xB6;
  bytes[2] = 0x01;
  bytes[4] = 55;
  bytes[33] = 1;
  bytes[34] = 1;
  bytes[35] = 15;
  bytes[38] = 32;
  bytes[43] = 7;
  bytes[44] = 0;
  bytes[45] = 1;
  bytes[47] = 0xE8;
  bytes[48] = 0x03;
  bytes[53] = 1;
  let checksum = 0;
  for (let i = 2; i < 60; i++) checksum ^= bytes[i];
  bytes[60] = checksum;

  const decoded = decodeVmiNotification(bytes);
  assert.equal(decoded.kind, 'state');
  assert.equal(decoded.rawSpeed, 1);
  assert.equal(decoded.boost, false);
  assert.equal(decoded.surventilation, false);
  assert.equal(decoded.preheatSetpoint, 15);
  assert.equal(decoded.summerLimit, 32);
  assert.equal(decoded.fixedAirflow, true);
  assert.equal(decoded.airChangesPerHour, 1);
  assert.equal(decoded.airflowM3h, 0); // volume brut nul dans cette trame
  assert.equal(decoded.preheatOn, true);
  assert.equal(decoded.holiday, true);
  assert.equal(decoded.vacationDays, 7);

  const cur = {};
  const elements = new Map();
  const handler = createBluetoothNotificationHandler({
    decodeVmiNotification: () => decoded,
    getDownload: () => ({ on: false }),
    getCur: () => cur,
    getLastSeen: () => ({}),
    acceptHistoryFragment: () => ({ accepted: true }),
    markHistoryStreamInvalid: () => {},
    parseDownloadLine: () => {},
    incrementDlFrames: () => 0,
    armTimer: () => {},
    finishDownload: () => {},
    updateLiveMetrics: () => {},
    log: () => {},
    hex: () => '',
    $: id => {
      if (!elements.has(id)) elements.set(id, { textContent: '' });
      return elements.get(id);
    },
    now: () => 1
  });

  handler({ target: { value: new DataView(bytes.buffer) } });
  assert.equal(cur.vit, 2);
  assert.equal(cur.boost, false);
  assert.equal(cur.hol, true);
  assert.equal(cur.holidayDays, 7);
  assert.equal(elements.get('ho').textContent, 'Actif · 7 j restants');
  assert.equal(elements.get('sp').textContent, 2);
  assert.equal(cur.surventilation, false);
  assert.equal(cur.preheatOn, true);
  assert.equal(cur.preheatSetpoint, 15);
  assert.equal(cur.summerLimit, 32);
  assert.equal(cur.fixedAirflow, true);
  assert.equal(cur.airChangesPerHour, 1);
  assert.equal(elements.get('sv').textContent, 'Arrêtée');
  assert.equal(elements.get('ph').textContent, 'En marche');
  assert.equal(elements.get('phSet').textContent, '15 °C');
  assert.equal(elements.get('summerLimit').textContent, '32 °C');
  assert.equal(elements.get('fixedFlow').textContent, 'Actif');
  assert.equal(elements.get('renewal').textContent, '1.000 vol/h');
});


test('un compteur de vacances nul signifie mode arrêté', () => {
  const bytes = new Uint8Array(61);
  bytes[0] = 0xA5;
  bytes[1] = 0xB6;
  bytes[2] = 0x01;
  bytes[4] = 55;
  bytes[43] = 0;
  let checksum = 0;
  for (let i = 2; i < 60; i++) checksum ^= bytes[i];
  bytes[60] = checksum;
  const decoded = decodeVmiNotification(bytes);
  assert.equal(decoded.kind, 'state');
  assert.equal(decoded.holiday, false);
  assert.equal(decoded.vacationDays, 0);
  assert.equal(decoded.surventilation, true); // octet 33 = 0 : logique Purevent inversée
  assert.equal(decoded.fixedAirflow, false);
});
