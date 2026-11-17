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

/**
 * Formate la fraîcheur des flux Bluetooth sans interpréter leur contenu.
 * @param {{salon?: number, probes?: number, state?: number}} lastSeen Horodatages de dernière réception en millisecondes.
 * @param {number} now Horodatage courant en millisecondes.
 * @param {number} staleAfterMs Délai au-delà duquel un flux est considéré ancien.
 * @returns {string} État textuel de fraîcheur des trois flux.
 */
function ageLabel(timestamp, now, staleAfterMs) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "non reçues";
  const ageMs = Math.max(0, now - timestamp);
  const seconds = Math.floor(ageMs / 1000);
  const age = seconds < 60
    ? `il y a ${seconds} s`
    : `il y a ${Math.floor(seconds / 60)} min`;
  return ageMs > staleAfterMs ? `anciennes (${age})` : `à jour (${age})`;
}

export function buildLiveFreshnessText(lastSeen = {}, now = Date.now(), staleAfterMs = 90000) {
  return [
    `Salon : ${ageLabel(lastSeen.salon, now, staleAfterMs)}`,
    `sondes : ${ageLabel(lastSeen.probes, now, staleAfterMs)}`,
    `état VMI : ${ageLabel(lastSeen.state, now, staleAfterMs)}`
  ].join(" · ") + ".";
}
