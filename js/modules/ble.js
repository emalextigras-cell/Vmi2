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

/** Couche protocole BLE : UUID, trames, CRC et représentation hexadécimale. */
export { SVC_C, CH_C, SVC_T, CH_T, crc, frame, timeFrame, hex } from './bluetooth-protocol.js';
