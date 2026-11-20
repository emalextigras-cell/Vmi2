import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { buildHygrometricDiagnosis } from '../js/modules/analysis.js';

test('benchmark temporaire buildHygrometricDiagnosis', () => {
  const sizes = [800, 5000, 20000, 60000];
  const results = [];
  const start = new Date(2024, 0, 1).getTime();

  for (const size of sizes) {
    const rows = Array.from({ length: size }, (_, i) => {
      const t = start + i * 15 * 60 * 1000;
      return {
        t,
        st: 19 + Math.sin(i / 96) * 2,
        sh: 58 + Math.sin(i / 31) * 8,
        te: 8 + Math.sin(i / 130) * 4,
        he: 78 + Math.cos(i / 37) * 10
      };
    });

    const durations = [];
    const repetitions = size >= 20000 ? 2 : 3;
    for (let run = 0; run < repetitions; run++) {
      const before = performance.now();
      const result = buildHygrometricDiagnosis(rows);
      durations.push(performance.now() - before);
      assert.equal(result.sampleCount, size);
    }
    durations.sort((a, b) => a - b);
    const medianMs = durations[Math.floor(durations.length / 2)];
    results.push({ samples: size, medianMs: Number(medianMs.toFixed(2)), repetitions });
  }

  console.log('BENCHMARK_HYGROMETRIC_RESULTS=' + JSON.stringify(results));
});
