/**
 * Adaptateur des notifications Purevent entre le protocole BLE et l'état applicatif.
 * Le décodeur, le réassemblage des fragments et la corrélation des réponses restent
 * hors de app.js ; les callbacks DOM/métier sont fournis par l'application.
 */
import { decodeVmiNotification } from './bluetooth-decoder.js';
import { createBluetoothNotificationHandler } from './bluetooth-runtime.js';
import { acceptHistoryFragment, markHistoryStreamInvalid } from './bluetooth-history-stream.js';
import { hex } from './bluetooth-protocol.js';

/**
 * @param {object} deps Dépendances de l'état applicatif et du rendu.
 * @returns {Function} Gestionnaire d'une notification Web Bluetooth.
 */
export function createPureventNotificationHandler(deps) {
  const handler = createBluetoothNotificationHandler({
    decodeVmiNotification,
    getDownload: deps.getDownload,
    getCur: deps.getCur,
    getLastSeen: deps.getLastSeen,
    acceptHistoryFragment,
    markHistoryStreamInvalid,
    parseDownloadLine: deps.parseDownloadLine,
    incrementDlFrames: deps.incrementDlFrames,
    armTimer: deps.armTimer,
    finishDownload: deps.finishDownload,
    updateLiveMetrics: deps.updateLiveMetrics,
    log: deps.log,
    hex,
    $: deps.$,
    onDecodedFrame: deps.notifyResponse,
    onStateTelemetry: deps.onStateTelemetry,
    filterMeasurement: deps.filterMeasurement,
    resetMeasurementFilter: deps.resetMeasurementFilter
  });
  return handler;
}
