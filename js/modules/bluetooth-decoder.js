/**
 * Décodage pur des notifications VMI observées.
 * Les longueurs et le contrôle XOR sont déduits des trames Purevent capturées.
 * Le codage des températures négatives reste volontairement non interprété :
 * les références Purevent et VMI+ divergent et aucune capture utilisateur sous 0 °C ne tranche.
 */
/**
 * @typedef {{kind:'invalid',type:number,length:number,requiredLength:number,reason:'truncated'|'length'|'checksum'}|{kind:'history',valid:false,length:number,reason:'truncated'|'length'|'checksum'}|{kind:'history',valid:true,payload:Uint8Array,sequence:number,chunkIndex:number,received:number}|{kind:'state',filter:number,days:number,volume:number,maxTemperature:number,rawSpeed:number,boost:number,holiday:number}|{kind:'room',temperature:number,humidity:number}|{kind:'probes',firstLocation:number,firstTemperature:number,firstHumidity:number,secondLocation:number,secondTemperature:number,secondHumidity:number}|{kind:'history-total',total:number}|{kind:'unknown',type:number,length:number}} VmiNotification
 */

/**
 * Vérifie le XOR du message VMI, de l'octet type jusqu'à l'avant-dernier octet.
 * @param {Uint8Array} bytes Notification reçue.
 * @param {number} frameLength Longueur réelle déclarée par l'octet 4, plus les 6 octets d'en-tête.
 * @returns {boolean} true si le dernier octet correspond au XOR calculé.
 */
function hasValidChecksum(bytes, frameLength) {
  let checksum = 0;
  for (let i = 2; i < frameLength - 1; i++) checksum ^= bytes[i];
  return checksum === bytes[frameLength - 1];
}

/**
 * decodeVmiNotification — contrat discriminé d'entrée/sortie pour l'analyse statique.
 * @param {Uint8Array|ArrayBuffer|number[]} input Trame Bluetooth brute.
 * @returns {VmiNotification|null} Notification décodée.
 */
export function decodeVmiNotification(input) {
  if (!input) return null;
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 3 || bytes[0] !== 0xA5 || bytes[1] !== 0xB6) return null;

  const type = bytes[2];
  const requiredLengths = { 0x01: 61, 0x02: 128, 0x03: 31, 0x04: 11, 0x30: 116 };
  const requiredLength = requiredLengths[type];
  if (!requiredLength) return { kind: 'unknown', type, length: bytes.length };

  if (bytes.length < 5) {
    return type === 0x30
      ? { kind: 'history', valid: false, length: bytes.length, reason: 'truncated' }
      : { kind: 'invalid', type, length: bytes.length, requiredLength, reason: 'truncated' };
  }

  // Sur les trames observées, l'octet 4 contient la longueur utile moins les 6 octets d'en-tête.
  const frameLength = bytes[4] + 6;
  if (frameLength < requiredLength) {
    return type === 0x30
      ? { kind: 'history', valid: false, length: bytes.length, reason: 'length' }
      : { kind: 'invalid', type, length: bytes.length, requiredLength, reason: 'length' };
  }
  if (bytes.length < frameLength) {
    return type === 0x30
      ? { kind: 'history', valid: false, length: bytes.length, reason: 'truncated' }
      : { kind: 'invalid', type, length: bytes.length, requiredLength: frameLength, reason: 'truncated' };
  }
  if (!hasValidChecksum(bytes, frameLength)) {
    return type === 0x30
      ? { kind: 'history', valid: false, length: bytes.length, reason: 'checksum' }
      : { kind: 'invalid', type, length: bytes.length, requiredLength: frameLength, reason: 'checksum' };
  }

  if (type === 0x30) {
    let end = 14;
    const payloadEnd = frameLength - 1;
    while (end < payloadEnd && bytes[end] !== 0) end++;
    return {
      kind: 'history',
      valid: true,
      payload: bytes.slice(14, end),
      sequence: bytes[9] | (bytes[10] << 8),
      chunkIndex: bytes[12],
      received: bytes[9] | (bytes[10] << 8)
    };
  }

  if (type === 0x01) {
    return {
      kind: 'state',
      filter: bytes[28] | (bytes[29] << 8),
      days: bytes[26] | (bytes[27] << 8),
      volume: bytes[22] | (bytes[23] << 8),
      maxTemperature: bytes[38],
      rawSpeed: bytes[34],
      boost: bytes[44],
      holiday: bytes[43]
    };
  }

  if (type === 0x02) {
    return { kind: 'room', temperature: bytes[11], humidity: bytes[13] };
  }

  if (type === 0x03) {
    // Chaque sonde occupe cinq octets à partir de l'offset 5 :
    // emplacement, température, octet réservé, humidité, octet réservé.
    return {
      kind: 'probes',
      firstLocation: bytes[5],
      firstTemperature: bytes[6],
      firstHumidity: bytes[8],
      secondLocation: bytes[10],
      secondTemperature: bytes[11],
      secondHumidity: bytes[13]
    };
  }

  return { kind: 'history-total', total: bytes[6] | (bytes[7] << 8) };
}
