/**
 * @typedef {Object} VmiRecord
 * @property {number} [t] Horodatage Unix en millisecondes.
 * @property {number} [st] Température intérieure en °C.
 * @property {number} [sh] Humidité relative intérieure en %.
 * @property {number} [te] Température de l'air entrant en °C.
 * @property {number} [he] Humidité relative de l'air entrant en %.
 */
/** @typedef {Record<string, unknown>} UnknownRecord */
/** @typedef {number|null} NullableNumber */

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
