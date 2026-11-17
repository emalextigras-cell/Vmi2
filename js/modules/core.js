

/** Fonctions centrales partagées par l'application. */
/**
 * $ — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {unknown} id Paramètre id.
 * @returns {unknown} Résultat du module.
 */
export const $ = id => document.getElementById(id);
/**
 * sleep — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {unknown} ms Paramètre ms.
 * @returns {unknown} Résultat du module.
 */
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const APP_VERSION = '14';
