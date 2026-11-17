import test from 'node:test';
import assert from 'node:assert/strict';
import {
  median,
  compareOperatingPeriods,
  summarizeTemperatureLimit,
  summarizeOperatingReference,
  summarizeRawVmiMode,
  summarizeRawVmiSpeed
} from '../js/modules/analysis.js';

const at = (day, hour = 8) => new Date(2026, 9, day, hour, 0, 0).getTime();

test('median ignore les valeurs non finies sans modifier le tableau source', () => {
  const values = [8, Number.NaN, 2, Number.POSITIVE_INFINITY, 4];
  const before = [...values];

  assert.equal(median(values), 4);
  assert.equal(median([7, 3]), 5);
  assert.equal(median([]), null);
  assert.deepEqual(values, before);
});

test('compareOperatingPeriods compare deux périodes successives à mode et tranche identiques', () => {
  const rows = [
    { t: at(28), vmiModeRaw: 1, debit: 100, rpm: 1000, vmiPwmRaw: 300, motorPressureRaw: 40 },
    { t: at(29), vmiModeRaw: 1, debit: 100, rpm: 1000, vmiPwmRaw: 300, motorPressureRaw: 40 },
    { t: at(4), vmiModeRaw: 1, debit: 120, rpm: 1200, vmiPwmRaw: 320, motorPressureRaw: 44 },
    { t: at(5), vmiModeRaw: 1, debit: 120, rpm: 1200, vmiPwmRaw: 320, motorPressureRaw: 44 }
  ];

  const result = compareOperatingPeriods(rows, { periodDays: 7, minSamples: 2, minDays: 2 });
  const comparison = result.comparisons.find(item => item.mode === 1 && item.bucket === 1);

  assert.equal(result.status, 'comparison-available');
  assert.equal(result.comparableCount, 1);
  assert.ok(comparison);
  assert.equal(comparison.comparable, true);
  assert.equal(comparison.previous.sampleCount, 2);
  assert.equal(comparison.current.sampleCount, 2);
  assert.equal(comparison.previous.values.debit.median, 100);
  assert.equal(comparison.current.values.debit.median, 120);
  assert.equal(comparison.deltas.debit.absolute, 20);
  assert.equal(comparison.deltas.debit.relativePercent, 20);
  assert.equal(comparison.deltas.debit.unit, 'm³/h');
  assert.match(result.limits.join(' '), /ne prouve pas un encrassement/);
});

test('compareOperatingPeriods ne produit pas de delta sans couverture suffisante', () => {
  const rows = [
    { t: at(28), vmiModeRaw: 1, debit: 100 },
    { t: at(4), vmiModeRaw: 1, debit: 120 }
  ];

  const result = compareOperatingPeriods(rows, { periodDays: 7, minSamples: 2, minDays: 2 });
  const comparison = result.comparisons.find(item => item.mode === 1 && item.bucket === 1);

  assert.equal(result.status, 'insufficient-data');
  assert.equal(result.comparableCount, 0);
  assert.equal(comparison.comparable, false);
  assert.deepEqual(comparison.deltas, {});
});

