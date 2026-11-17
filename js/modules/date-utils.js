

/** Convertit une valeur numérique ou textuelle en nombre fini.
 * @param {unknown} v Valeur source.
 * @returns {number|null} Nombre converti ou null.
 */
export const num=v=>{if(typeof v==='number')return Number.isFinite(v)?v:null;if(typeof v!=='string')return null;const n=parseFloat(v.trim().replace(',','.'));return Number.isFinite(n)?n:null};
export const MIN_VALID=new Date(2025,0,1).getTime();
export const HIST_MAX=100000;
