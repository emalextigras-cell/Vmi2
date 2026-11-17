/**
 * @typedef {Object} VmiRecord
 * @property {number} [t] Horodatage Unix en millisecondes.
 * @property {number} [st] Température intérieure en °C.
 * @property {number} [sh] Humidité relative intérieure en %.
 * @property {number} [te] Température de l'air entrant en °C.
 * @property {number} [he] Humidité relative de l'air entrant en %.
 * @property {number} [rpm] Régime moteur en tr/min.
 * @property {number} [debit] Débit en m³/h.
 */
/** @typedef {Record<string, unknown>} UnknownRecord */

/**
 * Sélection prudente d'un périphérique Bluetooth déjà autorisé par le navigateur.
 * Ne choisit jamais arbitrairement entre plusieurs appareils.
 */
/**
 * chooseAuthorizedDevice — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {unknown} devices Paramètre devices.
 * @param {unknown} preferredId Paramètre preferredId.
 * @returns {UnknownRecord} Résultat structuré du module.
 */
export function chooseAuthorizedDevice(devices, preferredId = '') {
  const available = Array.isArray(devices)
    ? devices.filter(device => device && device.id && device.gatt)
    : [];

  if (preferredId) {
    const preferred = available.find(device => device.id === preferredId);
    if (preferred) return preferred;
  }

  return available.length === 1 ? available[0] : null;
}
