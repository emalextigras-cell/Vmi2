/**
 * Décodage pur des notifications VMI observées.
 * Les offsets reprennent les trames observées ; les noms de champs suivent le protocole
 * de référence lorsqu’il identifie leur rôle. Les octets non identifiés restent bruts.
 */
/**
 * @typedef {{kind:'invalid',type:number,length:number,requiredLength:number}|{kind:'history',valid:false,length:number}|{kind:'history',valid:true,payload:Uint8Array,sequence:number,chunkIndex:number,received:number,final:boolean}|{kind:'state',filter:number,days:number,volume:number,maxTemperature:number,rawSpeed:number,boost:number,holiday:number}|{kind:'room',temperature:number,humidity:number}|{kind:'probes',firstTemperature:number,firstHumidity:number,secondTemperature:number,secondHumidity:number}|{kind:'history-total',total:number}|{kind:'unknown',type:number,length:number}} VmiNotification
 */
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
  const requiredLengths = { 0x01: 54, 0x02: 14, 0x03: 14, 0x04: 8 };
  const requiredLength = requiredLengths[type];
  if (requiredLength && bytes.length < requiredLength) {
    return { kind: 'invalid', type, length: bytes.length, requiredLength };
  }

  if (type === 0x30) {
    if (bytes.length < 14) {
      return { kind: 'history', valid: false, length: bytes.length };
    }
    let end = 14;
    while (end < bytes.length && bytes[end] !== 0) end++;
    return {
      kind: 'history',
      valid: true,
      payload: bytes.slice(14, end),
      sequence: bytes[9] | (bytes[10] << 8),
      chunkIndex: bytes[12],
      received: bytes[9] | (bytes[10] << 8),
      final: bytes[13] === 1
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
    return {
      kind: 'probes',
      firstTemperature: bytes[6],
      firstHumidity: bytes[8],
      secondTemperature: bytes[11],
      secondHumidity: bytes[13]
    };
  }

  if (type === 0x04) {
    return { kind: 'history-total', total: bytes[6] | (bytes[7] << 8) };
  }

  return { kind: 'unknown', type, length: bytes.length };
}
