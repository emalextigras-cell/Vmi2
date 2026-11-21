/** @typedef {import('../types/vmi-types.js').VmiRecord} VmiRecord */
/** @typedef {import('../types/vmi-types.js').UnknownRecord} UnknownRecord */
/** @typedef {import('../types/vmi-types.js').AnalysisOptions} AnalysisOptions */

/** Analyses statistiques communes (sans effet sur les commandes VMI). */
import { median } from './statistics.js';
import { isPlaceholderSensorRecord, isPlausibleTemperature } from './data-quality.js';
export { median } from './statistics.js';
export { analyzeSpeedLevels, analyzeSpeedTimeContext, compareOperatingPeriods, summarizeOperatingReference, summarizeRawVmiMode, summarizeRawVmiSpeed } from './operating-analysis.js';
export { analyzeHygrometricPeriods, summarizeDailyTrends, analyzeHourlyPatterns, detectRapidChanges, buildHygrometricDiagnosis } from './hygrometric-analysis.js';


/** Inventaire des champs VMI+ disponibles ; aucune unité ni consommation n'est déduite. */
/**
 * summarizeEnergyReadiness — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} data Paramètre data.
 * @returns {import('../types/vmi-types.js').EnergyReadinessResult} Inventaire des champs énergétiques.
 */
export function summarizeEnergyReadiness(data) {
  const rows=Array.isArray(data)?data:[];
  const fields = /** @type {Array<{key:'rpm'|'debit'|'vmiSpeedRaw'|'vmiPwmRaw'|'consDpRaw'|'consResRaw'|'consHydroRRaw'|'consTmaxRaw'|'kmoteurRaw'|'jmoteurRaw'|'kreseauRaw'|'jreseauRaw'|'motorPressureRaw'|'offsetPressureRaw'|'operatingPctRaw'|'operatingPct2Raw'|'dcintRaw',label:string,unit:string,verified:boolean}>} */ ([
    {key:'rpm',label:'Régime moteur',unit:'tr/min (confirmé)',verified:true},
    {key:'debit',label:'Débit',unit:'m³/h',verified:true},
    {key:'vmiSpeedRaw',label:'Code vitesse VMI+',unit:'code brut',verified:false},
    {key:'vmiPwmRaw',label:'PWM VMI+',unit:'valeur brute (échelle à confirmer)',verified:false},
    {key:'consDpRaw',label:'Cons DP',unit:'signification et unité à confirmer',verified:false},
    {key:'consResRaw',label:'Cons Res',unit:'signification et unité à confirmer',verified:false},
    {key:'consHydroRRaw',label:'Cons HydroR',unit:'signification et unité à confirmer',verified:false},
    {key:'consTmaxRaw',label:'Seuil température extérieure (Cons TMax)',unit:'consigne en °C (sens confirmé)',verified:true},
    {key:'kmoteurRaw',label:'Kmoteur',unit:'signification et unité à confirmer',verified:false},
    {key:'jmoteurRaw',label:'Jmoteur',unit:'signification et unité à confirmer',verified:false},
    {key:'kreseauRaw',label:'Kreseau',unit:'signification et unité à confirmer',verified:false},
    {key:'jreseauRaw',label:'Jreseau',unit:'signification et unité à confirmer',verified:false},
    {key:'motorPressureRaw',label:'Pression Moteur',unit:'unité à confirmer',verified:false},
    {key:'offsetPressureRaw',label:'Offset Press',unit:'valeur brute',verified:false},
    {key:'operatingPctRaw',label:'% fonct',unit:'échelle à confirmer',verified:false},
    {key:'operatingPct2Raw',label:'% fonct.1',unit:'échelle à confirmer',verified:false},
    {key:'dcintRaw',label:'Dcint',unit:'signification et unité à confirmer',verified:false}
  ]).map(field=>{
    const values=rows.map(r=>r?.[field.key]).filter((value) => typeof value === 'number' && Number.isFinite(value));
    return {...field,count:values.length,
      zeroCount:values.filter(value=>value===0).length,
      nonZeroCount:values.filter(value=>value!==0).length,
      missingCount:rows.length-values.length,
      min:values.length?values.reduce((min,value)=>Math.min(min,value),Infinity):null,
      max:values.length?values.reduce((max,value)=>Math.max(max,value),-Infinity):null,
      distinct:[...new Set(values)].sort((a,b)=>a-b)};
  });
  return {
    total:rows.length,fields,
    hasVerifiedElectricalEnergy:false,
    message:'Aucune mesure électrique vérifiée en watts ou kWh n’est disponible : la consommation et le rendement énergétique ne peuvent pas encore être calculés.'
  };
}

