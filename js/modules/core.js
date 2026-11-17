

/** Attend un délai en millisecondes.
 * @param {number} ms Durée d'attente.
 * @returns {Promise<void>} Promesse résolue après le délai.
 */
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const APP_VERSION = '14';
