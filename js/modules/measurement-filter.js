/**
 * Filtrage des mesures BLE en direct, inspiré du filtre de saut de la référence
 * Purevent (ha-vmi-purevent). Les valeurs brutes restent conservées par le runtime.
 *
 * Le filtre n'altère pas l'historique CSV importé : il ne s'applique qu'aux
 * notifications live, pour lesquelles plusieurs échantillons successifs existent.
 */
const FIELD_LIMITS = Object.freeze({
  sal_t: { min: -30, max: 70, maxJump: 10, label: 'température salon', unit: '°C' },
  s1_t: { min: -30, max: 70, maxJump: 10, label: 'température sonde résistances', unit: '°C' },
  s2_t: { min: -30, max: 70, maxJump: 10, label: 'température air entrant', unit: '°C' },
  sal_h: { min: 0, max: 100, maxJump: 30, label: 'humidité salon', unit: '%' },
  s1_h: { min: 0, max: 100, maxJump: 30, label: 'humidité sonde résistances', unit: '%' },
  s2_h: { min: 0, max: 100, maxJump: 30, label: 'humidité air entrant', unit: '%' }
});

/**
 * @param {{min:number,max:number,maxJump:number}} limits Limites physiques et seuil de saut.
 * @param {number} [maxInvalidReadings=3] Nombre de valeurs invalides avant perte de la valeur stable.
 */
function createSingleFilter(limits, maxInvalidReadings = 3) {
  let value = null;
  let candidate = null;
  let invalidReadings = 0;

  return {
    filter(measurement) {
      if (!Number.isFinite(measurement) || measurement < limits.min || measurement > limits.max) {
        invalidReadings++;
        if (invalidReadings >= maxInvalidReadings) {
          value = null;
          candidate = null;
          return { value, status: 'unavailable' };
        }
        return { value, status: 'invalid' };
      }

      invalidReadings = 0;
      const closeToStable = value !== null && Math.abs(measurement - value) <= limits.maxJump;
      const confirmsCandidate = candidate !== null &&
        Math.abs(measurement - candidate) <= limits.maxJump;

      if (closeToStable || confirmsCandidate) {
        value = measurement;
        candidate = null;
        return { value, status: 'accepted' };
      }

      candidate = measurement;
      return { value, status: 'pending' };
    },
    reset() {
      value = null;
      candidate = null;
      invalidReadings = 0;
    }
  };
}

/** Crée les filtres indépendants des six mesures live de la VMI. */
export function createLiveMeasurementFilters({ maxInvalidReadings = 3 } = {}) {
  if (!Number.isInteger(maxInvalidReadings) || maxInvalidReadings <= 0) {
    throw new RangeError('maxInvalidReadings doit être un entier strictement positif.');
  }
  const filters = Object.fromEntries(
    Object.entries(FIELD_LIMITS).map(([key, limits]) => [
      key, createSingleFilter(limits, maxInvalidReadings)
    ])
  );

  return {
    /**
     * Filtre une mesure et rend la valeur stable à utiliser pour les calculs.
     * status = pending : un saut est en attente d'une seconde confirmation.
     * status = invalid : valeur hors plage, dernière valeur stable conservée.
     * status = unavailable : trois valeurs invalides consécutives, mesure inconnue.
     * @param {keyof typeof FIELD_LIMITS} key Identifiant du capteur.
     * @param {number|null|undefined} raw Valeur brute décodée.
     */
    filter(key, raw) {
      const filter = filters[key];
      if (!filter) throw new RangeError('Capteur inconnu : ' + key);
      return filter.filter(raw);
    },
    /** Réinitialise un capteur absent ou dont le flux change de source. */
    reset(key) {
      const filter = filters[key];
      if (!filter) throw new RangeError('Capteur inconnu : ' + key);
      filter.reset();
    },
    /** Une reconnexion démarre une nouvelle session de mesures. */
    resetAll() {
      Object.values(filters).forEach(filter => filter.reset());
    }
  };
}
