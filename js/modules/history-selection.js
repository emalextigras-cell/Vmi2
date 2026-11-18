/**
 * Sélectionne les relevés affichés sans modifier l'historique source.
 */
import { dayStart, shiftDay, MIN_VALID } from './date-utils.js';

/**
 * Vérifie qu'un relevé possède la structure minimale requise pour l'affichage.
 * Les archives brutes restent permissives ; cette validation ne transforme aucune donnée.
 * @param {unknown} record Valeur issue du stockage ou d'un import.
 * @returns {record is import('../types/vmi-types.js').DisplayVmiRecord}
 */
export function isDisplayVmiRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;

  const timestamp = /** @type {{ t?: unknown }} */ (record).t;
  return typeof timestamp === 'number' &&
    Number.isFinite(timestamp) &&
    Number.isFinite(new Date(timestamp).getTime());
}

export function selectDataRange(records, { selectedDate = null, daysSetting = 30, maxTimestamp = Date.now() } = {}) {
  const data = (Array.isArray(records) ? records : [])
    .filter(record => isDisplayVmiRecord(record) && record.t >= MIN_VALID && record.t <= maxTimestamp)
    .sort((a, b) => a.t - b.t);

  if (selectedDate) {
    const match = typeof selectedDate === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(selectedDate);
    if (!match) return [];
    const [year, month, day] = match.slice(1).map(Number);
    const calendarDate = new Date(0);
    calendarDate.setHours(12, 0, 0, 0);
    calendarDate.setFullYear(year, month - 1, day);
    if (calendarDate.getFullYear() !== year || calendarDate.getMonth() !== month - 1 || calendarDate.getDate() !== day) return [];

    const start = dayStart(selectedDate);
    const end = dayStart(shiftDay(selectedDate, 1));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    return data.filter(record => record.t >= start && record.t < end);
  }

  if (daysSetting && data.length) {
    const end = data[data.length - 1].t;
    return data.filter(record => record.t >= end - daysSetting * 86400000);
  }

  return data;
}
