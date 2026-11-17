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

/** Point d'entrée du moteur de graphiques. */
export { renderCharts, resetChartViews } from './chart-renderer.js';
