/**
 * Façade de compatibilité pour les primitives BLE.
 *
 * L'orchestration Web Bluetooth (connexion, GATT, sessions, scrutation,
 * corrélation et écritures) est désormais portée par bluetooth-service.js.
 * Ce module ne conserve que les exports bas niveau et les helpers historiques.
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
