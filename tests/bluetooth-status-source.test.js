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
  bytes[34] = 1;
  bytes[43] = 1;
  bytes[44] = 0;
  let checksum = 0;
  for (let i = 2; i < 60; i++) checksum ^= bytes[i];
  bytes[60] = checksum;

  const decoded = decodeVmiNotification(bytes);
  assert.equal(decoded.kind, 'state');
  assert.equal(decoded.rawSpeed, 1);
  assert.equal(decoded.boost, 0);
  assert.equal(decoded.holiday, 1);

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
  assert.equal(cur.boost, 0);
  assert.equal(cur.hol, 1);
  assert.equal(elements.get('sp').textContent, 2);
});