/**
 * Analyse les relevés autour de la consigne de température extérieure Cons TMax.
 * Les comparaisons restent descriptives et sont séparées par mode manuel déclaré.
 */
/**
 * summarizeTemperatureLimit — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} data Historique des relevés VMI.
 * @param {{minimumGroupSamples?: number, minimumGroupDays?: number}} options Seuils de couverture par groupe.
 * @returns {import('../types/vmi-types.js').TemperatureLimitResult} Résumé descriptif de la consigne de température.
 */
export function summarizeTemperatureLimit(data, {
  minimumGroupSamples = 5, minimumGroupDays = 2
} = {}) {
  for (const [name, value] of Object.entries({ minimumGroupSamples, minimumGroupDays })) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(`${name} doit être un entier strictement positif.`);
    }
  }

  const rows = Array.isArray(data) ? data : [];
  const untimedEligible = [];
  const uniqueTimedEligible = new Map();
  for (const row of rows) {
    if (isPlaceholderSensorRecord(row) || (row?.t != null && (!Number.isFinite(row.t) || !Number.isFinite(new Date(row.t).getTime()))) ||
        !Number.isFinite(row?.consTmaxRaw) || !isPlausibleTemperature(row.consTmaxRaw) ||
        !Number.isFinite(row?.tExt) || !isPlausibleTemperature(row.tExt)) continue;
    if (row.t == null) {
      untimedEligible.push(row);
    } else {
      uniqueTimedEligible.set(`${row.vmiModeRaw ?? 'unknown'}:${row.t}`, row);
    }
  }
  const eligible = [...untimedEligible, ...uniqueTimedEligible.values()];
  const settings = new Map();
  const dayKey = timestamp => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  };
  for (const row of eligible) {
    const threshold = row.consTmaxRaw;
    if (!settings.has(threshold)) settings.set(threshold, []);
    settings.get(threshold).push(row);
  }
  const summarize = samples => {
    const timestamps = samples.map(row => row.t).filter(Number.isFinite);
    const outdoor = samples.map(row => row.tExt).filter(Number.isFinite);
    return {
      sampleCount: samples.length,
      dayCount: new Set(timestamps.map(dayKey)).size,
      medianOutdoorTemp: median(outdoor)
    };
  };
  const pairedDailySummary = (dailyMap, sharedDays) => {
    const daily = sharedDays.map(day => {
      const samples = dailyMap.get(day) || [];
      return {
        sampleCount: samples.length,
        debit: median(samples.map(row => row.debit).filter(value => Number.isFinite(value) && value >= 0)),
        rpm: median(samples.map(row => row.rpm).filter(value => Number.isFinite(value) && value > 0 && value < 10000))
      };
    });
    return {
      sampleCount: daily.reduce((sum, item) => sum + item.sampleCount, 0),
      dayCount: daily.length,
      medianDebit: median(daily.map(item => item.debit)),
      medianRPM: median(daily.map(item => item.rpm))
    };
  };
  const thresholds = [...settings.entries()].sort((a,b) => a[0]-b[0]).map(([threshold, samples]) => {
    const aboveRows = samples.filter(row => row.tExt > threshold);
    const atOrBelowRows = samples.filter(row => row.tExt <= threshold);
    const modes = [1,2,3].map(mode => {
      const aboveModeRows = aboveRows.filter(row => row.vmiModeRaw === mode);
      const belowModeRows = atOrBelowRows.filter(row => row.vmiModeRaw === mode);
      const aboveDays = new Map(), belowDays = new Map();
      for (const row of aboveModeRows) {
        if (!Number.isFinite(row.t)) continue;
        const key = dayKey(row.t);
        if (!aboveDays.has(key)) aboveDays.set(key, []);
        aboveDays.get(key).push(row);
      }
      for (const row of belowModeRows) {
        if (!Number.isFinite(row.t)) continue;
        const key = dayKey(row.t);
        if (!belowDays.has(key)) belowDays.set(key, []);
        belowDays.get(key).push(row);
      }
      const sharedDays = [...aboveDays.keys()].filter(day => belowDays.has(day)).sort();
      const pairedAbove = pairedDailySummary(aboveDays, sharedDays);
      const pairedAtOrBelow = pairedDailySummary(belowDays, sharedDays);
      const hasPairedMetric = (metric, isValid) => {
        const dailyCounts = sharedDays.map(day => ({
          above: (aboveDays.get(day) || []).filter(row => isValid(row[metric])).length,
          below: (belowDays.get(day) || []).filter(row => isValid(row[metric])).length
        }));
        const metricSharedDays = dailyCounts.filter(day => day.above > 0 && day.below > 0);
        return metricSharedDays.length >= minimumGroupDays &&
          metricSharedDays.reduce((total, day) => total + day.above, 0) >= minimumGroupSamples &&
          metricSharedDays.reduce((total, day) => total + day.below, 0) >= minimumGroupSamples;
      };
      const hasComparableMetric =
        hasPairedMetric('debit', value => Number.isFinite(value) && value >= 0) ||
        hasPairedMetric('rpm', value => Number.isFinite(value) && value > 0 && value < 10000);
      return {
        mode,
        above: summarize(aboveModeRows),
        atOrBelow: summarize(belowModeRows),
        sharedDayCount: sharedDays.length,
        pairedAbove,
        pairedAtOrBelow,
        comparable: sharedDays.length >= minimumGroupDays && hasComparableMetric
      };
    }).filter(group => group.above.sampleCount || group.atOrBelow.sampleCount);
    return {
      threshold, sampleCount: samples.length,
      aboveThresholdCount: aboveRows.length,
      atOrBelowThresholdCount: atOrBelowRows.length,
      above: summarize(aboveRows),
      atOrBelow: summarize(atOrBelowRows),
      modes
    };
  });
  return {
    status: thresholds.length ? 'available' : 'no-comparable-data',
    minimumGroupSamples, minimumGroupDays,
    inputSampleCount: rows.length,
    eligibleSampleCount: eligible.length,
    missingOutdoorTemperatureCount: rows.filter(row =>
      !isPlaceholderSensorRecord(row) && Number.isFinite(row?.consTmaxRaw) && isPlausibleTemperature(row.consTmaxRaw) &&
      (!Number.isFinite(row?.tExt) || !isPlausibleTemperature(row.tExt))
    ).length,
    thresholds,
    limits: [
      'Cons TMax est interprété comme une consigne de température extérieure en °C, selon la confirmation de l’utilisateur.',
      'Un relevé au-dessus du seuil indique une condition où la réduction de ventilation peut s’appliquer ; il ne prouve pas à lui seul que la régulation a effectivement réduit le débit.',
      'Les médianes comparatives sont calculées par jour puis équilibrées sur les mêmes dates présentes au-dessus et au seuil ou en dessous, séparément par Mode manuel déclaré.',
      'La comparaison ne neutralise pas l’heure, la saison, les autres réglages ni les conditions d’installation.'
    ]
  };
}

/**
 * Décrit le débit Debit (m³/h) selon le code Vitesse brut exporté par VMI+.
 * Aucun code Vitesse n'est converti en niveau manuel ; l'unité du débit est confirmée en m³/h.
 */
/** Regroupe le débit d'air Debit (m³/h) par mode VMI+ ; Mode et Vitesse restent distincts. */
/**
 * Référence descriptive du fonctionnement par mode VMI+.
 * Mode et code Vitesse brut restent distincts ; les unités non confirmées restent brutes.
 */


