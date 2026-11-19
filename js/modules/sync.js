

/** Temporisation du téléchargement de l'historique VMI. */
export function armDownloadTimeout(download, finishDownload, delay = 20000) {
  clearTimeout(download.timeout);
  download.timeout = setTimeout(() => {
    if (download.on) finishDownload(false, true);
  }, delay);
}


/**
 * N'enregistre la fin de synchronisation qu'après la validation de la sauvegarde
 * de l'historique. Un échec d'écriture ne doit pas publier un lastSync trompeur.
 * @param {{saveHistory:()=>Promise<boolean|void>,saveMetadata:()=>Promise<unknown>}} options Opérations de persistance ordonnées.
 * @returns {Promise<boolean>} false si l'historique n'a pas été sauvegardé.
 */
export async function persistCompletedHistorySync({ saveHistory, saveMetadata }) {
  const saved = await saveHistory();
  if (saved === false) return false;
  await saveMetadata();
  return true;
}
