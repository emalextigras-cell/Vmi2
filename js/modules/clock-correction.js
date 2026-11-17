/**
 * @typedef {Object} VmiRecord
 * @property {number} [t] Horodatage Unix en millisecondes.
 * @property {number} [st] Température intérieure en °C.
 * @property {number} [sh] Humidité relative intérieure en %.
 * @property {number} [te] Température de l'air entrant en °C.
 * @property {number} [he] Humidité relative de l'air entrant en %.
 * @property {number} [rpm] Régime moteur en tr/min.
 * @property {number} [debit] Débit en m³/h.
 * @property {number} [vmiModeRaw] Code brut du mode VMI.
 */
/** @typedef {Record<string, unknown>} UnknownRecord */
/** @typedef {{minSamples?: number, minDays?: number}} AnalysisOptions */

/** Correction des dates d'historique lorsque l'horloge interne de la VMI est erronée. */
import { DAY, MIN_VALID } from './date-utils.js';
import { filterRawDateHistory, isRawDateEligible } from './history.js';

const dayNumber = timestamp => {
  const d = new Date(timestamp);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
};
const MIN_RECONSTRUCTABLE_RAW = Date.UTC(2020, 0, 1);

const modeOf = values => {
  const counts = new Map();
  let best, bestCount = 0;
  for (const value of values) {
    const count = (counts.get(value) || 0) + 1;
    counts.set(value, count);
    if (count > bestCount) {
      bestCount = count;
      best = value;
    }
  }
  return best;
};

/**
 * Corrige en place les relevés antérieurs à MIN_VALID à partir du compteur
 * « jours de fonctionnement ». Les dates brutes antérieures à 2020 sont
 * considérées comme des données historiques invalides et ne sont jamais recalées.
 * Retourne { fixed, future, kept }.
 * Les règles de regroupement et le seuil horaire sont volontairement conservés.
 */
/**
 * fixClock — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} records Paramètre records.
 * @param {VmiRecord[]} history Paramètre history.
 * @param {unknown} minValid Paramètre minValid.
 * @param {unknown} maxTimestamp Paramètre maxTimestamp.
 * @returns {UnknownRecord} Résultat structuré du module.
 */
export function fixClock(records, history = [], minValid = MIN_VALID, maxTimestamp = Infinity) {
  // Les relevés entrants assez récents doivent rester disponibles pendant cette
  // fonction : leur compteur de jours peut permettre de reconstruire leur date.
  // L'historique déjà stocké, lui, reste filtré pour ne servir que de référence fiable.
  history = filterRawDateHistory(history, minValid).filter(record =>
    !Number.isFinite(maxTimestamp) || record.t <= maxTimestamp
  );
  const known = history.concat(records).filter(record =>
    isRawDateEligible(record, minValid) && record.t >= minValid &&
    (!Number.isFinite(maxTimestamp) || record.t <= maxTimestamp) &&
    Number.isFinite(record.d) &&
    new Date(record.t).getHours() >= 10
  );
  const epochOffset = modeOf(known.map(record => dayNumber(record.t) - record.d));
  const bad = records.filter(record => record.t < minValid && record.t >= MIN_RECONSTRUCTABLE_RAW)
    .sort((a, b) => a.t - b.t);
  let fixed = 0;
  const futureRecords = new Set();
  const futureDetails = [];

  if (epochOffset !== undefined && bad.length) {
    const episodes = [];
    let current = [];
    for (const record of bad) {
      if (current.length && record.t - current[current.length - 1].t > 3 * DAY) {
        episodes.push(current);
        current = [];
      }
      current.push(record);
    }
    if (current.length) episodes.push(current);

    for (const episode of episodes) {
      const offset = modeOf(episode
        .filter(record => Number.isFinite(record.d) && new Date(record.t).getHours() >= 10)
        .map(record => epochOffset + record.d - dayNumber(record.t)));
      if (offset === undefined) continue;

      for (const record of episode) {
        const date = new Date(record.t);
        const correctedTimestamp = new Date(
          date.getFullYear(), date.getMonth(), date.getDate() + offset,
          date.getHours(), date.getMinutes(), date.getSeconds()
        ).getTime();
        if (Number.isFinite(maxTimestamp) && correctedTimestamp > maxTimestamp) {
          futureRecords.add(record);
          futureDetails.push({ record, correctedTimestamp });
          continue;
        }
        record.t = correctedTimestamp;
        record.fixed = true;
        fixed++;
      }
    }
  }

  const kept = records.filter(record => {
    if (!isRawDateEligible(record, minValid) || record.t < minValid) return false;
    if (Number.isFinite(maxTimestamp) && record.t > maxTimestamp) {
      futureRecords.add(record);
      futureDetails.push({ record, correctedTimestamp: record.t });
      return false;
    }
    return true;
  });
  return { fixed, future: futureRecords.size, futureDetails, kept };
}
