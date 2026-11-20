import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSeriesBreaks, fillMissing } from '../js/modules/chart-renderer.js';

test('une interruption par trame de remplacement est identifiée sans modifier les points', () => {
  const points = [
    { t: 0, v: 20 },
    { t: 60_000, v: null, blocked: true, reason: 'placeholder' },
    { t: 120_000, v: 21 }
  ];
  const before = JSON.stringify(points);
  const result = analyzeSeriesBreaks(points);
  assert.equal(result.breaks.length, 1);
  assert.deepEqual(result.breaks[0].reasons, ['placeholder']);
  assert.equal(JSON.stringify(points), before);
});

test('les mesures absentes et les valeurs invalides sont distinguées', () => {
  const points = [
    { t: 0, v: 20 },
    { t: 60_000, v: null, blocked: true, reason: 'missing' },
    { t: 120_000, v: 21 },
    { t: 180_000, v: null, blocked: true, reason: 'invalid' },
    { t: 240_000, v: 22 }
  ];
  const result = analyzeSeriesBreaks(points);
  assert.deepEqual(result.breaks.map(item => item.reasons), [
    ['missing'],
    ['invalid']
  ]);
});

test('un intervalle supérieur au seuil adaptatif est identifié comme trou temporel', () => {
  const points = [
    { t: 0, v: 20 },
    { t: 3_600_000, v: 21 },
    { t: 7_200_000, v: 22 },
    { t: 36_000_000, v: 23 }
  ];
  const result = analyzeSeriesBreaks(points);
  assert.equal(result.thresholdMs, 21_600_000);
  assert.equal(result.breaks.length, 1);
  assert.deepEqual(result.breaks[0].reasons, ['time-gap']);
  assert.equal(result.breaks[0].gapMs, 28_800_000);
});

test('un trou temporel et une mesure absente peuvent expliquer la même rupture', () => {
  const points = [
    { t: 0, v: 20 },
    { t: 60_000, v: null, blocked: true, reason: 'missing' },
    { t: 120_000, v: 21 },
    { t: 180_000, v: 21 },
    { t: 14_580_000, v: null, blocked: true, reason: 'invalid' },
    { t: 36_000_000, v: 22 }
  ];
  const result = analyzeSeriesBreaks(points);
  assert.deepEqual(result.breaks.at(-1).reasons, ['time-gap', 'invalid']);
});

test('fillMissing conserve la cause du point bloqué', () => {
  const result = fillMissing([
    { t: 0, v: null, blocked: true, reason: 'placeholder' },
    { t: 1, v: 20 }
  ]);
  assert.equal(result[0].reason, 'placeholder');
  assert.equal(result[0].blocked, true);
  assert.equal(result[1].reason, undefined);
});
