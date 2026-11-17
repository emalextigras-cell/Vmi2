/** Fonctions centrales partagées par l'application. */
/** Recherche un élément DOM par son identifiant.
 * @param {string} id Identifiant HTML.
 * @returns {HTMLElement|null} Élément trouvé ou null.
 */
export const $ = id => document.getElementById(id);
/** Attend un délai en millisecondes.
 * @param {number} ms Durée d'attente.
 * @returns {Promise<void>} Promesse résolue après le délai.
 */
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const APP_VERSION = '14';
