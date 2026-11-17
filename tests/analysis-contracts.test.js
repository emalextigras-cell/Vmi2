import test from 'node:test';
import assert from 'node:assert/strict';
import {
  median,
  analyzeHourlyPatterns,
  detectRapidChanges,
  compareOperatingPeriods,
  analyzeSpeedTimeContext,
  analyzeSpeedLevels,
  summarizeTemperatureLimit,
  summarizeOperatingReference,
  summarizeRawVmiMode,
  summarizeRawVmiSpeed,
  summarizeEnergyReadiness,
  summarizeDailyTrends,
  buildHygrometricDiagnosis
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
    { t: at(4), vmiModeRaw: 1, debit: 100, rpm: 1000, vmiPwmRaw: 300, motorPressureRaw: 40 },
    { t: at(5), vmiModeRaw: 1, debit: 100, rpm: 1000, vmiPwmRaw: 300, motorPressureRaw: 40 },
    { t: at(11), vmiModeRaw: 1, debit: 120, rpm: 1200, vmiPwmRaw: 320, motorPressureRaw: 44 },
    { t: at(12), vmiModeRaw: 1, debit: 120, rpm: 1200, vmiPwmRaw: 320, motorPressureRaw: 44 }
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


test('compareOperatingPeriods ignore les horodatages numériques hors plage JavaScript',()=>{
  const validTimestamp=at(12);
  const rows=[
    {t:validTimestamp,vmiModeRaw:1,debit:120},
    {t:8.64e15+1,vmiModeRaw:1,debit:999}
  ];

  const result=compareOperatingPeriods(rows,{periodDays:7,minSamples:1,minDays:1});

  assert.equal(result.periods.length,2);
  assert.ok(result.periods.every(period=>
    Number.isFinite(period.startMs)&&Number.isFinite(period.endMs)&&
    !period.start.includes('NaN')&&!period.end.includes('NaN')
  ));
  assert.equal(result.periods[1].end,'2026-10-12');
  assert.ok(result.comparisons.every(item=>
    item.previous.sampleCount+item.current.sampleCount<=1
  ));
});

test('compareOperatingPeriods retourne no-mode-data si toutes les dates sont invalides',()=>{
  const result=compareOperatingPeriods([
    {t:8.64e15+1,vmiModeRaw:1,debit:120},
    {t:-8.64e15-1,vmiModeRaw:2,debit:140}
  ]);

  assert.equal(result.status,'no-mode-data');
  assert.deepEqual(result.periods,[]);
  assert.deepEqual(result.comparisons,[]);
});


test('compareOperatingPeriods rejette les paramètres de comparaison invalides',()=>{
  for(const options of [
    {periodDays:0},
    {periodDays:-1},
    {periodDays:1.5},
    {minSamples:0},
    {minSamples:2.5},
    {minDays:-1},
    {minDays:Infinity}
  ]){
    assert.throws(
      ()=>compareOperatingPeriods([{t:at(12),vmiModeRaw:1,debit:100}],options),
      RangeError
    );
  }
});

test('compareOperatingPeriods conserve les paramètres par défaut et accepte des entiers positifs',()=>{
  const defaults=compareOperatingPeriods([]);
  assert.equal(defaults.periodDays,7);
  assert.equal(defaults.minSamples,12);
  assert.equal(defaults.minDays,3);

  const custom=compareOperatingPeriods([],{periodDays:2,minSamples:1,minDays:1});
  assert.equal(custom.periodDays,2);
  assert.equal(custom.minSamples,1);
  assert.equal(custom.minDays,1);
});


test('analyzeSpeedTimeContext rejette les paramètres de comparaison invalides', () => {
  for (const options of [
    { minSamples: 0 },
    { minSamples: -1 },
    { minSamples: 1.5 },
    { minDays: 0 },
    { minDays: -1 },
    { minDays: 2.5 },
    { minDays: Infinity }
  ]) {
    assert.throws(
      () => analyzeSpeedTimeContext([], options),
      RangeError
    );
  }
});

test('analyzeSpeedTimeContext ne déclare pas comparables des groupes vides avec les seuils par défaut', () => {
  const result = analyzeSpeedTimeContext([]);

  assert.equal(result.comparisons.some(comparison => comparison.ready), false);
});

test('analyzeSpeedTimeContext conserve ses seuils par défaut et accepte des entiers positifs', () => {
  const defaults = analyzeSpeedTimeContext([]);
  assert.equal(defaults.minSamples, 5);
  assert.equal(defaults.minDays, 2);

  const custom = analyzeSpeedTimeContext([], { minSamples: 1, minDays: 1 });
  assert.equal(custom.minSamples, 1);
  assert.equal(custom.minDays, 1);
});


test('analyzeSpeedLevels rejette un minimum de mesures invalide', () => {
  for (const minSamples of [0, -1, 1.5, Infinity, NaN]) {
    assert.throws(
      () => analyzeSpeedLevels([], minSamples),
      RangeError
    );
  }
});

test('analyzeSpeedLevels conserve son seuil par défaut et accepte un entier positif', () => {
  const defaults = analyzeSpeedLevels([]);
  assert.equal(defaults.minSamples, 10);

  const custom = analyzeSpeedLevels([], 1);
  assert.equal(custom.minSamples, 1);
  assert.equal(custom.status, 'no-speed-data');
});


test('summarizeOperatingReference rejette un minimum de mesures invalide', () => {
  for (const minSamples of [0, -1, 1.5, Infinity, NaN]) {
    assert.throws(
      () => summarizeOperatingReference([], { minSamples }),
      RangeError
    );
  }
});

test('summarizeOperatingReference conserve le minimum par défaut et accepte un entier positif', () => {
  assert.equal(summarizeOperatingReference([]).minSamples, 10);
  assert.equal(summarizeOperatingReference([], { minSamples: 1 }).minSamples, 1);
});


test('summarizeTemperatureLimit rejette des seuils de couverture invalides', () => {
  for (const options of [
    { minimumGroupSamples: 0 },
    { minimumGroupSamples: -1 },
    { minimumGroupSamples: 1.5 },
    { minimumGroupDays: 0 },
    { minimumGroupDays: -1 },
    { minimumGroupDays: 2.5 },
    { minimumGroupDays: Infinity }
  ]) {
    assert.throws(
      () => summarizeTemperatureLimit([], options),
      RangeError
    );
  }
});

test('summarizeTemperatureLimit conserve ses seuils par défaut et accepte des entiers positifs', () => {
  const defaults = summarizeTemperatureLimit([]);
  assert.equal(defaults.minimumGroupSamples, 5);
  assert.equal(defaults.minimumGroupDays, 2);

  const custom = summarizeTemperatureLimit([], {
    minimumGroupSamples: 1,
    minimumGroupDays: 1
  });
  assert.equal(custom.minimumGroupSamples, 1);
  assert.equal(custom.minimumGroupDays, 1);
});


test('analyzeHourlyPatterns rejette un minimum de mesures invalide', () => {
  for (const minSamples of [0, -1, 1.5, Infinity, NaN]) {
    assert.throws(
      () => analyzeHourlyPatterns([], minSamples),
      RangeError
    );
  }
});

test('analyzeHourlyPatterns conserve son seuil par défaut et accepte un entier positif', () => {
  assert.equal(analyzeHourlyPatterns([]).minSamples, 3);
  assert.equal(analyzeHourlyPatterns([], 1).minSamples, 1);
});


test('detectRapidChanges rejette des seuils invalides', () => {
  for (const options of [
    { maxGapHours: 0 },
    { maxGapHours: -1 },
    { maxGapHours: Infinity },
    { maxGapHours: NaN },
    { rhJump: 0 },
    { rhJump: -1 },
    { rhJump: Infinity },
    { absoluteHumidityJump: 0 },
    { absoluteHumidityJump: -1 },
    { absoluteHumidityJump: NaN }
  ]) {
    assert.throws(
      () => detectRapidChanges([], options),
      RangeError
    );
  }
});

test('detectRapidChanges conserve ses seuils par défaut et accepte des seuils positifs', () => {
  assert.deepEqual(detectRapidChanges([]), []);
  assert.deepEqual(detectRapidChanges([], {
    maxGapHours: 1,
    rhJump: 5,
    absoluteHumidityJump: 1
  }), []);
});


test('analyzeHourlyPatterns ignore les horodatages hors plage JavaScript', () => {
  const invalidTimestamp = {
    t: 8640000000000001,
    st: 20,
    sh: 50,
    te: 10,
    he: 60
  };

  const result = analyzeHourlyPatterns([invalidTimestamp]);

  assert.equal(result.buckets.reduce((sum, bucket) => sum + bucket.sampleCount, 0), 0);
  assert.ok(result.buckets.every(bucket => bucket.medianRH === null && bucket.medianDelta === null));
});


test('summarizeTemperatureLimit ignore les horodatages hors plage JavaScript', () => {
  const rows = [
    { t: 8640000000000001, consTmaxRaw: 20, tExt: 21, vmiModeRaw: 1, debit: 110, rpm: 1100 },
    { t: 8640000000000001, consTmaxRaw: 20, tExt: 19, vmiModeRaw: 1, debit: 90, rpm: 900 }
  ];

  const result = summarizeTemperatureLimit(rows, {
    minimumGroupSamples: 1,
    minimumGroupDays: 1
  });
  assert.equal(result.eligibleSampleCount, 0);
  assert.equal(result.thresholds.length, 0);
});


test('analyzeSpeedLevels exclut les dates hors plage des indicateurs calendaires', () => {
  const result = analyzeSpeedLevels([{
    t: 8640000000000001,
    vmiModeRaw: 1,
    st: 20,
    sh: 50
  }], 1);
  const mode1 = result.groups.find(group => group.v === 1);

  assert.equal(mode1.n, 1);
  assert.equal(mode1.daysCovered, 0);
  assert.equal(mode1.firstAt, null);
  assert.equal(mode1.lastAt, null);
});


test('summarizeDailyTrends ignore les horodatages hors plage JavaScript', () => {
  const result = summarizeDailyTrends([
    { t: 8640000000000001, st: 20, sh: 50 },
    { t: at(12), st: 20, sh: 50 },
    { t: at(12, 10), st: 21, sh: 52 },
    { t: at(12, 12), st: 19, sh: 48 }
  ]);

  assert.equal(result.days.length, 1);
  assert.equal(result.days[0].date, '2026-10-12');
  assert.equal(result.days[0].sampleCount, 3);
  assert.equal(result.sampledDays, 1);
});


test('summarizeOperatingReference ignore les dates hors plage dans ses indicateurs calendaires', () => {
  const result = summarizeOperatingReference([
    { t: 8640000000000001, vmiModeRaw: 1, debit: 100 }
  ]);
  const group = result.groups.find(item => item.mode === 1);

  assert.equal(group.sampleCount, 1);
  assert.equal(group.dayCount, 0);
  assert.equal(group.firstAt, null);
  assert.equal(group.lastAt, null);
  assert.equal(group.ready, false);
});


test('detectRapidChanges ignore les horodatages hors plage JavaScript', () => {
  const boundaryTimestamp = 8640000000000000;
  const result = detectRapidChanges([
    { t: boundaryTimestamp, st: 20, sh: 40 },
    { t: boundaryTimestamp + 1, st: 20, sh: 60 }
  ]);

  assert.deepEqual(result, []);
});


test('median conserve une médiane finie pour des valeurs finies proches de Number.MAX_VALUE', () => {
  assert.equal(median([Number.MAX_VALUE, Number.MAX_VALUE]), Number.MAX_VALUE);
});


test('summarizeRawVmiSpeed exclut les débits négatifs comme summarizeRawVmiMode', () => {
  const result = summarizeRawVmiSpeed([
    { vmiSpeedRaw: 2, debit: 120 },
    { vmiSpeedRaw: 2, debit: -50 },
    { vmiSpeedRaw: 2, debit: 140 }
  ]);

  assert.equal(result[0].sampleCount, 2);
  assert.equal(result[0].medianDebit, 130);
  assert.equal(result[0].minDebit, 120);
  assert.equal(result[0].maxDebit, 140);
});


test('summarizeOperatingReference exclut les débits négatifs des statistiques de débit', () => {
  const result = summarizeOperatingReference([
    { t: at(1), vmiModeRaw: 1, debit: 100 },
    { t: at(2), vmiModeRaw: 1, debit: -20 }
  ], { minSamples: 1 });
  const debit = result.groups[0].fields.find(field => field.key === 'debit');

  assert.equal(debit.count, 1);
  assert.equal(debit.median, 100);
  assert.equal(debit.min, 100);
  assert.equal(debit.max, 100);
});


test('summarizeDailyTrends ne compte qu une observation par horodatage', () => {
  const timestamp = at(12);
  const result = summarizeDailyTrends([
    { t: timestamp, st: 20, sh: 50 },
    { t: timestamp, st: 21, sh: 52 },
    { t: timestamp, st: 22, sh: 54 }
  ]);

  assert.equal(result.days.length, 1);
  assert.equal(result.days[0].sampleCount, 1);
  assert.equal(result.sampledDays, 0);
  assert.equal(result.latest, null);
});


test('compareOperatingPeriods ne compte pas deux fois un même horodatage et un même mode', () => {
  const timestamp = at(12, 8);
  const result = compareOperatingPeriods([
    { t: timestamp, vmiModeRaw: 1, debit: 100 },
    { t: timestamp, vmiModeRaw: 1, debit: 140 }
  ], { periodDays: 7, minSamples: 1, minDays: 1 });
  const comparison = result.comparisons.find(item => item.mode === 1 && item.bucket === 1);

  assert.equal(comparison.current.sampleCount, 1);
  assert.equal(comparison.current.values.debit.count, 1);
  assert.equal(comparison.current.values.debit.median, 140);
});


test('analyzeSpeedTimeContext dédoublonne les observations par mode et horodatage', () => {
  const timestamp = at(12, 8);
  const result = analyzeSpeedTimeContext([
    { t: timestamp, vmiModeRaw: 1, st: 20, sh: 50, te: 10, he: 60 },
    { t: timestamp, vmiModeRaw: 1, st: 20, sh: 70, te: 10, he: 60 },
    { t: at(12, 9), vmiModeRaw: 2, st: 20, sh: 60, te: 10, he: 60 }
  ], { minSamples: 1, minDays: 1 });
  const comparison = result.comparisons.find(item => item.bucket === 1 && item.speeds[0] === 1 && item.speeds[1] === 2);

  assert.equal(comparison.sampleCountFirst, 1);
  assert.equal(comparison.first.medianRH, 70);
  assert.equal(comparison.ready, true);
});


test('analyzeHourlyPatterns ne compte qu une observation par horodatage', () => {
  const timestamp = at(12, 8);
  const result = analyzeHourlyPatterns([
    { t: timestamp, st: 20, sh: 50, te: 10, he: 60 },
    { t: timestamp, st: 20, sh: 60, te: 10, he: 60 },
    { t: timestamp, st: 20, sh: 70, te: 10, he: 60 }
  ], 3);
  const morning = result.buckets[1];

  assert.equal(morning.sampleCount, 1);
  assert.equal(morning.medianRH, null);
  assert.equal(morning.medianDelta, null);
});


test('summarizeTemperatureLimit ne compte pas deux fois un même mode et horodatage', () => {
  const timestamp = at(12);
  const result = summarizeTemperatureLimit([
    { t: timestamp, vmiModeRaw: 1, consTmaxRaw: 20, tExt: 22, debit: 100 },
    { t: timestamp, vmiModeRaw: 1, consTmaxRaw: 20, tExt: 23, debit: 110 },
    { t: timestamp, vmiModeRaw: 1, consTmaxRaw: 20, tExt: 24, debit: 120 }
  ], { minimumGroupSamples: 1, minimumGroupDays: 1 });
  const threshold = result.thresholds.find(item => item.threshold === 20);

  assert.equal(result.eligibleSampleCount, 1);
  assert.equal(threshold.aboveThresholdCount, 1);
  assert.equal(threshold.above.sampleCount, 1);
  assert.equal(threshold.above.medianOutdoorTemp, 24);
});


test('summarizeEnergyReadiness traite les historiques volumineux sans erreur de dépassement d arguments', () => {
  const rows = Array.from({ length: 200000 }, () => ({ rpm: 1200 }));
  const result = summarizeEnergyReadiness(rows);
  const rpm = result.fields.find(field => field.key === 'rpm');

  assert.equal(rpm.count, 200000);
  assert.equal(rpm.min, 1200);
  assert.equal(rpm.max, 1200);
});


test('analyzeSpeedLevels résume un historique volumineux sans dépassement de pile', () => {
  const start = Date.UTC(2020, 0, 1);
  const rows = Array.from({ length: 200000 }, (_, index) => ({
    t: start + index * 60000,
    vmiModeRaw: 1,
    st: 20,
    sh: 50
  }));
  const result = analyzeSpeedLevels(rows, 1);
  const mode1 = result.groups.find(group => group.v === 1);

  assert.equal(mode1.n, 200000);
  assert.equal(mode1.firstAt, start);
  assert.equal(mode1.lastAt, start + 199999 * 60000);
  assert.equal(mode1.spanHours, (199999 * 60000) / 3600000);
});


test('summarizeOperatingReference résume un historique volumineux sans dépassement de pile', () => {
  const timestamp = Date.UTC(2026, 0, 1);
  const rows = Array.from({ length: 200000 }, (_, index) => ({
    t: timestamp + index * 60000,
    vmiModeRaw: 1,
    debit: 100
  }));
  const result = summarizeOperatingReference(rows);
  const mode1 = result.groups.find(group => group.mode === 1);
  const debit = mode1.fields.find(field => field.key === 'debit');

  assert.equal(debit.count, 200000);
  assert.equal(debit.min, 100);
  assert.equal(debit.max, 100);
  assert.equal(mode1.firstAt, timestamp);
  assert.equal(mode1.lastAt, timestamp + 199999 * 60000);
});


test('summarizeRawVmiMode résume un historique volumineux sans dépassement de pile', () => {
  const rows = Array.from({ length: 200000 }, () => ({
    vmiModeRaw: 1,
    debit: 100,
    volumeRaw: 200
  }));
  const result = summarizeRawVmiMode(rows);
  const mode1 = result.find(group => group.mode === 1);

  assert.equal(mode1.sampleCount, 200000);
  assert.equal(mode1.minDebit, 100);
  assert.equal(mode1.maxDebit, 100);
});


test('summarizeRawVmiSpeed résume un historique volumineux sans dépassement de pile', () => {
  const rows = Array.from({ length: 200000 }, () => ({
    vmiSpeedRaw: 1,
    debit: 100
  }));
  const result = summarizeRawVmiSpeed(rows);
  const speed1 = result.find(group => group.code === 1);

  assert.equal(speed1.sampleCount, 200000);
  assert.equal(speed1.minDebit, 100);
  assert.equal(speed1.maxDebit, 100);
});


test('buildHygrometricDiagnosis résume de nombreux intervalles exclus sans dépassement de pile', () => {
  const start = Date.UTC(2026, 0, 1);
  const rows = Array.from({ length: 130000 }, (_, index) => ({
    t: start + index * 60000,
    st: 20,
    sh: 50,
    te: 10,
    he: 60
  }));
  const result = buildHygrometricDiagnosis(rows, { minSamples: 1, maxGapHours: 0.0001 });

  assert.equal(result.excludedGapCount, 129999);
  assert.equal(result.largestExcludedGapHours, 1 / 60);
});


test('analyzeSpeedLevels ne compte pas deux fois un même mode et horodatage', () => {
  const timestamp = at(15, 8);
  const result = analyzeSpeedLevels([
    { t: timestamp, vmiModeRaw: 1, st: 20, sh: 40, rpm: 1000 },
    { t: timestamp, vmiModeRaw: 1, st: 20, sh: 60, rpm: 1200 },
    { t: at(15, 9), vmiModeRaw: 1, st: 20, sh: 50, rpm: 1100 }
  ], 3);
  const mode1 = result.groups.find(group => group.v === 1);

  assert.equal(mode1.n, 2);
  assert.equal(mode1.rh, 55);
  assert.equal(mode1.rpm, 1150);
  assert.equal(result.status, 'insufficient');
});


test('detectRapidChanges ne compare que la dernière observation valide de chaque horodatage', () => {
  const first = at(16, 8);
  const second = at(16, 9);
  const result = detectRapidChanges([
    { t: first, st: 20, sh: 50 },
    { t: second, st: 20, sh: 90 },
    { t: second, st: 20, sh: 50 }
  ]);

  assert.deepEqual(result, []);
});


test('summarizeOperatingReference ne pondère pas deux fois un même mode et horodatage', () => {
  const timestamp = at(17, 8);
  const result = summarizeOperatingReference([
    { t: timestamp, vmiModeRaw: 1, debit: 100 },
    { t: timestamp, vmiModeRaw: 1, debit: 300 },
    { t: at(18, 8), vmiModeRaw: 1, debit: 110 }
  ], { minSamples: 2 });
  const mode1 = result.groups.find(group => group.mode === 1);
  const debit = mode1.fields.find(field => field.key === 'debit');

  assert.equal(mode1.sampleCount, 2);
  assert.equal(mode1.dayCount, 2);
  assert.equal(debit.count, 2);
  assert.equal(debit.median, 205);
  assert.equal(mode1.ready, true);
});


test('summarizeRawVmiMode ne compte pas deux fois un même mode et horodatage', () => {
  const timestamp = at(19, 8);
  const result = summarizeRawVmiMode([
    { t: timestamp, vmiModeRaw: 1, debit: 100, volumeRaw: 200 },
    { t: timestamp, vmiModeRaw: 1, debit: 300, volumeRaw: 300 },
    { t: at(20, 8), vmiModeRaw: 1, debit: 120, volumeRaw: 240 }
  ]);
  const mode1 = result.find(group => group.mode === 1);

  assert.equal(mode1.sampleCount, 2);
  assert.equal(mode1.medianDebit, 210);
  assert.equal(mode1.medianRenewalRate, 0.75);
});


test('summarizeRawVmiSpeed ne compte pas deux fois un même code vitesse et horodatage', () => {
  const timestamp = at(21, 8);
  const result = summarizeRawVmiSpeed([
    { t: timestamp, vmiSpeedRaw: 1, debit: 100 },
    { t: timestamp, vmiSpeedRaw: 1, debit: 300 },
    { t: at(22, 8), vmiSpeedRaw: 1, debit: 120 }
  ]);
  const speed1 = result.find(group => group.code === 1);

  assert.equal(speed1.sampleCount, 2);
  assert.equal(speed1.medianDebit, 210);
});
