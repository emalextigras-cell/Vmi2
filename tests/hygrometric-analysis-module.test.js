import test from 'node:test';
import assert from 'node:assert/strict';
import * as compatibility from '../js/modules/analysis.js';
import * as hygrometric from '../js/modules/hygrometric-analysis.js';

test('analysis preserves all public hygrometric exports after extraction', () => {
  for (const name of ['analyzeHygrometricPeriods', 'summarizeDailyTrends', 'analyzeHourlyPatterns', 'detectRapidChanges', 'buildHygrometricDiagnosis']) {
    assert.equal(typeof hygrometric[name], 'function');
    assert.equal(compatibility[name], hygrometric[name]);
  }
});

test('the extracted hygrometric engine does not mutate input rows', () => {
  const rows = [
    { t: 1_800_000_000_000, st: 20, sh: 60, te: 10, he: 40 },
    { t: 1_800_003_600_000, st: 20, sh: 61, te: 10, he: 40 }
  ];
  const before = JSON.stringify(rows);
  hygrometric.analyzeHygrometricPeriods(rows);
  hygrometric.summarizeDailyTrends(rows);
  hygrometric.analyzeHourlyPatterns(rows);
  hygrometric.detectRapidChanges(rows);
  hygrometric.buildHygrometricDiagnosis(rows);
  assert.equal(JSON.stringify(rows), before);
});
