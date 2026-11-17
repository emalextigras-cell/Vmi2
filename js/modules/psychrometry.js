/** @typedef {import('../types/vmi-types.js').NullableNumber} NullableNumber */

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
/** Calcule les indicateurs psychrométriques des deux flux d'air.
 * @param {Pick<VmiRecord, 'st'|'sh'|'te'|'he'>} record Températures et humidités mesurées.
 * @returns {PsychrometricResult} Humidité absolue et point de rosée intérieur/entrant.
 */
export function psychro(r){return {haIn:absoluteHumidity(r.st,r.sh),haOut:absoluteHumidity(r.te,r.he),dewIn:dewPoint(r.st,r.sh),dewOut:dewPoint(r.te,r.he)}}
/**
 * validTemp — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {unknown} v Paramètre v.
 * @returns {boolean} Résultat de validTemp.
 */
export function validTemp(v){return Number.isFinite(v)&&v>-40&&v<80}
