import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeStateTelemetry } from '../js/modules/bluetooth-telemetry-chart.js';

const sample = (t, renewal, airflow = Math.round(renewal * 337)) => ({
  t, volumeM3: 337, rawSpeed: 2, renewalRaw: renewal * 1000,
  airChangesPerHour: renewal, airflowM3h: airflow, fixedAirflow: false
});

test('résume les valeurs reçues et les statistiques sans fabriquer de points', () => {
  const result = summarizeStateTelemetry([sample(1000, .36), sample(2000, .45)], 0, 3000);
  assert.equal(result.count, 2);
  assert.equal(result.renewal.min, .36);
  assert.equal(result.renewal.max, .45);
  assert.equal(result.renewal.mean, .405);
  assert.equal(result.gapCount, 0);
});

test('signale les interruptions supérieures à deux heures sans les combler', () => {
  const result = summarizeStateTelemetry([
    sample(1000, .36), sample(1000 + 3 * 3600000, .45), sample(1000 + 4 * 3600000, .4)
  ], 0, 1000 + 4 * 3600000);
  assert.equal(result.count, 3);
  assert.equal(result.gapCount, 1);
  assert.equal(result.longestGapMs, 3 * 3600000);
});

test('filtre la période demandée et exclut les horodatages futurs', () => {
  const now = 10 * 86400000;
  const result = summarizeStateTelemetry([
    sample(now - 40 * 86400000, .2),
    sample(now - 2 * 86400000, .36),
    sample(now + 1000, .5)
  ], 30, now);
  assert.equal(result.count, 1);
  assert.equal(result.records[0].airChangesPerHour, .36);
});
