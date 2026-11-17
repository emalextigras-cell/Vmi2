/** Compare les estimations énergétiques par niveau manuel.
 * @param {VmiRecord[]} history Historique horodaté avec modes manuels.
 * @param {{maxGapHours?: number, minDays?: number}} [options] Seuils d'intégration et de couverture.
 * @returns {UnknownRecord} Résultats descriptifs par mode manuel.
 */
export function summarizeFanEnergyByManualMode(history, options = {}) {
  const { maxGapHours = 2, minDays = 2 } = options ?? {};
  assertValidEnergyOptions(maxGapHours, minDays);
  const rows = (Array.isArray(history) ? history : [])
    .filter(row => Number.isFinite(row?.t))
    .sort((a, b) => a.t - b.t);
  const deduplicated=deduplicateByRelevantValues(rows,row=>[
    row.t,row.debit,row.vmiModeRaw,row.st,row.sh,row.te,row.he,row.tExt
  ]);
  const unique=deduplicated.rows;
  const groups = [1, 2, 3].map(mode => ({
    mode, energyWh: 0, coveredMs: 0, candidateMs: 0,
    intervalCount: 0, longGapCount: 0, invalidFlowIntervalCount: 0,
    climate: Object.fromEntries(['indoorTemp','outdoorTemp','incomingTemp','indoorAbsHumidity','incomingAbsHumidity','deltaAbsHumidity'].map(key => [key, { sum: 0, hours: 0 }])),
    daily: new Map()
  }));
  const byMode = new Map(groups.map(group => [group.mode, group]));
  const maxGapMs = maxGapHours * 3600000;
  let transitionIntervalCount = 0;
  for (let index = 1; index < unique.length; index++) {
    const a = unique[index - 1], b = unique[index];
    const elapsedMs = b.t - a.t;
    if (!(elapsedMs > 0)) continue;
    const mode = a.vmiModeRaw;
    if (![1, 2, 3].includes(mode) || b.vmiModeRaw !== mode) {
      if ([1, 2, 3].includes(mode) || [1, 2, 3].includes(b.vmiModeRaw)) transitionIntervalCount++;
      continue;
    }
    const group = byMode.get(mode);
    group.candidateMs += elapsedMs;
    if (elapsedMs > maxGapMs) { group.longGapCount++; continue; }
    const powerA = estimateFanPowerFromFlow(a.debit);
    const powerB = estimateFanPowerFromFlow(b.debit);
    if (powerA == null || powerB == null) { group.invalidFlowIntervalCount++; continue; }
    const hours = elapsedMs / 3600000;
    const wh = ((powerA + powerB) / 2) * hours;
    group.energyWh += wh;
    group.coveredMs += elapsedMs;
    group.intervalCount++;
    const climateValues = row => {
      const temp = value => Number.isFinite(value) && value >= -30 && value <= 60;
      const rh = value => Number.isFinite(value) && value >= 0 && value <= 100;
      const indoorAbsHumidity = temp(row.st) && rh(row.sh) ? absoluteHumidity(row.st, row.sh) : null;
      const incomingAbsHumidity = temp(row.te) && rh(row.he) ? absoluteHumidity(row.te, row.he) : null;
      return {
        indoorTemp: temp(row.st) ? row.st : null,
        outdoorTemp: temp(row.tExt) ? row.tExt : null,
        incomingTemp: temp(row.te) ? row.te : null,
        indoorAbsHumidity,
        incomingAbsHumidity,
        deltaAbsHumidity: indoorAbsHumidity != null && incomingAbsHumidity != null ? indoorAbsHumidity - incomingAbsHumidity : null
      };
    };
    const climateA = climateValues(a), climateB = climateValues(b);
    for (const key of Object.keys(group.climate)) {
      if (Number.isFinite(climateA[key]) && Number.isFinite(climateB[key])) {
        group.climate[key].sum += ((climateA[key] + climateB[key]) / 2) * hours;
        group.climate[key].hours += hours;
      }
    }
    const midpoint = new Date(a.t + elapsedMs / 2);
    const dayKey = [midpoint.getFullYear(), String(midpoint.getMonth() + 1).padStart(2, '0'), String(midpoint.getDate()).padStart(2, '0')].join('-');
    const daily = group.daily.get(dayKey) || { wh: 0, hours: 0 };
    daily.wh += wh;
    daily.hours += hours;
    group.daily.set(dayKey, daily);
  }
  const results = groups.map(group => {
    const coveredHours = group.coveredMs / 3600000;
    const candidateHours = group.candidateMs / 3600000;
    const dailyPowers = [...group.daily.values()].filter(day => day.hours > 0).map(day => day.wh / day.hours);
    const dayCount = dailyPowers.length;
    return {
      mode: group.mode,
      status: group.intervalCount ? (dayCount >= minDays ? 'comparable' : 'insufficient-days') : 'insufficient-data',
      estimatedKwh: group.intervalCount ? group.energyWh / 1000 : null,
      coveredHours, candidateHours,
      coveragePercent: candidateHours > 0 ? coveredHours / candidateHours * 100 : 0,
      weightedAveragePowerW: coveredHours > 0 ? group.energyWh / coveredHours : null,
      medianDailyAveragePowerW: medianEstimate(dailyPowers),
      climate: Object.fromEntries(Object.entries(group.climate).map(([key, item]) => [key, item.hours > 0 ? item.sum / item.hours : null])),
      climateCoverageHours: Object.fromEntries(Object.entries(group.climate).map(([key, item]) => [key, item.hours])),
      dayCount, intervalCount: group.intervalCount,
      longGapCount: group.longGapCount,
      invalidFlowIntervalCount: group.invalidFlowIntervalCount
    };
  });
  return {
    groups: results,
    hasManualModeData: unique.some(row => [1, 2, 3].includes(row.vmiModeRaw)),
    transitionIntervalCount,
    duplicateTimestampCount:deduplicated.duplicateTimestampCount,
    conflictingTimestampCount:deduplicated.conflictingTimestampCount,
    maxGapHours, minDays,
    limits: [
      'Seuls les niveaux manuels 1, 2 et 3 du champ Mode sont utilisés ; les codes bruts VMI+ ne sont jamais substitués.',
      'Les intervalles qui traversent un changement de mode, dépassent ' + maxGapHours + ' h ou ont un débit hors plage constructeur sont exclus.',
      'La puissance moyenne par mode est la médiane des moyennes journalières ; elle reste descriptive et non causale.',
      'L’estimation concerne uniquement le ventilateur, pas le préchauffage ni la consommation totale de la VMI.'
    ]
  };
}
