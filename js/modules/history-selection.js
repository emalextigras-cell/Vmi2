/**
 * @typedef {Object} VmiRecord
 * @property {number} [t] Horodatage Unix en millisecondes.
 * @property {number} [st] Température intérieure en °C.
 * @property {number} [sh] Humidité relative intérieure en %.
 * @property {number} [te] Température de l'air entrant en °C.
 * @property {number} [he] Humidité relative de l'air entrant en %.
 * @property {number} [rpm] Régime moteur en tr/min.
 * @property {number} [debit] Débit en m³/h.
 */
/** @typedef {Record<string, unknown>} UnknownRecord */

/** Sélectionne les relevés affichés sans modifier l'historique source. */
import { dayStart, shiftDay, MIN_VALID } from './date-utils.js';

export function selectDataRange(records, { selectedDate = null, daysSetting = 30, maxTimestamp = Date.now() } = {}) {
  const data = (Array.isArray(records) ? records : [])
    .filter(record => record && Number.isFinite(record.t) && record.t >= MIN_VALID && record.t <= maxTimestamp)
    .sort((a, b) => a.t - b.t);

  if (selectedDate) {
    const start = dayStart(selectedDate);
    const end = dayStart(shiftDay(selectedDate, 1));
    return data.filter(record => record.t >= start && record.t < end);
  }

  if (daysSetting && data.length) {
    const end = data[data.length - 1].t;
    return data.filter(record => record.t >= end - daysSetting * 86400000);
  }

  return data;
}
