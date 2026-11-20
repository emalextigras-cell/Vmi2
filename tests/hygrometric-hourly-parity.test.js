import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHygrometricDiagnosis } from '../js/modules/analysis.js';
import { absoluteHumidity } from '../js/modules/psychrometry.js';

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function dayKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Référence de l'algorithme antérieur, conservée dans le test pour vérifier
// que l'indexation ne change ni la sélection ni les diagnostics exposés.
function legacyHourlyComparison(rows) {
  const buckets = Array.from({ length: 4 }, (_, index) => ({
    label: ['00–05 h', '06–11 h', '12–17 h', '18–23 h'][index],
    startHour: index * 6
  }));
  const hourlyDetails = buckets.map(bucket => {
    const bucketRows = rows.filter(row => Math.floor(new Date(row.t).getHours() / 6) === bucket.startHour / 6);
    const dayKeys = [...new Set(bucketRows.map(row => dayKey(row.t)))];
    return { ...bucket, sampleCount: bucketRows.length, dayCount: dayKeys.length, dayKeys };
  });
  const eligibleHours = hourlyDetails.filter(bucket => bucket.sampleCount >= 5 && bucket.dayCount >= 2);
  const hourlyPairs = [];
  let candidatePairCount = 0;
  let pairsWithTwoCommonDays = 0;
  let pairsMeetingDailyMinimum = 0;

  for (let i = 0; i < eligibleHours.length; i++) {
    for (let j = i + 1; j < eligibleHours.length; j++) {
      const left = eligibleHours[i], right = eligibleHours[j];
      candidatePairCount++;
      const commonDayKeys = left.dayKeys.filter(day => right.dayKeys.includes(day));
      if (commonDayKeys.length >= 2) pairsWithTwoCommonDays++;
      const sharedDayKeys = commonDayKeys.filter(day => [left, right].every(bucket =>
        rows.filter(row =>
          Math.floor(new Date(row.t).getHours() / 6) === Math.floor(bucket.startHour / 6) &&
          dayKey(row.t) === day
        ).length >= 3
      ));
      if (sharedDayKeys.length < 2) continue;
      pairsMeetingDailyMinimum++;
      const pairedStats = [left, right].map(bucket => {
        const daily = sharedDayKeys.map(day => {
          const daySamples = rows.filter(row =>
            Math.floor(new Date(row.t).getHours() / 6) === Math.floor(bucket.startHour / 6) &&
            dayKey(row.t) === day
          );
          return {
            day,
            sampleCount: daySamples.length,
            medianDelta: median(daySamples.map(row =>
              absoluteHumidity(row.st, row.sh) - absoluteHumidity(row.te, row.he)
            ))
          };
        });
        return {
          ...bucket,
          medianDelta: median(daily.map(item => item.medianDelta)),
          sampleCount: daily.reduce((total, item) => total + item.sampleCount, 0),
          dayCount: sharedDayKeys.length
        };
      });
      if (pairedStats.some(item => item.sampleCount < 5 || item.medianDelta == null)) continue;
      const [a, b] = pairedStats;
      const winner = a.medianDelta >= b.medianDelta ? a : b;
      const comparator = winner === a ? b : a;
      hourlyPairs.push({
        ...winner,
        comparisonWindow: comparator.label,
        comparisonMedianDelta: comparator.medianDelta,
        comparisonSampleCount: comparator.sampleCount,
        sharedDayCount: sharedDayKeys.length,
        sharedDayKeys,
        aggregationMethod: 'Médiane des médianes journalières, avec un poids égal par date',
        advantage: winner.medianDelta - comparator.medianDelta
      });
    }
  }
  const bestWindow = hourlyPairs.length
    ? [...hourlyPairs].sort((a, b) =>
      b.medianDelta - a.medianDelta ||
      b.advantage - a.advantage ||
      b.sharedDayCount - a.sharedDayCount
    )[0]
    : null;
  let reason = null;
  if (!bestWindow) {
    if (eligibleHours.length < 2) {
      reason = 'Moins de deux tranches horaires disposent chacune d’au moins cinq relevés répartis sur deux jours.';
    } else if (candidatePairCount > 0 && pairsWithTwoCommonDays === 0) {
      reason = 'Les tranches horaires candidates ne partagent pas au moins deux mêmes jours calendaires.';
    } else if (pairsWithTwoCommonDays > 0 && pairsMeetingDailyMinimum === 0) {
      reason = 'Des jours sont communs, mais chaque paire échoue au minimum de trois relevés dans chaque tranche et pour chaque jour commun.';
    } else {
      reason = 'Aucune paire ne satisfait l’ensemble des critères de validité des mesures horaires.';
    }
  }
  return {
    bestWindow,
    diagnostics: {
      candidateWindowCount: eligibleHours.length,
      candidatePairCount,
      pairsWithTwoCommonDays,
      pairsMeetingDailyMinimum,
      minimumSamplesPerWindow: 5,
      minimumDistinctDaysPerWindow: 2,
      minimumSharedDays: 2,
      minimumSamplesPerWindowAndDay: 3,
      reason
    }
  };
}

function makeScenario(seed, dayCount, bucketCounts) {
  const rows = [];
  for (let day = 0; day < dayCount; day++) {
    for (let bucket = 0; bucket < 4; bucket++) {
      const count = bucketCounts[(day + bucket + seed) % bucketCounts.length];
      for (let sample = 0; sample < count; sample++) {
        const hour = bucket * 6 + Math.floor(sample / 2);
        const minute = (sample % 2) * 30;
        rows.push({
          t: new Date(2026, 10, 1 + day, hour, minute).getTime(),
          st: 19 + ((seed + day + sample) % 5) * 0.4,
          sh: 48 + ((seed * 3 + day * 7 + bucket * 5 + sample) % 24),
          te: 7 + ((seed + bucket) % 8) * 0.5,
          he: 35 + ((day * 11 + bucket * 9 + sample * 3 + seed) % 45)
        });
      }
    }
  }
  return rows;
}

test('l’index horaire conserve exactement les résultats de l’algorithme historique', () => {
  const scenarios = [
    makeScenario(1, 5, [2, 3, 4, 6]),
    makeScenario(2, 7, [3, 3, 5, 8, 11]),
    makeScenario(3, 4, [0, 2, 3, 5, 9]),
    makeScenario(4, 9, [1, 3, 6, 7, 12]),
    makeScenario(5, 6, [3, 4, 5, 10])
  ];

  for (const rows of scenarios) {
    const actual = buildHygrometricDiagnosis(rows);
    const expected = legacyHourlyComparison(rows);
    assert.deepEqual(actual.bestWindow, expected.bestWindow);
    assert.deepEqual(actual.hourlyComparisonDiagnostics, expected.diagnostics);
  }
});
