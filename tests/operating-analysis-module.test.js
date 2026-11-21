import test from 'node:test';
import assert from 'node:assert/strict';
import * as compatibility from '../js/modules/analysis.js';
import * as statistics from '../js/modules/statistics.js';
import * as operating from '../js/modules/operating-analysis.js';

test('analysis keeps backward-compatible exports after operating engine extraction', () => {
  assert.equal(compatibility.median, statistics.median);
  for (const name of ['analyzeSpeedLevels', 'analyzeSpeedTimeContext', 'compareOperatingPeriods', 'summarizeOperatingReference', 'summarizeRawVmiMode', 'summarizeRawVmiSpeed']) {
    assert.equal(compatibility[name], operating[name]);
    assert.equal(typeof operating[name], 'function');
  }
});

test('median preserves finite-value filtering and even-sample behavior', () => {
  assert.equal(statistics.median([1, 3, 5]), 3);
  assert.equal(statistics.median([1, 3, 5, 7]), 4);
  assert.equal(statistics.median([1, NaN, Infinity]), 1);
  assert.equal(statistics.median([]), null);
});
