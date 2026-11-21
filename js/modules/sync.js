

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
