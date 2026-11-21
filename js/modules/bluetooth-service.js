/**
 * Service BLE Purevent.
 *
 * Ce module possède le cycle de vie Web Bluetooth, les caractéristiques GATT,
 * les sessions, la file d'écriture, la corrélation des réponses et la scrutation.
 * L'interface et le traitement métier des notifications sont injectés.
 */
import { SVC_C, CH_C, SVC_T, CH_T, frame, timeFrame, hex } from './bluetooth-protocol.js';
import { createBleWriteQueue } from './bluetooth-write-queue.js';
import { createBleResponseGate, BLE_RESPONSE_KIND_BY_REGISTER } from './bluetooth-response-gate.js';
import { isBleStateStale } from './bluetooth-freshness.js';
import { chooseAuthorizedDevice } from './bluetooth-autoconnect.js';

/**
 * @param {{
 *  navigatorRef?: object, storageRef?: object, sleep: Function,
 *  setStatus: Function, log: Function, showError: Function,
 *  onNotification: Function, onSessionCleanup?: Function, onConnected?: Function,
 *  getLastStateAt: Function, isDownloadActive: Function, isCommandPending: Function,
 *  onSnapshot: Function, onAutoHistory: Function, now?: Function,
 *  setTimeoutFn?: Function, clearTimeoutFn?: Function,
 *  setIntervalFn?: Function, clearIntervalFn?: Function
 * }} deps
 */
