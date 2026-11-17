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

/** Dates, constantes et normalisation des valeurs. */
export const DAY=864e5;
/**
 * pad — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {unknown} n Paramètre n.
 * @returns {unknown} Résultat du module.
 */
export const pad=n=>String(n).padStart(2,'0');
/**
 * localDay — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @returns {unknown} Résultat du module.
 */
export const localDay=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
/**
 * dayStart — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {unknown} s Paramètre s.
 * @returns {unknown} Résultat du module.
 */
export const dayStart=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d).getTime()};
/**
 * shiftDay — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {unknown} s Paramètre s.
 * @param {unknown} k Paramètre k.
 * @returns {unknown} Résultat du module.
 */
export const shiftDay=(s,k)=>{const d=new Date(dayStart(s||localDay()));d.setDate(d.getDate()+k);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
/**
 * fmt — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {unknown} v Paramètre v.
 * @returns {unknown} Résultat du module.
 */
export const fmt=v=>Number.isFinite(v)?v.toFixed(1):'–';
/**
 * num — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {unknown} v Paramètre v.
 * @returns {unknown} Résultat du module.
 */
export const num=v=>{if(typeof v==='number')return Number.isFinite(v)?v:null;if(typeof v!=='string')return null;const n=parseFloat(v.trim().replace(',','.'));return Number.isFinite(n)?n:null};
export const MIN_VALID=new Date(2025,0,1).getTime();
export const HIST_MAX=100000;
