/** @typedef {import('../types/vmi-types.js').VmiRecord} VmiRecord */
/** @typedef {import('../types/vmi-types.js').TransientSpikeSummary} TransientSpikeSummary */
/** @typedef {import('../types/vmi-types.js').DataQualitySummary} DataQualitySummary */
/** @typedef {import('../types/vmi-types.js').UnknownRecord} UnknownRecord */
/** @typedef {import('../types/vmi-types.js').AnalysisOptions} AnalysisOptions */

/** Contrôle de plausibilité des mesures, sans modifier les valeurs reçues de la VMI+. */

/**
 * isPlausibleHumidity — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {number} value Paramètre value.
 * @returns {boolean} Résultat de isPlausibleHumidity.
 */
export const isPlausibleHumidity = value =>
  !Number.isFinite(value) || (value >= 0 && value <= 100);

/**
 * isPlausibleTemperature — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {number} value Paramètre value.
 * @returns {boolean} Résultat de isPlausibleTemperature.
 */
export const isPlausibleTemperature = value =>
  !Number.isFinite(value) || (value >= -30 && value <= 60);

/**
 * Détecte une trame de remplacement probable : les trois sondes renvoient
 * simultanément exactement 20 °C et 50 %. Les valeurs brutes restent conservées.
 */
/**
 * isPlaceholderSensorRecord — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {unknown} record Paramètre record.
 * @returns {boolean} Résultat de isPlaceholderSensorRecord.
 */
export function isPlaceholderSensorRecord(record) {
  if (!record || typeof record !== 'object') return false;
  const row = /** @type {Record<string, unknown>} */ (record);
  return row.st === 20 && row.sh === 50 &&
    row.t1 === 20 && row.h1 === 50 &&
    row.te === 20 && row.he === 50;
}


/** @type {Array<{key:'st'|'te'|'tExt'|'t1'|'sh'|'he'|'h1',label:string,type:'humidity'|'temperature',spike:number,stable:number}>} */
const TRANSIENT_SPIKE_FIELDS = [
  { key: 'st', label: 'Température salon', type: 'temperature', spike: 12, stable: 3 },
  { key: 'te', label: 'Température air entrant', type: 'temperature', spike: 12, stable: 3 },
  { key: 'tExt', label: 'Température extérieure VMI+', type: 'temperature', spike: 12, stable: 3 },
  { key: 't1', label: 'Température sonde résistances', type: 'temperature', spike: 12, stable: 3 },
  { key: 'sh', label: 'Humidité salon', type: 'humidity', spike: 30, stable: 8 },
  { key: 'he', label: 'Humidité air entrant', type: 'humidity', spike: 30, stable: 8 },
  { key: 'h1', label: 'Humidité sonde résistances', type: 'humidity', spike: 30, stable: 8 }
];

/**
 * Repère les pics isolés qui reviennent près du niveau initial.
 * Ce sont des événements à vérifier, jamais une preuve de panne de capteur.
 * Les deux intervalles voisins doivent être datés et <= maxGapMinutes.
 */
/** Repère les pics isolés sur les sondes, sans conclure à une panne.
 * @param {VmiRecord[]} records Historique horodaté.
 * @param {{maxGapMinutes?: number}} [options] Écart maximal entre relevés voisins.
 * @returns {TransientSpikeSummary} Pics détectés et seuils utilisés.
 */
