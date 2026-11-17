/**
 * @typedef {Object} VmiRecord
 * @property {number} [t] Horodatage Unix en millisecondes.
 * @property {number} [st] Température intérieure en °C.
 * @property {number} [sh] Humidité relative intérieure en %.
 */
/** @typedef {Record<string, unknown>} UnknownRecord */

/** Temporisation du téléchargement de l'historique VMI. */
export function armDownloadTimeout(download, finishDownload, delay = 20000) {
  clearTimeout(download.timeout);
  download.timeout = setTimeout(() => {
    if (download.on) finishDownload(false, true);
  }, delay);
}