export function createBluetoothService(deps) {
  const navigatorRef = deps.navigatorRef ?? globalThis.navigator;
  const storageRef = deps.storageRef ?? globalThis.localStorage;
  const now = deps.now ?? Date.now;
  const setTimeoutFn = deps.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = deps.clearTimeoutFn ?? clearTimeout;
  const setIntervalFn = deps.setIntervalFn ?? setInterval;
  const clearIntervalFn = deps.clearIntervalFn ?? clearInterval;

  let device = null;
  let characteristicCommand = null;
  let characteristicTelemetry = null;
  let generation = 0;
  let connectionIntent = 0;
  let connectionRequestPending = false;
  let manualDisconnect = false;
  let intentionalDisconnect = false;
  let connectedAt = 0;
  let staleDisconnectRequested = false;
  let notificationHandler = null;
  let notificationCharacteristics = [];
  let disconnectHandler = null;
  let reconnectTimer = null;
  let pollTimer = null;
  let snapshotTimer = null;
  let freshnessTimer = null;
  let pollingToken = null;
  let autoHistoryDone = false;

  const responseGate = createBleResponseGate();
  const connected = () => !!(
    characteristicCommand && device && device.gatt && device.gatt.connected
  );

  const writeQueue = createBleWriteQueue({
    isConnected: connected,
    getCharacteristic: () => characteristicCommand,
    getConnectionToken: () => generation,
    sleep: deps.sleep,
    onSuccess: bytes => deps.log('> ' + hex(bytes)),
    onError: error => {
      if (error && error.code === 'BLE_SESSION_CHANGED') {
        deps.log('Commande Bluetooth en attente annulée après changement de session.');
        return;
      }
      deps.showError('Échec de l’envoi Bluetooth : ' + (error.message || error));
      deps.log('Erreur commande : ' + (error.message || error));
    }
  });

  function writeFrame(bytes) {
    return writeQueue.write(bytes);
  }

  function send(register, value) {
    return writeFrame(frame(register, value));
  }

  function disconnectAfterCorrelationLoss() {
    if (!responseGate.isInvalidated || !connected()) return;
    deps.log('Corrélation des réponses BLE invalidée : fermeture de cette connexion avant toute nouvelle requête.');
    device.gatt.disconnect();
  }

  async function sendAndWait(register, value, expectedKind = BLE_RESPONSE_KIND_BY_REGISTER[register], timeoutMs = 5000) {
    if (!expectedKind) return { written: await send(register, value), responded: false };
    if (responseGate.isInvalidated) {
      disconnectAfterCorrelationLoss();
      return { written: false, responded: false };
    }
    if (responseGate.pendingKind) {
      deps.log('Requête BLE ignorée : une réponse est déjà attendue.');
      return { written: false, responded: false };
    }
    const response = responseGate.waitFor(expectedKind, timeoutMs);
    const written = await send(register, value);
    if (!written) {
      responseGate.cancel(new Error('Écriture BLE non confirmée.'));
      await response.catch(() => {});
      disconnectAfterCorrelationLoss();
      return { written: false, responded: false };
    }
    try {
      const valueReceived = await response;
      return { written: true, responded: true, response: valueReceived };
    } catch (error) {
      deps.log('Réponse VMI attendue absente : ' + (error.message || error));
      disconnectAfterCorrelationLoss();
      return { written: true, responded: false, response: null };
    }
  }

  async function writeFrameAndWait(bytes, expectedKind, timeoutMs = 5000) {
    if (responseGate.isInvalidated) {
      disconnectAfterCorrelationLoss();
      return false;
    }
    if (responseGate.pendingKind) {
      deps.log('Écriture différée : une réponse Bluetooth est déjà attendue.');
      return false;
    }
    const response = responseGate.waitFor(expectedKind, timeoutMs);
    const written = await writeFrame(bytes);
    if (!written) {
      responseGate.cancel(new Error('Écriture BLE non confirmée.'));
      await response.catch(() => {});
      disconnectAfterCorrelationLoss();
      return false;
    }
    try {
      await response;
      return true;
    } catch (error) {
      deps.log('Accusé VMI absent : ' + (error.message || error));
      disconnectAfterCorrelationLoss();
      return false;
    }
  }

  async function setClock(date = new Date()) {
    if (!connected()) return false;
    const token = generation;
    while (pollingToken === token && connected()) await deps.sleep(50);
    if (!connected() || token !== generation) return false;
    return writeFrameAndWait(timeFrame(date), 'ack');
  }

  function detachListeners() {
    if (notificationHandler) {
      notificationCharacteristics.forEach(item =>
        item.removeEventListener('characteristicvaluechanged', notificationHandler)
      );
      notificationHandler = null;
      notificationCharacteristics = [];
    }
    if (device && disconnectHandler) {
      device.removeEventListener('gattserverdisconnected', disconnectHandler);
      disconnectHandler = null;
    }
  }

  function cleanupConnection() {
    generation++;
    responseGate.cancel(new Error('Session Bluetooth terminée.'));
    clearIntervalFn(freshnessTimer);
    freshnessTimer = null;
    connectedAt = 0;
    staleDisconnectRequested = false;
    clearIntervalFn(pollTimer);
    clearIntervalFn(snapshotTimer);
    clearTimeoutFn(reconnectTimer);
    pollingToken = null;
    deps.onSessionCleanup();
    detachListeners();
    characteristicCommand = null;
    characteristicTelemetry = null;
  }

  async function poll(force = false) {
    const token = generation;
    if (pollingToken === token || !connected() || deps.isDownloadActive() ||
        (deps.isCommandPending() && !force)) return;
    pollingToken = token;
    try {
      for (const [register, kind] of [[3, 'state'], [6, 'room'], [7, 'probes']]) {
        if (token !== generation || !connected() || deps.isDownloadActive() ||
            deps.isCommandPending()) break;
        const result = await sendAndWait(register, 0, kind);
        if (!result.responded || token !== generation) break;
      }
    } finally {
      if (pollingToken === token) pollingToken = null;
    }
  }

  function checkFreshness() {
    if (staleDisconnectRequested) return;
    if (!isBleStateStale({
      connected: connected(),
      downloadActive: deps.isDownloadActive(),
      commandPending: deps.isCommandPending(),
      now: now(),
      connectedAt,
      lastStateAt: deps.getLastStateAt(),
      maxSilenceMs: 35000
    })) return;
    staleDisconnectRequested = true;
    deps.log('Aucune trame d’état valide depuis 35 s malgré une liaison GATT ouverte : reconnexion demandée.');
    deps.setStatus('VMI silencieuse, reconnexion…');
    if (device && device.gatt && device.gatt.connected) device.gatt.disconnect();
  }

  function startPolling() {
    clearIntervalFn(pollTimer);
    clearIntervalFn(snapshotTimer);
    clearIntervalFn(freshnessTimer);
    freshnessTimer = setIntervalFn(checkFreshness, 5000);
    const token = generation;
    void poll();
    pollTimer = setIntervalFn(() => {
      if (token === generation) void poll();
    }, 12000);
    setTimeoutFn(() => {
      if (token === generation && connected()) deps.onSnapshot();
    }, 15000);
    snapshotTimer = setIntervalFn(() => {
      if (token === generation && connected()) deps.onSnapshot();
    }, 300000);
  }

  function sessionIsCurrent(token, expectedDevice = device) {
    return token === generation && device === expectedDevice;
  }

  async function connectCharacteristics(server, token, targetDevice) {
    const serviceCommand = await server.getPrimaryService(SVC_C);
    if (!sessionIsCurrent(token, targetDevice)) return false;
    const command = await serviceCommand.getCharacteristic(CH_C);
    if (!sessionIsCurrent(token, targetDevice)) return false;
    const serviceTelemetry = await server.getPrimaryService(SVC_T);
    if (!sessionIsCurrent(token, targetDevice)) return false;
    const telemetry = await serviceTelemetry.getCharacteristic(CH_T);
    if (!sessionIsCurrent(token, targetDevice)) return false;

    notificationHandler = event => {
      if (!sessionIsCurrent(token, targetDevice) || !connected()) return;
      if (event.target !== telemetry && event.target !== command) return;
      deps.onNotification(event);
    };
    notificationCharacteristics = [telemetry, command];
    telemetry.addEventListener('characteristicvaluechanged', notificationHandler);
    command.addEventListener('characteristicvaluechanged', notificationHandler);
    await telemetry.startNotifications();
    if (!sessionIsCurrent(token, targetDevice)) return false;
    try {
      await command.startNotifications();
    } catch (error) {
      if (!sessionIsCurrent(token, targetDevice)) return false;
      deps.log('Notifications canal commande non disponibles : ' + error.message);
    }
    if (!sessionIsCurrent(token, targetDevice)) return false;
    characteristicCommand = command;
    characteristicTelemetry = telemetry;
    return true;
  }

  function preferredDeviceId() {
    try { return storageRef.getItem('vmi_bluetooth_device_id') || ''; }
    catch { return ''; }
  }

  function rememberDevice(targetDevice) {
    try {
      if (targetDevice && targetDevice.id) {
        storageRef.setItem('vmi_bluetooth_device_id', targetDevice.id);
      }
    } catch {}
  }

  async function connectDevice(targetDevice, intent = connectionIntent) {
    if (!targetDevice || !targetDevice.gatt) throw new Error('Appareil Bluetooth invalide.');
    generation++;
    const token = generation;
    const isCurrent = () => sessionIsCurrent(token, targetDevice) && intent === connectionIntent;
    clearTimeoutFn(reconnectTimer);
    detachListeners();
    characteristicCommand = null;
    characteristicTelemetry = null;
    device = targetDevice;
    manualDisconnect = false;
    disconnectHandler = () => {
      if (!sessionIsCurrent(token, targetDevice)) return;
      onDisconnect();
    };
    device.addEventListener('gattserverdisconnected', disconnectHandler);
    deps.setStatus('Connexion à ' + (device.name || 'la VMI') + '…');
    try {
      const server = await device.gatt.connect();
      if (!isCurrent()) {
        if (sessionIsCurrent(token, targetDevice)) cleanupConnection();
        return false;
      }
      const ready = await connectCharacteristics(server, token, targetDevice);
      if (!ready || !isCurrent()) {
        if (sessionIsCurrent(token, targetDevice)) cleanupConnection();
        return false;
      }
      responseGate.reset();
      connectedAt = now();
      staleDisconnectRequested = false;
      deps.setStatus('Connecté à ' + (device.name || 'la VMI') + '. Synchronisation des données…', true);
      startPolling();
      deps.onConnected({ token, device: targetDevice });
      setTimeoutFn(() => {
        if (sessionIsCurrent(token, targetDevice) && connected() && !autoHistoryDone) {
          autoHistoryDone = true;
          deps.onAutoHistory();
        }
      }, 3000);
      return true;
    } catch (error) {
      if (!sessionIsCurrent(token, targetDevice)) return false;
      cleanupConnection();
      if (intent !== connectionIntent) return false;
      throw error;
    }
  }

  function onDisconnect() {
    const wasIntentional = intentionalDisconnect;
    intentionalDisconnect = false;
    cleanupConnection();
    if (wasIntentional) {
      deps.setStatus('Synchronisation terminée. Bluetooth déconnecté.');
      return;
    }
    deps.setStatus('Déconnecté.');
    if (!manualDisconnect && device) {
      deps.setStatus('Connexion perdue, tentative de reconnexion…');
      clearTimeoutFn(reconnectTimer);
      reconnectTimer = setTimeoutFn(reconnect, 4000);
    }
  }

  async function reconnect() {
    if (manualDisconnect || !device || connectionRequestPending) return;
    const intent = connectionIntent;
    try {
      await connectDevice(device, intent);
    } catch (error) {
      if (intent !== connectionIntent || connectionRequestPending) return;
      deps.log('Reconnexion échouée : ' + error.message);
      clearTimeoutFn(reconnectTimer);
      reconnectTimer = setTimeoutFn(reconnect, 7000);
    }
  }

  async function connectBLE() {
    if (connectionRequestPending) return;
    connectionRequestPending = true;
    const intent = ++connectionIntent;
    deps.onManualConnectRequested();
    manualDisconnect = false;
    autoHistoryDone = false;
    clearTimeoutFn(reconnectTimer);
    deps.showError('');
    try {
      if (!navigatorRef.bluetooth) {
        deps.showError('Web Bluetooth indisponible. Utilise Chrome sur Android ou un navigateur compatible, en HTTPS.');
        return;
      }
      // requestDevice reste directement dans le geste utilisateur exigé par le navigateur.
      const selected = await navigatorRef.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SVC_C, SVC_T]
      });
      if (intent !== connectionIntent) return;
      rememberDevice(selected);
      await connectDevice(selected, intent);
    } catch (error) {
      if (intent === connectionIntent) {
        deps.showError(error);
        deps.setStatus('Connexion impossible.');
      }
    } finally {
      if (intent === connectionIntent) {
        connectionRequestPending = false;
        deps.onManualConnectSettled(connected());
      }
    }
  }

  async function autoConnectAuthorizedDevice() {
    const intent = connectionIntent;
    if (connectionRequestPending) return;
    if (!navigatorRef.bluetooth || typeof navigatorRef.bluetooth.getDevices !== 'function') {
      deps.setStatus('Autorisation Bluetooth requise : appuie sur « Se connecter ».');
      return;
    }
    try {
      const devices = await navigatorRef.bluetooth.getDevices();
      if (intent !== connectionIntent || connectionRequestPending) return;
      const selected = chooseAuthorizedDevice(devices, preferredDeviceId());
      if (!selected) {
        deps.setStatus(devices.length > 1
          ? 'Plusieurs appareils sont autorisés. Appuie sur « Se connecter » pour choisir la VMI.'
          : 'VMI non encore autorisée. Appuie sur « Se connecter » une première fois.');
        return;
      }
      deps.log('VMI déjà autorisée détectée : tentative de reconnexion automatique.');
      await connectDevice(selected, intent);
    } catch (error) {
      if (intent !== connectionIntent) return;
      deps.log('Reconnexion automatique indisponible : ' + (error.message || error));
      deps.setStatus('Reconnexion automatique impossible. Appuie sur « Se connecter ».');
    }
  }

  function disconnect() {
    manualDisconnect = true;
    cleanupConnection();
    if (device && device.gatt && device.gatt.connected) device.gatt.disconnect();
    deps.setStatus('Déconnexion demandée.');
  }

  function disconnectIntentional() {
    if (!device || !device.gatt || !device.gatt.connected) return false;
    intentionalDisconnect = true;
    device.gatt.disconnect();
    return true;
  }

  return {
    connected,
    isAvailable: () => !!navigatorRef.bluetooth,
    connectBLE,
    autoConnectAuthorizedDevice,
    disconnect,
    disconnectIntentional,
    writeFrame,
    send,
    sendAndWait,
    writeFrameAndWait,
    setClock,
    notifyResponse: (kind, value) => responseGate.notify(kind, value),
    getDevice: () => device,
    getSessionToken: () => generation,
    isSessionCurrent: (token, expectedDevice = device) => sessionIsCurrent(token, expectedDevice) && connected(),
    isPolling: token => pollingToken === token,
    getConnectedAt: () => connectedAt
  };
}