test('summarizeTemperatureLimit compare les mêmes jours au-dessus et sous le seuil', () => {
  const rows = [
    { t: at(1), consTmaxRaw: 20, tExt: 21, vmiModeRaw: 1, debit: 110, rpm: 1100 },
    { t: at(1, 14), consTmaxRaw: 20, tExt: 19, vmiModeRaw: 1, debit: 90, rpm: 900 },
    { t: at(2), consTmaxRaw: 20, tExt: 22, vmiModeRaw: 1, debit: 120, rpm: 1200 },
    { t: at(2, 14), consTmaxRaw: 20, tExt: 18, vmiModeRaw: 1, debit: 80, rpm: 800 },
    { t: at(2, 16), consTmaxRaw: 20, tExt: 1000, vmiModeRaw: 1, debit: 80, rpm: 800 }
  ];

  const result = summarizeTemperatureLimit(rows, { minimumGroupSamples: 2, minimumGroupDays: 2 });
  const threshold = result.thresholds.find(item => item.threshold === 20);
  const mode = threshold.modes.find(item => item.mode === 1);

  assert.equal(result.status, 'available');
  assert.equal(result.inputSampleCount, 5);
  assert.equal(result.eligibleSampleCount, 4);
  assert.equal(result.missingOutdoorTemperatureCount, 1);
  assert.equal(threshold.aboveThresholdCount, 2);
  assert.equal(threshold.atOrBelowThresholdCount, 2);
  assert.equal(mode.sharedDayCount, 2);
  assert.equal(mode.pairedAbove.sampleCount, 2);
  assert.equal(mode.pairedAtOrBelow.sampleCount, 2);
  assert.equal(mode.comparable, true);
  assert.equal(mode.pairedAbove.medianDebit, 115);
  assert.equal(mode.pairedAtOrBelow.medianDebit, 85);
  assert.match(result.limits.join(' '), /ne prouve pas à lui seul/);
});

test('summarizeOperatingReference conserve les groupes bruts et exige plusieurs jours', () => {
  const result = summarizeOperatingReference([
    { t: at(1), vmiModeRaw: 1, debit: 100, rpm: 1000, vmiPwmRaw: 300 },
    { t: at(2), vmiModeRaw: 1, debit: 110, rpm: 1100, vmiPwmRaw: 320 },
    { t: at(2), vmiModeRaw: 2, debit: 130, rpm: 1300 }
  ], { minSamples: 2 });

  assert.equal(result.status, 'reference-available');
  assert.equal(result.groups.length, 2);
  const mode1 = result.groups.find(group => group.mode === 1);
  const mode2 = result.groups.find(group => group.mode === 2);
  assert.equal(mode1.ready, true);
  assert.equal(mode1.sampleCount, 2);
  assert.equal(mode1.dayCount, 2);
  assert.equal(mode1.fields.find(field => field.key === 'debit').median, 105);
  assert.equal(mode1.fields.find(field => field.key === 'vmiPwmRaw').verified, false);
  assert.equal(mode2.ready, false);
  assert.match(result.limits.join(' '), /aucun code brut n’est converti/);
});

test('summarizeRawVmiMode garde la référence mode 3 distincte des mesures observées', () => {
  const result = summarizeRawVmiMode([
    { vmiModeRaw: 1, debit: 100, volumeRaw: 200 },
    { vmiModeRaw: 1, debit: -5, volumeRaw: 200 },
    { vmiModeRaw: 3, debit: 150, volumeRaw: 300 }
  ]);

  assert.deepEqual(result.map(group => group.mode), [1, 3]);
  assert.equal(result[0].sampleCount, 1);
  assert.equal(result[0].medianDebit, 100);
  assert.equal(result[0].referenceDebit, null);
  assert.equal(result[1].sampleCount, 1);
  assert.equal(result[1].medianDebit, 150);
  assert.equal(result[1].referenceDebit, 184);
  assert.equal(result[1].referenceRenewalRate, 184 / 337);
  assert.equal(result[1].medianRenewalRate, 0.5);
});

test('summarizeRawVmiSpeed résume les codes vitesse sans les convertir en modes manuels', () => {
  const result = summarizeRawVmiSpeed([
    { vmiSpeedRaw: 2, debit: 120 },
    { vmiSpeedRaw: 1, debit: 90 },
    { vmiSpeedRaw: 2, debit: 140 },
    { vmiModeRaw: 3, debit: 180 }
  ]);

  assert.deepEqual(result.map(group => group.code), [1, 2]);
  assert.equal(result[0].sampleCount, 1);
  assert.equal(result[0].medianDebit, 90);
  assert.equal(result[1].sampleCount, 2);
  assert.equal(result[1].medianDebit, 130);
  assert.equal(result[1].minDebit, 120);
  assert.equal(result[1].maxDebit, 140);
});
