/** Dates, constantes et normalisation des valeurs. */
export const DAY=864e5;
/** Formate une valeur sur deux caractères.
 * @param {number|string} n Valeur à compléter.
 * @returns {string} Valeur formatée.
 */
export const pad=n=>String(n).padStart(2,'0');
/** Retourne la date locale du jour au format YYYY-MM-DD.
 * @returns {string} Date locale.
 */
export const localDay=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
/** Retourne le timestamp du début d'un jour local.
 * @param {string} s Date au format YYYY-MM-DD.
 * @returns {number} Timestamp en millisecondes.
 */
export const dayStart=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d).getTime()};
/** Décale une date du nombre de jours demandé.
 * @param {string} s Date de départ au format YYYY-MM-DD.
 * @param {number} k Nombre de jours à ajouter ou retirer.
 * @returns {string} Date résultante au format YYYY-MM-DD.
 */
export const shiftDay=(s,k)=>{const d=new Date(dayStart(s||localDay()));d.setDate(d.getDate()+k);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
/** Formate une valeur numérique pour l'affichage.
 * @param {number} v Valeur à formater.
 * @returns {string} Nombre arrondi ou tiret si non numérique.
 */
export const fmt=v=>Number.isFinite(v)?v.toFixed(1):'–';
/** Convertit une valeur numérique ou textuelle en nombre fini.
 * @param {unknown} v Valeur source.
 * @returns {number|null} Nombre converti ou null.
 */
export const num=v=>{if(typeof v==='number')return Number.isFinite(v)?v:null;if(typeof v!=='string')return null;const n=parseFloat(v.trim().replace(',','.'));return Number.isFinite(n)?n:null};
export const MIN_VALID=new Date(2025,0,1).getTime();
export const HIST_MAX=100000;
