import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeHygrometricPeriods,
  buildHygrometricDiagnosis,
  summarizeDailyTrends,
  summarizeTemperatureLimit
} from '../js/modules/analysis.js';
import { analyzeSeasonalVentilation } from '../js/modules/seasonal-advice.js';

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const start = Date.UTC(2026, 0, 1);

function baseRow(index) {
  return {
    t: start + index * HOUR,
    st: 20, sh: 50, te: 10, he: 60,
    tExt: 10, t1: 12, h1: 90
  };
}

test('le diagnostic hygrométrique exclut les remplacements 20/50 et les pics isolés', () => {
  const history = Array.from({ length: 26 }, (_, index) => baseRow(index));
  history.push(
    { ...baseRow(26), t: start + 26 * HOUR },
    { ...baseRow(26), t: start + 26 * HOUR + 5 * MINUTE, st: 40 },
    { ...baseRow(26), t: start + 26 * HOUR + 10 * MINUTE }
  );
  history.push({
    t: start + 27 * HOUR,
    st: 20, sh: 50, t1: 20, h1: 50, te: 20, he: 50, tExt: 20
  });

  const result = buildHygrometricDiagnosis(history);

  assert.equal(result.inputQuality.inputSampleCount, 30);
  assert.equal(result.inputQuality.placeholderSensorRecordCount, 1);
  assert.equal(result.inputQuality.transientSpikeRecordCount, 1);
  assert.equal(result.sampleCount, 28);
  assert.equal(result.inputQuality.excludedSampleCount, 2);
});

test('les périodes hygrométriques et tendances ignorent les relevés de remplacement', () => {
  const rows = [
    { ...baseRow(0) },
    {
      ...baseRow(1),
      st: 20, sh: 50, t1: 20, h1: 50, te: 20, he: 50, tExt: 20
    },
    { ...baseRow(2) }
  ];

  const periods = analyzeHygrometricPeriods(rows);
  const trends = summarizeDailyTrends(rows);

  assert.equal(periods.sampleCount, 2);
  assert.equal(trends.days[0].sampleCount, 2);
});

test('l’analyse saisonnière ignore les relevés de remplacement', () => {
  const rows = [
    { ...baseRow(0), tExt: 5 },
    {
      ...baseRow(1),
      st: 20, sh: 50, t1: 20, h1: 50, te: 20, he: 50, tExt: 20
    },
    { ...baseRow(2), tExt: 5 }
  ];

  const result = analyzeSeasonalVentilation(rows, { minSamples: 1, minDays: 1 });

  assert.equal(result.seasons.find(item => item.season === 'hiver').sampleCount, 2);
});


test('l’analyse de consigne thermique écarte aussi les relevés de remplacement', () => {
  const rows = [
    { ...baseRow(0), consTmaxRaw: 25, tExt: 10, vmiModeRaw: 1, debit: 120 },
    {
      ...baseRow(1),
      st: 20, sh: 50, t1: 20, h1: 50, te: 20, he: 50, tExt: 20,
      consTmaxRaw: 25, vmiModeRaw: 1, debit: 120
    },
    { ...baseRow(2), consTmaxRaw: 25, tExt: 12, vmiModeRaw: 1, debit: 120 }
  ];

  const result = summarizeTemperatureLimit(rows, {
    minimumGroupSamples: 1,
    minimumGroupDays: 1
  });

  assert.equal(result.eligibleSampleCount, 2);
  assert.equal(result.thresholds[0].sampleCount, 2);
});
