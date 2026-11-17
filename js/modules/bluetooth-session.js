/**
 * @typedef {Object} VmiRecord
 * @property {number} [t] Horodatage Unix en millisecondes.
 * @property {number} [st] Température intérieure en °C.
 * @property {number} [sh] Humidité relative intérieure en %.
 * @property {number} [te] Température de l'air entrant en °C.
 * @property {number} [he] Humidité relative de l'air entrant en %.
 * @property {number} [tExt] Température extérieure en °C.
 * @property {number} [h1] Humidité de la sonde résistances en %.
 * @property {number} [t1] Température de la sonde résistances en °C.
 * @property {number} [rpm] Régime moteur en tr/min.
 * @property {number} [debit] Débit en m³/h.
 * @property {number} [vmiModeRaw] Code brut du mode VMI.
 * @property {number} [d] Compteur de jours de fonctionnement.
 * @property {number} [consTmaxRaw] Consigne brute de température maximale.
 * @property {boolean} [fixed] Indique qu'un horodatage a été recalé.
 * @property {string|number} [id] Identifiant facultatif.
 */

/** @typedef {number|null} NullableNumber */
/** @typedef {Record<string, unknown>} UnknownRecord */
/** @typedef {{minSamples?: number, minDays?: number, maxGapMinutes?: number}} AnalysisOptions */

/** Exécute une séquence BLE uniquement dans la session qui l'a démarrée. */
/**
 * runBleSessionSequence — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {unknown} { token Paramètre { token.
 * @param {Function} getToken Paramètre getToken.
 * @param {Function} isActive Paramètre isActive.
 * @param {unknown} steps } Paramètre steps }.
 * @returns {Promise<boolean>} Résultat de runBleSessionSequence.
 */
export async function runBleSessionSequence({ token, getToken, isActive, steps }) {
  for (const step of steps) {
    if (getToken() !== token || !isActive()) return false;
    const succeeded = await step();
    if (!succeeded || getToken() !== token || !isActive()) return false;
  }
  return true;
}