export function detectTransientSensorSpikes(records, options = {}) {
  const maxGapMinutes = options?.maxGapMinutes ?? 30;
  if (!Number.isFinite(maxGapMinutes) || maxGapMinutes < 0) {
    throw new RangeError('maxGapMinutes doit être un nombre fini positif ou nul');
  }
  const maxGapMs = maxGapMinutes * 60 * 1000;
  if (!Number.isFinite(maxGapMs)) {
    throw new RangeError('maxGapMinutes dépasse la plage exploitable');
  }
  const rows = (Array.isArray(records) ? records : [])
    .filter(row => Number.isFinite(row?.t) && Number.isFinite(new Date(row.t).getTime()))
    .slice()
    .sort((a, b) => a.t - b.t);
  const candidates = [];
  for (const field of TRANSIENT_SPIKE_FIELDS) {
    // Regroupe les mesures par horodatage : les doublons identiques ne
    // doivent pas créer un intervalle nul, les valeurs contradictoires
    // rendent ce point temporel ambigu et sont exclues de cette détection.
    const byTimestamp = new Map();
    for (const row of rows) {
      if (!Number.isFinite(row?.[field.key])) continue;
      const values = byTimestamp.get(row.t) || new Set();
      values.add(row[field.key]);
      byTimestamp.set(row.t, values);
    }
    const seenTimestamps = new Set();
    const fieldRows = [];
    for (const row of rows) {
      const values = byTimestamp.get(row.t);
      if (!Number.isFinite(row?.[field.key]) || values?.size !== 1 || seenTimestamps.has(row.t)) continue;
      seenTimestamps.add(row.t);
      fieldRows.push(row);
    }
    for (let index = 1; index < fieldRows.length - 1; index++) {
      const before = fieldRows[index - 1], current = fieldRows[index], after = fieldRows[index + 1];
      const a = before[field.key], b = current[field.key], c = after[field.key];
      if (typeof a !== 'number' || typeof b !== 'number' || typeof c !== 'number' ||
          !Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) continue;
      const plausible = field.type === 'humidity'
        ? [a, b, c].every(isPlausibleHumidity)
        : [a, b, c].every(isPlausibleTemperature);
      if (!plausible) continue;
      const gapBefore = current.t - before.t;
      const gapAfter = after.t - current.t;
      if (gapBefore <= 0 || gapAfter <= 0 || gapBefore > maxGapMs || gapAfter > maxGapMs) continue;
      const neighborsDifference = Math.abs(a - c);
      const spikeFromNeighbors = Math.min(Math.abs(b - a), Math.abs(b - c));
      const sameDirection = (b - a) * (b - c) > 0;
      if (!sameDirection || neighborsDifference > field.stable || spikeFromNeighbors < field.spike) continue;
      candidates.push({
        key: field.key, label: field.label, timestamp: current.t, value: b,
        previousValue: a, nextValue: c,
        unit: /** @type {'%'|'°C'} */ (field.type === 'humidity' ? '%' : '°C'),
        deviation: spikeFromNeighbors,
        gapBeforeMinutes: gapBefore / 60000, gapAfterMinutes: gapAfter / 60000
      });
    }
  }
  return {
    count: candidates.length, candidates, maxGapMinutes,
    thresholds: { temperatureSpike: 12, temperatureNeighborDifference: 3,
      humiditySpike: 30, humidityNeighborDifference: 8 }
  };
}

/** @type {Array<{key:'sh'|'h1'|'he'|'st'|'tExt'|'t1'|'te',label:string,type:'humidity'|'temperature'}>} */
const FIELDS = [
  { key: 'sh', label: 'Humidité salon', type: 'humidity' },
  { key: 'h1', label: 'Humidité sonde résistances', type: 'humidity' },
  { key: 'he', label: 'Humidité air entrant', type: 'humidity' },
  { key: 'st', label: 'Température salon', type: 'temperature' },
  { key: 'tExt', label: 'Température extérieure VMI+', type: 'temperature' },
  { key: 't1', label: 'Température sonde résistances', type: 'temperature' },
  { key: 'te', label: 'Température air entrant', type: 'temperature' }
];

/** Résume la complétude et la plausibilité des mesures reçues.
 * @param {VmiRecord[]} records Relevés à contrôler.
 * @returns {DataQualitySummary} Couverture, anomalies et pics transitoires.
 */
export function summarizeDataQuality(records) {
  const rows = Array.isArray(records) ? records : [];
  const fieldCoverage = FIELDS.map(field => {
    let present = 0, invalid = 0;
    for (const row of rows) {
      const value = row?.[field.key];
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      present++;
      const valid = field.type === 'humidity'
        ? isPlausibleHumidity(value)
        : isPlausibleTemperature(value);
      if (!valid) invalid++;
    }
    const valid = present - invalid;
    return {
      ...field,
      presentCount: present,
      missingCount: rows.length - present,
      invalidCount: invalid,
      validCount: valid,
      coveragePercent: rows.length ? valid / rows.length * 100 : 0
    };
  });
  const fields = fieldCoverage
    .filter(field => field.invalidCount > 0)
    .map(field => ({ ...field, count: field.invalidCount }));
  const affected = new Set();
  let placeholderRecords = 0;
  rows.forEach((row, index) => {
    if (isPlaceholderSensorRecord(row)) { affected.add(index); placeholderRecords++; }
    for (const field of FIELDS) {
      const value = row?.[field.key];
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const valid = field.type === 'humidity'
        ? isPlausibleHumidity(value)
        : isPlausibleTemperature(value);
      if (!valid) { affected.add(index); break; }
    }
  });
  const transientSpikes = detectTransientSensorSpikes(rows);
  const coreKeys = ['sh', 'st', 'he', 'te'];
  // La complétude mesure la présence des quatre valeurs numériques.
  // La plausibilité est suivie séparément dans invalidCount / affectedRecords.
  const completeHygrometricRecords = rows.filter(row =>
    !isPlaceholderSensorRecord(row) && coreKeys.every(key => Number.isFinite(row?.[key]))
  ).length;
  return {
    total: rows.length,
    affectedRecords: affected.size,
    invalidRecords: affected.size,
    placeholderRecords,
    fields,
    fieldCoverage,
    coreSensorKeys: coreKeys,
    completeHygrometricRecords,
    incompleteHygrometricRecords: rows.length - completeHygrometricRecords,
    hygrometricCoveragePercent: rows.length ? completeHygrometricRecords / rows.length * 100 : 0,
    hasAnomalies: affected.size > 0,
    transientSpikes
  };
}
