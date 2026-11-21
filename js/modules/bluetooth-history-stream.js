/** @typedef {import('../types/vmi-types.js').VmiRecord} VmiRecord */
/** @typedef {{sequence: number|null, expectedChunk: number, expectedFragments: number|null, skippedSequence: number|null, fragments: Map<string,string>, gapCount: number}} HistoryStreamState */

/**
 * Contrôle l'ordre des fragments d'historique observés dans les notifications VMI.
 * La capture confirme l'index de ligne (octets 9-10), le nombre de fragments
 * (octet 11 : 1 pour les métadonnées, 5 pour les lignes) et l'index de fragment
 * (octet 12, par pas de 10). Le parseur historique interprète l'octet 13
 * comme indicateur de fin, mais la capture fournie n'observe aucune valeur 1.
 * Cette garde détecte uniquement les répétitions, trous et désordres observés.
 */
/**
 * createHistoryStreamState — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @returns {HistoryStreamState} État du flux initialisé.
 */
export function createHistoryStreamState() {
  return {
    sequence: null,
    expectedChunk: 0,
    expectedFragments: null,
    skippedSequence: null,
    fragments: new Map(),
    gapCount: 0
  };
}

/**
 * acceptHistoryFragment — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {HistoryStreamState} state État du flux à mettre à jour.
 * @param {unknown} fragment Fragment reçu, validé avant acceptation.
 * @returns {{accepted: boolean, duplicate: boolean, gap: boolean, resetBuffer: boolean}} Décision de réception du fragment.
 */
export function acceptHistoryFragment(state, fragment) {
  const data = fragment && typeof fragment === 'object'
    ? /** @type {Record<string, unknown>} */ (fragment) : {};
  const sequence = data.sequence;
  const chunkIndex = data.chunkIndex;
  const payload = String(data.payload ?? '');
  const expectedFragments = data.expectedFragments;
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 0 ||
      typeof chunkIndex !== 'number' || !Number.isSafeInteger(chunkIndex) ||
      chunkIndex < 0 || chunkIndex % 10 !== 0 ||
      (expectedFragments !== undefined && (!Number.isSafeInteger(expectedFragments) || expectedFragments < 1 || chunkIndex >= expectedFragments * 10))) {
    state.gapCount++;
    // Si l'index de ligne reste lisible, condamner cette ligne et ignorer
    // tous ses fragments suivants jusqu'à la ligne suivante.
    if (typeof sequence === 'number' && Number.isSafeInteger(sequence) && sequence >= 0 && (state.sequence === null || sequence >= state.sequence)) {
      // Les fragments de la ligne condamnée et des lignes précédentes ne
      // peuvent plus servir à une détection de doublon utile.
      state.fragments.clear();
      state.sequence = sequence;
      state.expectedChunk = 0;
      state.expectedFragments = null;
      state.skippedSequence = sequence;
    } else if (!(typeof sequence === 'number' && Number.isSafeInteger(sequence) && sequence >= 0) && state.sequence !== null) {
      // Sans index de ligne lisible, condamner la ligne en cours :
      // un fragment ultérieur ne doit pas compléter une notification tronquée.
      state.fragments.clear();
      state.expectedChunk = 0;
      state.expectedFragments = null;
      state.skippedSequence = state.sequence;
    }
    return { accepted: false, duplicate: false, gap: true, resetBuffer: true };
  }

  const key = sequence + ':' + chunkIndex;
  if (state.fragments.has(key)) {
    if (state.fragments.get(key) === payload) {
      return { accepted: false, duplicate: true, gap: false, resetBuffer: false };
    }
    state.gapCount++;
    // Un doublon contradictoire invalide la ligne : libérer immédiatement
    // les fragments déjà reçus, devenus inutilisables.
    state.fragments.clear();
    state.skippedSequence = sequence;
    return { accepted: false, duplicate: false, gap: true, resetBuffer: true };
  }

  let gap = false;
  let resetBuffer = false;
  if (state.sequence === null) {
    if (sequence !== 0 || chunkIndex !== 0) gap = true;
    state.sequence = sequence;
    state.expectedChunk = 0;
    state.expectedFragments = expectedFragments ?? null;
  } else if (sequence < state.sequence) {
    state.gapCount++;
    return { accepted: false, duplicate: false, gap: true, resetBuffer: false };
  } else if (sequence > state.sequence) {
    const previousLineIncomplete = state.expectedFragments !== null &&
      state.expectedChunk !== state.expectedFragments * 10;
    if (sequence !== state.sequence + 1 || chunkIndex !== 0 || previousLineIncomplete) gap = true;
    // Les séquences antérieures sont désormais rejetées par l'ordre du flux :
    // conserver leurs payloads ne ferait qu'accroître la mémoire utilisée.
    state.fragments.clear();
    state.sequence = sequence;
    state.expectedChunk = 0;
    state.expectedFragments = expectedFragments ?? null;
    state.skippedSequence = null;
    resetBuffer = gap;
  } else if (expectedFragments !== undefined && state.expectedFragments !== null &&
      expectedFragments !== state.expectedFragments) {
    state.gapCount++;
    state.fragments.clear();
    state.skippedSequence = sequence;
    return { accepted: false, duplicate: false, gap: true, resetBuffer: true };
  } else if (expectedFragments !== undefined && state.expectedFragments === null) {
    state.expectedFragments = expectedFragments;
  }

  if (gap) {
    state.gapCount++;
    if (chunkIndex !== 0) {
      state.skippedSequence = sequence;
      return { accepted: false, duplicate: false, gap: true, resetBuffer: true };
    }
  }

  if (state.skippedSequence === sequence) {
    return { accepted: false, duplicate: false, gap: false, resetBuffer: false };
  }

  if (chunkIndex !== state.expectedChunk) {
    state.gapCount++;
    state.skippedSequence = sequence;
    return { accepted: false, duplicate: false, gap: true, resetBuffer: true };
  }

  state.fragments.set(key, payload);
  state.expectedChunk += 10;
  return { accepted: true, duplicate: false, gap, resetBuffer };
}

/** Les relevés issus d'un transfert incomplet ne peuvent pas servir de borne d'arrêt. */
/** Indique si un relevé constitue une base complète de synchronisation.
 * @param {Partial<VmiRecord>|null|undefined} record Relevé à vérifier.
 * @returns {boolean} true si le relevé n'est pas marqué partiel.
 */
export function isHistorySyncBaseline(record) {
  return !!record && record.syncPartial !== true;
}

/** Marque les lignes reçues selon que le transfert entier est certifié ou non. */
/**
 * markHistoryRows — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} records Paramètre records.
 * @param {boolean} complete Indique si le flux reçu est complet.
 * @returns {VmiRecord[]} Relevés annotés avec leur état de synchronisation.
 */
export function markHistoryRows(records, complete) {
  return (Array.isArray(records) ? records : []).map(record => ({
    ...record,
    syncPartial: !complete
  }));
}

/** Signale une notification d'historique tronquée dont les index ne sont pas lisibles. */
/**
 * markHistoryStreamInvalid — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {HistoryStreamState} state État du flux à invalider.
 * @returns {{accepted: false, duplicate: false, gap: true, resetBuffer: true}} Signal de flux invalide.
 */
export function markHistoryStreamInvalid(state) {
  state.gapCount++;
  // Sans index lisible, on ne peut pas savoir quel fragment manque : abandonner
  // toute la ligne courante et ignorer ses éventuels fragments restants.
  if (state.sequence !== null) state.skippedSequence = state.sequence;
  return { accepted: false, duplicate: false, gap: true, resetBuffer: true };
}
