/** @typedef {import('../types/vmi-types.js').VmiRecord} VmiRecord */

/**
 * Commit atomique d'une synchronisation historique.
 * L'historique et les métadonnées de synchronisation sont écrits dans une même
 * transaction IndexedDB ; aucun état de succès ne doit être publié avant sa résolution.
 * @param {{
 *  currentRecords: VmiRecord[],
 *  importedRecords: VmiRecord[],
 *  maxTimestamp?: number,
 *  futureToleranceMs?: number,
 *  maxRecords?: number,
 *  metadata?: Record<string, unknown>,
 *  persistMany: (entries: Array<[string, unknown]>) => Promise<void>
 * }} options Données à fusionner et fonction de persistance transactionnelle.
 * @returns {Promise<{history: VmiRecord[], removed: number}>} Historique validé en stockage.
 */
import { mergeImportedHistory, pruneHistory } from './history.js';

export async function commitHistorySync({
  currentRecords,
  importedRecords,
  maxTimestamp = Date.now(),
  futureToleranceMs = 0,
  maxRecords = Number.POSITIVE_INFINITY,
  metadata,
  persistMany
}) {
  if (typeof persistMany !== 'function') {
    throw new TypeError('Une fonction de persistance transactionnelle est obligatoire.');
  }
  const merged = mergeImportedHistory(currentRecords, importedRecords, maxTimestamp, { futureToleranceMs });
  const pruned = pruneHistory(merged, maxRecords);
  const entries = [['hist', pruned.records]];
  if (metadata !== undefined) entries.push(['meta', metadata]);
  await persistMany(entries);
  return { history: pruned.records, removed: pruned.removed };
}
