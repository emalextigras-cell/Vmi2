/** Protocole Bluetooth VMI : UUID, CRC et trames. */
export const SVC_C='0003cbbb-0000-1000-8000-00805f9b0131';
export const CH_C='0003cbb1-0000-1000-8000-00805f9b0131';
export const SVC_T='0003cab5-0000-1000-8000-00805f9b0131';
export const CH_T='0003caa2-0000-1000-8000-00805f9b0131';
/**
 * crc — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {Iterable<number>} data Octets de la trame.
 * @returns {number} Résultat de crc.
 */
export function crc(data){let c=0;for(const b of data){c^=b;for(let i=0;i<8;i++)c=(c&0x80)?(((c<<1)^1)&255):((c<<1)&255)}return c^0x13}
/**
 * frame — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {number} reg Paramètre reg.
 * @param {number} val Paramètre val.
 * @returns {Uint8Array} Résultat de frame.
 */
export function frame(reg,val){const d=[0xA5,0xB6,0x10,0x06,0x05,reg,0,0,0,val];return new Uint8Array([...d,crc(d)])}
/**
 * timeFrame — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {Date} d Date à encoder.
 * @returns {Uint8Array} Résultat de timeFrame.
 */
export function timeFrame(d){const b=[0xA5,0xB6,0x1A,0x06,0x06,d.getFullYear()%100,d.getMonth()+1,d.getDate(),d.getHours(),d.getMinutes(),d.getSeconds()];return new Uint8Array([...b,crc(b)])}
/**
 * hex — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {ArrayLike<number>} a Octets à formater.
 * @returns {string} Résultat de hex.
 */
export const hex=a=>Array.from(a,x=>x.toString(16).padStart(2,'0')).join('');
