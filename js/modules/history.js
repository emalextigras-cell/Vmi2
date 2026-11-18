/** @typedef {import('../types/vmi-types.js').VmiRecord} VmiRecord */
/** @typedef {import('../types/vmi-types.js').UnknownRecord} UnknownRecord */

/** Fonctions pures de nettoyage et de conservation de l'historique local. */
import { MIN_VALID } from './date-utils.js';

/**
 * La date brute rk fait foi pour les nouveaux relevés : les anciens relevés
 * déjà validés par une correction d'horloge restent conservés.
 */
/** Vérifie l'éligibilité temporelle d'un relevé sans modifier sa date.
 * @param {Partial<VmiRecord> & {rk?: string}} record Relevé à vérifier.
 * @param {number} [minValid] Timestamp minimal accepté pour les dates corrigées.
 * @returns {boolean} true si le relevé peut être conservé.
 */
export function isRawDateEligible(record, minValid = MIN_VALID) {
  if (!record || !Number.isFinite(record.t) || !Number.isFinite(new Date(record.t).getTime())) return false;
  if (record.fixed === true) return record.t >= minValid;
  if (typeof record.rk === 'string' && record.rk.trim()) {
    const match = record.rk.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s/);
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      const calendarDate = new Date(Date.UTC(year, month - 1, day));
      if (calendarDate.getUTCFullYear() !== year ||
          calendarDate.getUTCMonth() !== month - 1 ||
          calendarDate.getUTCDate() !== day) return false;
      return year >= 2025;
    }
  }
  // Sans date brute, conserver le relevé : l’horodatage peut rester vérifiable.
  return true;
}

/** Filtre les relevés selon leur date brute et leur horodatage maximal.
 * @param {VmiRecord[]} records Relevés à filtrer.
 * @param {number} [minValid] Timestamp minimal accepté pour les dates corrigées.
 * @param {number} [maxTimestamp] Timestamp maximal accepté.
 * @returns {VmiRecord[]} Relevés temporellement admissibles.
 */
export function filterRawDateHistory(records, minValid = MIN_VALID, maxTimestamp = Date.now()) {
  return (Array.isArray(records) ? records : []).filter(record =>
    isRawDateEligible(record, minValid) && record.t <= maxTimestamp
  );
}
/** Filtre les relevés vides puis limite la taille de l'historique.
 * @param {VmiRecord[]} records Relevés à conserver.
 * @param {number} maxRecords Nombre maximal de relevés.
 * @returns {{records: VmiRecord[], removed: number}} Historique conservé et nombre retiré.
 */
export function pruneHistory(records, maxRecords) {
  const valid = (Array.isArray(records) ? records : []).filter(record =>
    record && (record.st != null || record.sh != null || record.tExt != null || record.te != null ||
      record.he != null || record.rpm != null || record.t1 != null || record.h1 != null ||
      record.debit != null || record.vmiSpeedRaw != null || record.vmiAbsP0 != null || record.vmiAbsP1 != null ||
      record.filterIndexPct != null || record.vmiPwmRaw != null || record.vmiModeRaw != null ||
      record.volumeRaw != null || record.consDpRaw != null || record.fil != null)
  );
  const limit = Number.isFinite(maxRecords) ? Math.max(0, Math.floor(maxRecords)) : valid.length;
  const removed = Math.max(0, valid.length - limit);
  return { records: removed ? valid.slice(removed) : valid, removed };
}

/**
 * Complète un relevé existant avec les valeurs non nulles d'une nouvelle source.
 * Les champs déjà renseignés sont conservés si la nouvelle source ne les fournit pas.
 */
/** Fusionne deux relevés en conservant les valeurs connues en cas de transfert partiel.
 * @param {Partial<VmiRecord>|null|undefined} existing Relevé déjà stocké.
 * @param {Partial<VmiRecord>|null|undefined} incoming Relevé entrant.
 * @returns {Partial<VmiRecord>|null|undefined} Relevé fusionné.
 */
export function mergeRecordFields(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value != null) merged[key] = value;
  }
  // Un transfert partiel ne doit jamais dégrader un relevé déjà complet.
  // Un relevé sans marqueur (CSV/import historique) est considéré comme complet.
  if (Object.hasOwn(existing, 'syncPartial') || Object.hasOwn(incoming, 'syncPartial')) {
    merged.syncPartial = existing.syncPartial === true && incoming.syncPartial === true;
  }
  return merged;
}

/** Fusionne les imports par horodatage sans perdre les champs déjà renseignés. */
export function mergeImportedHistory(currentRecords, importedRecords, maxTimestamp = Date.now()) {
  const byTimestamp = new Map();
  for (const record of (Array.isArray(currentRecords) ? currentRecords : [])
    .filter(record => isRawDateEligible(record) && record.t <= maxTimestamp)) {
    const existing = byTimestamp.get(record.t);
    byTimestamp.set(record.t, existing ? mergeRecordFields(existing, record) : record);
  }
  (Array.isArray(importedRecords) ? importedRecords : [])
    .filter(record => isRawDateEligible(record) && record.t <= maxTimestamp)
    .forEach(record => byTimestamp.set(record.t, mergeRecordFields(byTimestamp.get(record.t), record)));
  return [...byTimestamp.values()].sort((a, b) => a.t - b.t);
}
