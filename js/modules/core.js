/** Fonctions centrales partagées par l'application. */
/** Recherche un élément DOM par son identifiant, avec les types correspondant au HTML.
 * @overload
 * @param {'logDetails'} id
 * @returns {HTMLDetailsElement|null}
 */
/** @overload @param {'conn'|'disc'|'dlh'} id @returns {HTMLButtonElement|null} */
/** @overload @param {'fx'|'restoreFile'|'dayPicker'} id @returns {HTMLInputElement|null} */
/** @overload @param {'targetRH'|'minSamples'} id @returns {HTMLSelectElement|null} */
/** @overload @param {string} id @returns {HTMLElement|null} */
/** @param {string} id Identifiant HTML.
 * @returns {HTMLElement|null} Élément trouvé ou null.
 */
export function $(id) {
  return document.getElementById(id);
}
/** Attend un délai en millisecondes.
 * @param {number} ms Durée d'attente.
 * @returns {Promise<void>} Promesse résolue après le délai.
 */
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const APP_VERSION = '14';
