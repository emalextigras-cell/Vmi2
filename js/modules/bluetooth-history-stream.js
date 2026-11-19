/** @typedef {import('../types/vmi-types.js').VmiRecord} VmiRecord */
/** @typedef {{sequence: number|null, expectedChunk: number, expectedFinalChunk: number|null, skippedSequence: number|null, fragments: Map<string,string>, gapCount: number}} HistoryStreamState */

/**
 * Contrôle l'ordre des fragments d'historique observés dans les notifications VMI.
 * La capture confirme l'index de ligne (octets 9-10) et l'index de fragment
 * (octet 12, par pas de 10). Les lignes de données CSV observées commencent
 * par une date et comportent les fragments 0, 10, 20, 30 et 40. Les en-têtes
 * précédant la première date ne sont pas soumis à cette règle. L'octet 13 est
 * interprété comme indicateur de fin, mais aucune valeur 1 n'est observée.
 */
/**
 * createHistoryStreamState — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @returns {HistoryStreamState} État du flux initialisé.
 */
export function createHistoryStreamState() {
  return {
    sequence: null,
    expectedChunk: 0,
    expectedFinalChunk: null,
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
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 0 ||
      typeof chunkIndex !== 'number' || !Number.isSafeInteger(chunkIndex) ||
      chunkIndex < 0 || chunkIndex % 10 !== 0) {
    state.gapCount++;
    // Si l'index de ligne reste lisible, condamner cette ligne et ignorer
    // tous ses fragments suivants jusqu'à la ligne suivante.
    if (typeof sequence === 'number' && Number.isSafeInteger(sequence) && sequence >= 0 && (state.sequence === null || sequence >= state.sequence)) {
      // Les fragments de la ligne condamnée et des lignes précédentes ne
      // peuvent plus servir à une détection de doublon utile.
      state.fragments.clear();
      state.sequence = sequence;
      state.expectedChunk = 0;
      state.skippedSequence = sequence;
    } else if (!(typeof sequence === 'number' && Number.isSafeInteger(sequence) && sequence >= 0) && state.sequence !== null) {
      // Sans index de ligne lisible, condamner la ligne en cours :
      // un fragment ultérieur ne doit pas compléter une notification tronquée.
      state.fragments.clear();
      state.expectedChunk = 0;
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
  } else if (sequence < state.sequence) {
    state.gapCount++;
    return { accepted: false, duplicate: false, gap: true, resetBuffer: false };
  } else if (sequence > state.sequence) {
    const previousRecordIncomplete = state.expectedFinalChunk !== null &&
      state.skippedSequence !== state.sequence &&
      state.expectedChunk <= state.expectedFinalChunk;
    if (sequence !== state.sequence + 1 || chunkIndex !== 0 || previousRecordIncomplete) gap = true;
    // Les séquences antérieures sont désormais rejetées par l'ordre du flux :
    // conserver leurs payloads ne ferait qu'accroître la mémoire utilisée.
    state.fragments.clear();
    state.sequence = sequence;
    state.expectedChunk = 0;
    state.expectedFinalChunk = null;
    state.skippedSequence = null;
    resetBuffer = gap;
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

  if (chunkIndex !== state.expectedChunk || (state.expectedFinalChunk !== null && chunkIndex > state.expectedFinalChunk)) {
    state.gapCount++;
    state.skippedSequence = sequence;
    return { accepted: false, duplicate: false, gap: true, resetBuffer: true };
  }

  // Une ligne CSV de données commence par une date. Dans la capture réelle,
  // elle utilise cinq fragments (0 à 40) ; le passage à la ligne suivante
  // permet donc aussi de détecter la perte du dernier fragment.
  if (chunkIndex === 0 && /^\r?\n\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2};/.test(payload)) {
    state.expectedFinalChunk = 40;
  }
  state.fragments.set(key, payload);
  state.expectedChunk += 10;
  return { accepted: true, duplicate: false, gap, resetBuffer };
}

/**
 * Vérifie que la dernière ligne de mesures reçue contient bien tous ses fragments.
 * Les en-têtes n'ont pas de nombre de fragments imposé ; une ligne de mesures
 * reconnue au fragment 0 doit aller jusqu'au fragment 40 inclus.
 * @param {HistoryStreamState|null|undefined} state État du flux historique.
 * @returns {boolean} true si aucune ligne finale reconnue ne reste incomplète.
 */
export function isHistoryStreamComplete(state) {
  if (!state || state.sequence === null) return true;
  if (state.skippedSequence === state.sequence) return false;
  return state.expectedFinalChunk === null || state.expectedChunk > state.expectedFinalChunk;
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
