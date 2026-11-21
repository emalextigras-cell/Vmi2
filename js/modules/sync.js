

/** Temporisation du téléchargement de l'historique VMI. */
export function armDownloadTimeout(download, finishDownload, delay = 20000) {
  clearTimeout(download.timeout);
  download.timeout = setTimeout(() => {
    if (download.on) finishDownload(false, true);
  }, delay);
}


/**
 * Renvoie le dernier relevé reçu qui porte un compteur de jours exploitable.
 * L'ordre du flux BLE est la référence : ne pas prendre le maximum, car le
 * compteur peut avoir été remis à zéro entre deux lignes.
 * @param {Array<{d?:number}>} records Lignes dans l'ordre de réception.
 * @returns {{d?:number}|null} Dernier relevé avec compteur entier fini.
 */
export function findNewestCounterRecord(records) {
  if (!Array.isArray(records)) return null;
  for (let index = records.length - 1; index >= 0; index--) {
    const record = records[index];
    if (record && Number.isFinite(record.d) && Number.isInteger(record.d) && record.d >= 0) {
      return record;
    }
  }
  return null;
}

/**
 * Classe une ligne reçue pendant une synchronisation d'historique.
 * En bootstrap, les lignes déjà persistées (partielles ou non) sont ignorées,
 * mais elles ne coupent jamais le flux : seules les lignes inconnues sont ajoutées.
 * Avec une borne complète, les lignes partielles connues sont ignorées et la borne
 * complète arrête le téléchargement.
 * @param {string} signature Signature stable rk|d.
 * @param {{
 *  baselineSignatures: Set<string>,
 *  knownSignatures: Set<string>,
 *  seenSignatures: Set<string>,
 *  bootstrap?: boolean
 * }} options Ensembles de signatures de la synchronisation.
 * @returns {'cut'|'skip'|'collect'} Décision de traitement.
 */
export function classifyHistoryDownloadRow(signature, options) {
  const key = String(signature ?? '');
  if (!key) return 'skip';
  if (options.seenSignatures.has(key)) return 'skip';
  if (!options.bootstrap && options.baselineSignatures.has(key)) return 'cut';
  if (options.knownSignatures.has(key)) return 'skip';
  options.seenSignatures.add(key);
  return 'collect';
}
