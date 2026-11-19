/** Contrats discriminés des notifications Bluetooth décodées depuis les trames VMI+. */
export type VmiNotification =
  | { kind: 'history'; valid: false; length: number }
  | { kind: 'history'; valid: true; payload: Uint8Array; sequence: number; chunkIndex: number; received: number; final: boolean }
  | { kind: 'state'; filter: number; days: number; volume: number; maxTemperature: number; rawSpeed: number; boost: number; holiday: number }
  | { kind: 'room'; temperature: number; humidity: number }
  | { kind: 'probes'; firstTemperature: number; firstHumidity: number; secondTemperature: number; secondHumidity: number }
  | { kind: 'history-total'; total: number }
  | { kind: 'unknown'; type: number; length: number };
