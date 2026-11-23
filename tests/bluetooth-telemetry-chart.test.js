import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeStateTelemetry, summarizeOperatingProfile } from '../js/modules/bluetooth-telemetry-chart.js';

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

test('signale les longs intervalles entre transitions sans les présenter comme des pertes Bluetooth', () => {
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

test('filtre précisément le jour sélectionné', () => {
  const start = new Date('2026-11-10T00:00:00').getTime();
  const result = summarizeStateTelemetry([
    sample(start - 1, .2),
    sample(start + 12 * 3600000, .36),
    sample(start + 86400000, .5)
  ], 30, start + 2 * 86400000, '2026-11-10');
  assert.equal(result.count, 1);
  assert.equal(result.records[0].airChangesPerHour, .36);
});


test('sépare les trois modes manuels des cinq codes de vitesse VMI+', () => {
  const records = [
    { t: 1000, vmiModeRaw: 1, vmiSpeedRaw: 3 },
    { t: 2000, vmiModeRaw: 1, vmiSpeedRaw: 4 },
    { t: 3000, vmiModeRaw: 2, vmiSpeedRaw: 3 },
    { t: 4000, vmiModeRaw: 2, vmiSpeedRaw: 5 },
    { t: 5000, vmiModeRaw: 3, vmiSpeedRaw: 1 },
    { t: 6000, vmiModeRaw: 2, vmiSpeedRaw: 0 },
    { t: 7000, vmiModeRaw: null, vmiSpeedRaw: 2 }
  ];
  const result = summarizeOperatingProfile(records, 0, 7000);
  assert.equal(result.sampleCount, 7);
  assert.equal(result.pairedCount, 6);
  assert.equal(result.unclassifiedCount, 1);
  assert.deepEqual(result.modeCounts, { 1: 2, 2: 3, 3: 1 });
  assert.deepEqual(result.speedCounts, { 0: 1, 1: 1, 2: 1, 3: 2, 4: 1, 5: 1 });
  assert.deepEqual(result.matrix.map(row => row.total), [2, 3, 1]);
  assert.equal(result.matrix[0].speeds[3], 1);
  assert.equal(result.matrix[1].speeds[0], 1);
  assert.equal(result.matrix[1].speeds[5], 1);
  assert.equal(result.matrix[2].speeds[1], 1);
});

test('ne déduit jamais le mode manuel à partir du code vitesse et respecte le filtre temporel', () => {
  const start = new Date('2026-11-10T00:00:00').getTime();
  const result = summarizeOperatingProfile([
    { t: start - 1, vmiModeRaw: 3, vmiSpeedRaw: 5 },
    { t: start + 1000, vmiModeRaw: 1, vmiSpeedRaw: 2 },
    { t: start + 86400000, vmiModeRaw: 3, vmiSpeedRaw: 4 }
  ], 30, start + 2 * 86400000, '2026-11-10');
  assert.equal(result.sampleCount, 1);
  assert.deepEqual(result.modeCounts, { 1: 1, 2: 0, 3: 0 });
  assert.equal(result.matrix[0].speeds[2], 1);
  assert.equal(result.matrix[2].total, 0);
});
