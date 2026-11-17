/**
 * @typedef {Object} VmiRecord
 * @property {number} [t] Horodatage Unix en millisecondes.
 * @property {number} [st] Température intérieure en °C.
 * @property {number} [sh] Humidité relative intérieure en %.
 * @property {number} [te] Température de l'air entrant en °C.
 * @property {number} [he] Humidité relative de l'air entrant en %.
 * @property {number} [tExt] Température extérieure en °C.
 * @property {number} [h1] Humidité de la sonde résistances en %.
 * @property {number} [t1] Température de la sonde résistances en °C.
 * @property {number} [rpm] Régime moteur en tr/min.
 * @property {number} [debit] Débit en m³/h.
 * @property {number} [vmiModeRaw] Code brut du mode VMI.
 * @property {number} [d] Compteur de jours de fonctionnement.
 * @property {number} [consTmaxRaw] Consigne brute de température maximale.
 * @property {boolean} [fixed] Indique qu'un horodatage a été recalé.
 * @property {string|number} [id] Identifiant facultatif.
 */

/** @typedef {number|null} NullableNumber */
/** @typedef {Record<string, unknown>} UnknownRecord */
/** @typedef {{minSamples?: number, minDays?: number, maxGapMinutes?: number}} AnalysisOptions */

/** Calculs hygrométriques, approximation de Magnus. */
/**
 * saturationVaporPressure — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {number} temp Paramètre temp.
 * @returns {NullableNumber} Résultat de saturationVaporPressure.
 */
export function saturationVaporPressure(temp){
  if(!Number.isFinite(temp)||temp<=-80||temp>=80)return null;
  const pressure=6.112*Math.exp((17.62*temp)/(243.12+temp));
  return Number.isFinite(pressure)&&pressure>0?pressure:null;
}
/**
 * absoluteHumidity — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {number} temp Paramètre temp.
 * @param {number} rh Paramètre rh.
 * @returns {NullableNumber} Résultat de absoluteHumidity.
 */
export function absoluteHumidity(temp,rh){if(!Number.isFinite(temp)||!Number.isFinite(rh)||rh<0||rh>100||temp<=-80||temp>=80)return null;const e=(rh/100)*saturationVaporPressure(temp);const value=216.7*e/(temp+273.15);return Number.isFinite(value)?value:null}
/**
 * dewPoint — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {number} temp Paramètre temp.
 * @param {number} rh Paramètre rh.
 * @returns {NullableNumber} Résultat de dewPoint.
 */
export function dewPoint(temp,rh){if(!Number.isFinite(temp)||!Number.isFinite(rh)||temp<=-80||temp>=80||rh<=0||rh>100)return null;const a=17.62,b=243.12,g=Math.log(rh/100)+(a*temp)/(b+temp);const result=b*g/(a-g);return Number.isFinite(result)?result:null}
/**
 * psychro — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {unknown} r Paramètre r.
 * @returns {NullableNumber} Résultat de psychro.
 */
export function psychro(r){return {haIn:absoluteHumidity(r.st,r.sh),haOut:absoluteHumidity(r.te,r.he),dewIn:dewPoint(r.st,r.sh),dewOut:dewPoint(r.te,r.he)}}
/**
 * validTemp — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {unknown} v Paramètre v.
 * @returns {boolean} Résultat de validTemp.
 */
export function validTemp(v){return Number.isFinite(v)&&v>-40&&v<80}
