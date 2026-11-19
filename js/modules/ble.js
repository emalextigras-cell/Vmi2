/**
 * Point d'entrée des primitives Bluetooth de bas niveau.
 * Ce module ne gère pas le DOM : il regroupe le protocole, le décodage,
 * la séquence de session, la file d'écriture et le traitement des fragments.
 *
 * La connexion Web Bluetooth et son cycle de vie restent temporairement
 * orchestrés par app.js ; leur extraction est reportée au chantier app.js.
 */
export {
  SVC_C, CH_C, SVC_T, CH_T, crc, frame, timeFrame, hex
} from './bluetooth-protocol.js';
export { decodeVmiNotification } from './bluetooth-decoder.js';
export { createBleWriteQueue } from './bluetooth-write-queue.js';
export { runBleSessionSequence } from './bluetooth-session.js';
export {
  createHistoryStreamState,
  acceptHistoryFragment,
  isHistorySyncBaseline,
  markHistoryRows,
  markHistoryStreamInvalid
} from './bluetooth-history-stream.js';
export { validateBluetoothHistoryRow } from './bluetooth-history-row.js';
