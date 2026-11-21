/**
 * Runtime Bluetooth de l'application.
 *
 * Les dépendances navigateur, l'état applicatif et le rendu sont injectés :
 * le comportement peut ainsi être testé sans charger app.js ni piloter une VMI.
 */

/**
 * Construit le traitement des notifications Bluetooth.
 * Les objets d'état sont récupérés à chaque notification car download est remplacé
 * lors du démarrage d'une nouvelle synchronisation.
 */
export function createBluetoothNotificationHandler(deps) {
  const {
    decodeVmiNotification,
    getDownload,
    getCur,
    getLastSeen,
    acceptHistoryFragment,
    markHistoryStreamInvalid,
    parseDownloadLine,
    incrementDlFrames,
    armTimer,
    finishDownload,
    updateLiveMetrics,
    log,
    hex,
    $,
    now = Date.now
  } = deps;

  return function handleNotification(ev) {
    const value = ev.target.value;
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const decoded = decodeVmiNotification(bytes);
    if (!decoded) return;

    const timestamp = now();
    const download = getDownload();

    if (decoded.kind === 'invalid') {
      const detail = decoded.reason === 'checksum'
        ? 'contrôle XOR invalide'
        : decoded.reason === 'length'
          ? 'longueur déclarée incohérente'
          : `notification tronquée : ${decoded.length}/${decoded.requiredLength} octets`;
      log(`Notification VMI invalide (type 0x${decoded.type.toString(16).padStart(2, '0')}) : ${detail}, ignorée.`);
      return;
    }

    if (decoded.kind === 'history') {
      if (!download.on) return;
      if (!decoded.valid) {
        markHistoryStreamInvalid(download.historyStream);
        download.integrityGap = true;
        download.buf = '';
        const detail = decoded.reason === 'checksum'
          ? 'contrôle XOR invalide'
          : decoded.reason === 'length'
            ? 'longueur déclarée incohérente'
            : 'trame tronquée';
        log(`Trame d’historique invalide (${detail}) : transfert marqué incomplet, synchronisation à relancer.`);
        return;
      }

      const payload = new TextDecoder('latin1').decode(decoded.payload);
      // Dans la capture Purevent, les lignes CSV datées utilisent cinq fragments (0 à 40).
      // Les blocs de métadonnées ne suivent pas ce format et ne sont pas soumis à cette règle.
      const integrity = acceptHistoryFragment(download.historyStream, {
        sequence: decoded.sequence,
        chunkIndex: decoded.chunkIndex,
        expectedFragments: /^\s*\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2};/.test(payload) ? 5 : undefined,
        payload
      });
      if (integrity.duplicate) return;
      if (integrity.gap) {
        download.integrityGap = true;
        if (integrity.resetBuffer) download.buf = '';
        log('Lacune ou désordre dans le flux historique : fragment incomplet écarté.');
      }
      if (!integrity.accepted) return;

      const frameCount = incrementDlFrames();
      if (frameCount % 200 === 1) log(`< trames d’historique reçues : ${frameCount}`);
      download.got = true;
      download.lastPacket = timestamp;
      download.buf += payload;
      const lines = download.buf.split(/\r\n|\n|\r(?!$)/);
      download.buf = lines.pop();
      lines.forEach(parseDownloadLine);

      // Une ligne déjà connue marque la borne de coupure, mais on attend tous
      // les fragments observés de cette ligne avant de certifier la synchronisation.
      const lineComplete = download.historyStream.expectedFragments !== null &&
        download.historyStream.expectedChunk === download.historyStream.expectedFragments * 10;
      const reachedLastSequence = Number.isSafeInteger(download.totalSequences) &&
        download.totalSequences > 0 && decoded.sequence + 1 >= download.totalSequences;
      if (download.on && lineComplete && (download.reachedCut || reachedLastSequence)) {
        // La dernière ligne peut ne pas se terminer par un séparateur CSV.
        // La traiter avant de certifier la fin évite de perdre ce dernier relevé.
        if (download.buf && download.buf.trim()) parseDownloadLine(download.buf);
        download.buf = '';
        finishDownload(true);
        return;
      }

      if (download.on) {
        $('dlp').textContent = `${download.rows.length} nouvelles lignes (index historique ${decoded.sequence + 1} / ${download.totalSequences || '?'})`;
        armTimer();
        // L’octet 13 n’est pas interprété comme marqueur de fin : sa sémantique
        // n’est pas démontrée par la capture Purevent disponible.
      }
      return;
    }

    log('< ' + hex(bytes));
    const cur = getCur();
    const lastSeen = getLastSeen();

    if (decoded.kind === 'state') {
      cur.filtre = decoded.filter;
      cur.jours = decoded.days;
      cur.vol = decoded.volume;
      cur.tmax = decoded.maxTemperature;
      cur.vit = decoded.rawSpeed + 1; // code brut VMI : ne jamais le traiter comme niveau manuel
      cur.boost = decoded.boost;
      cur.hol = decoded.holiday;
      cur.rpm = null;
      lastSeen.state = timestamp;
      $('fi').textContent = cur.filtre;
      $('jf').textContent = cur.jours;
      $('vo').textContent = cur.vol;
      $('tm').textContent = cur.tmax;
      $('sp').textContent = cur.vit;
      $('bo').textContent = cur.boost ? 'Actif' : 'Arrêté';
      $('ho').textContent = cur.hol ? 'Actif' : 'Arrêté';
    } else if (decoded.kind === 'room') {
      cur.sal_t = decoded.temperature;
      cur.sal_h = decoded.humidity;
      lastSeen.salon = timestamp;
      $('tp').textContent = cur.sal_t;
      $('hp').textContent = cur.sal_h;
    } else if (decoded.kind === 'probes') {
      cur.s1_t = decoded.firstTemperature;
      cur.s1_h = decoded.firstHumidity;
      cur.s2_t = decoded.secondTemperature;
      cur.s2_h = decoded.secondHumidity;
      lastSeen.probes = timestamp;
      $('ti').textContent = cur.s1_t;
      $('hi').textContent = cur.s1_h;
      $('t2').textContent = cur.s2_t;
      $('h2').textContent = cur.s2_h;
    } else if (decoded.kind === 'history-count') {
      download.totalSequences = decoded.totalSequences;
      return;
    } else {
      return;
    }

    updateLiveMetrics();
  };
}

/**
 * Construit la reconnexion automatique.
 * La gestion du timer reste injectable pour pouvoir tester les délais et annulations.
 */
export function createReconnectHandler(deps) {
  async function reconnect() {
    if (deps.isManualDisconnect() || !deps.getDevice() || deps.isConnectionRequestPending()) return;

    const intent = deps.getConnectionIntentGeneration();
    try {
      await deps.connectDevice(deps.getDevice(), intent);
    } catch (error) {
      if (intent !== deps.getConnectionIntentGeneration() || deps.isConnectionRequestPending()) return;
      deps.log('Reconnexion échouée : ' + error.message);
      deps.clearTimeout(deps.getReconnectTimer());
      deps.setReconnectTimer(deps.setTimeout(reconnect, 7000));
    }
  }
  return reconnect;
}
