/** @typedef {import('../types/vmi-types.js').VmiRecord} VmiRecord */

/** Correction des dates d'historique lorsque l'horloge interne de la VMI est erronée. */
import { DAY, MIN_VALID } from './date-utils.js';
import { filterRawDateHistory, isRawDateEligible } from './history.js';

/** @param {number} timestamp @returns {number} */
const dayNumber = timestamp => {
  const d = new Date(timestamp);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
};
const MIN_RECONSTRUCTABLE_RAW = Date.UTC(2020, 0, 1);

/**
 * Compare un compteur Bluetooth à une référence persistée. La tolérance de deux
 * jours absorbe les frontières de journée et les petites incertitudes de synchro.
 * Une hausse impossible devient candidate et n'est confirmée qu'à la synchro suivante.
 * @param {{baseline?:{d:number,observedAt:number}|null,candidate?:{d:number,observedAt:number}|null,currentDays:number,observedAt:number,toleranceDays?:number}} input
 * @returns {{discontinuity:boolean,baseline:{d:number,observedAt:number},candidate:{d:number,observedAt:number}|null,previousDays:number|null,reason:string}}
 */
export function evaluateCounterBaseline({ baseline, candidate = null, currentDays, observedAt, toleranceDays = 2 }) {
  const current = { d: currentDays, observedAt };
  if (!Number.isFinite(currentDays) || !Number.isFinite(observedAt)) {
    throw new TypeError('Référence de compteur invalide.');
  }
  const valid = value => value && Number.isFinite(value.d) && Number.isFinite(value.observedAt);
  if (!valid(baseline)) {
    return { discontinuity: false, baseline: current, candidate: null, previousDays: null, reason: 'baseline-initialized' };
  }
  if (valid(candidate)) {
    const elapsed = Math.max(0, (observedAt - candidate.observedAt) / DAY);
    const increase = currentDays - candidate.d;
    if (increase >= 0 && increase <= Math.ceil(elapsed) + toleranceDays) {
      return { discontinuity: true, baseline: current, candidate: null, previousDays: candidate.d, reason: 'candidate-confirmed' };
    }
    return { discontinuity: true, baseline, candidate: current, previousDays: candidate.d, reason: 'candidate-replaced' };
  }
  const elapsed = Math.max(0, (observedAt - baseline.observedAt) / DAY);
  const increase = currentDays - baseline.d;
  const maximumPlausibleIncrease = Math.ceil(elapsed) + toleranceDays;
  if (increase < 0) {
    return { discontinuity: true, baseline, candidate: current, previousDays: baseline.d, reason: 'counter-decreased' };
  }
  if (increase > maximumPlausibleIncrease) {
    return { discontinuity: true, baseline, candidate: current, previousDays: baseline.d, reason: 'counter-jump' };
  }
  return { discontinuity: false, baseline: current, candidate: null, previousDays: baseline.d, reason: 'progression-plausible' };
}

/** @param {number[]} values @returns {number|undefined} */
const modeOf = values => {
  const counts = new Map();
  let best, bestCount = 0;
  for (const value of values) {
    const count = (counts.get(value) || 0) + 1;
    counts.set(value, count);
    if (count > bestCount) {
      bestCount = count;
      best = value;
    }
  }
  return best;
};

/**
 * Corrige en place les relevés antérieurs à MIN_VALID à partir du compteur
 * « jours de fonctionnement ». Les dates brutes antérieures à 2020 restent
 * exclues par défaut ; le téléchargement Bluetooth peut autoriser leur recalage
 * uniquement lorsqu'un repère fiable existe dans l'historique récent.
 * Les repères sont limités aux relevés à partir de 10 h : les observations fournies
 * montrent des changements quotidiens entre environ 2 h et 8 h 35. Le seuil de
 * 10 h laisse une marge après cette transition ; il évite
 * de mélanger deux journées de compteur, sans prétendre que cette fenêtre est
 * une garantie constructeur valable pour tous les appareils.
 * Retourne aussi les métriques de concordance des repères date/compteur.
 */
/**
 * fixClock — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} records Paramètre records.
 * @param {VmiRecord[]} history Paramètre history.
 * @param {number} minValid Timestamp minimal accepté.
 * @param {number} maxTimestamp Timestamp maximal accepté, ou Infinity.
 * @param {{allowPre2020RawDates?: boolean,forceCounterReset?:boolean,counterResetReason?:string,counterPreviousDays?:number}} [options] Autorise les dates brutes anciennes pour un flux Bluetooth identifié.
 * @returns {{fixed:number, future:number, futureDetails:Array<{record:VmiRecord, correctedTimestamp:number}>, kept:VmiRecord[], counterReset:boolean, counterResetDetails:{previousMax:number,current:number,reason:string}|null, referenceCount:number, concordantCount:number, concordanceRate:number|null, referenceSource:'incoming-only'|'history-and-incoming'|'none'}} Résultat de la correction.
 */
export function fixClock(records, history = [], minValid = MIN_VALID, maxTimestamp = Infinity, { allowPre2020RawDates = false, forceCounterReset = false, counterResetReason = 'counter-discontinuity', counterPreviousDays } = {}) {
  // Les relevés entrants assez récents doivent rester disponibles pendant cette
  // fonction : leur compteur de jours peut permettre de reconstruire leur date.
  // L'historique déjà stocké, lui, reste filtré pour ne servir que de référence fiable.
  history = filterRawDateHistory(history, minValid).filter(record =>
    !Number.isFinite(maxTimestamp) || record.t <= maxTimestamp
  );
  // Le flux Bluetooth est transmis du relevé le plus récent vers le plus ancien.
  // Si son premier compteur d est inférieur au maximum déjà mémorisé, l'ancienne
  // relation date/d n'est plus fiable (compteur remis à zéro ou historique remplacé).
  // Dans ce cas, ne jamais reconstruire les dates avec l'ancien décalage majoritaire.
  const previousMaxDays = history.reduce((max, record) =>
    Number.isFinite(record.d) ? Math.max(max, record.d) : max, -Infinity);
  const currentDays = records.find(record => Number.isFinite(record.d))?.d;
  const rollbackDetected = Number.isFinite(previousMaxDays) && Number.isFinite(currentDays) && currentDays < previousMaxDays;
  const counterReset = allowPre2020RawDates && (forceCounterReset || rollbackDetected);
  const counterResetDetails = counterReset
    ? { previousMax: Number.isFinite(counterPreviousDays) ? counterPreviousDays : previousMaxDays, current: currentDays, reason: forceCounterReset ? counterResetReason : 'counter-decreased' }
    : null;
  // Après un recul, l'ancien historique ne doit plus servir d'ancrage.
  // On tente alors un recalage autonome avec les seuls nouveaux relevés entrants
  // dont la date est déjà valide. Sans ces repères, aucune date ancienne n'est corrigée.
  // Le seuil de 10 h laisse une marge sur les transitions observées entre 2 h et 8 h 35.
  // getHours() utilise l'heure locale du navigateur.
  const referenceRecords = counterReset ? records : history.concat(records);
  const known = referenceRecords.filter(record =>
    isRawDateEligible(record, minValid) && record.t >= minValid &&
    (!Number.isFinite(maxTimestamp) || record.t <= maxTimestamp) &&
    Number.isFinite(record.d) &&
    new Date(record.t).getHours() >= 10
  );
  // Après un recul, deux jours distincts au minimum sont requis : plusieurs
  // lignes du même jour ne constituent pas des confirmations indépendantes.
  const independentKnown = counterReset
    ? [...new Map(known.map(record => [`${dayNumber(record.t)}|${record.d}`, record])).values()]
    : known;
  const offsets = independentKnown.map(record => dayNumber(record.t) - record.d);
  let epochOffset = counterReset && independentKnown.length < 2 ? undefined : modeOf(offsets);
  let concordantCount = epochOffset === undefined ? 0 : offsets.filter(offset => offset === epochOffset).length;
  // En cas de recul, un simple ex-aequo entre deux décalages ne suffit pas.
  if (counterReset && epochOffset !== undefined && concordantCount <= independentKnown.length / 2) {
    epochOffset = undefined;
    concordantCount = 0;
  }
  // Les compteurs ne sont annoncés que si un décalage a effectivement été retenu.
  const referenceCount = epochOffset === undefined ? 0 : independentKnown.length;
  const concordanceRate = referenceCount
    ? Math.round((concordantCount / referenceCount) * 1000) / 10
    : null;
  const minimumRawDate = allowPre2020RawDates ? Date.UTC(2010, 0, 1) : MIN_RECONSTRUCTABLE_RAW;
  const bad = records.filter(record => record.t < minValid && record.t >= minimumRawDate)
    .sort((a, b) => a.t - b.t);
  let fixed = 0;
  const futureRecords = new Set();
  /** @type {Array<{record:VmiRecord, correctedTimestamp:number}>} */
  const futureDetails = [];

  if (epochOffset !== undefined && bad.length) {
    const episodes = [];
    let current = [];
    for (const record of bad) {
      if (current.length && record.t - current[current.length - 1].t > 3 * DAY) {
        episodes.push(current);
        current = [];
      }
      current.push(record);
    }
    if (current.length) episodes.push(current);

    for (const episode of episodes) {
      // Même seuil de 10 h pour les repères propres à chaque épisode.
      const offset = modeOf(episode
        .filter(record => Number.isFinite(record.d) && new Date(record.t).getHours() >= 10)
        .map(record => epochOffset + record.d - dayNumber(record.t)));
      if (offset === undefined) continue;

      for (const record of episode) {
        const date = new Date(record.t);
        const correctedTimestamp = new Date(
          date.getFullYear(), date.getMonth(), date.getDate() + offset,
          date.getHours(), date.getMinutes(), date.getSeconds()
        ).getTime();
        if (Number.isFinite(maxTimestamp) && correctedTimestamp > maxTimestamp) {
          futureRecords.add(record);
          futureDetails.push({ record, correctedTimestamp });
          continue;
        }
        record.t = correctedTimestamp;
        record.fixed = true;
        fixed++;
      }
    }
  }

  const kept = records.filter(record => {
    if (!isRawDateEligible(record, minValid) || record.t < minValid) return false;
    if (Number.isFinite(maxTimestamp) && record.t > maxTimestamp) {
      futureRecords.add(record);
      futureDetails.push({ record, correctedTimestamp: record.t });
      return false;
    }
    return true;
  });
  return {
    fixed, future: futureRecords.size, futureDetails, kept,
    counterReset, counterResetDetails,
    referenceCount, concordantCount, concordanceRate,
    referenceSource: epochOffset === undefined ? 'none' : counterReset ? 'incoming-only' : 'history-and-incoming'
  };
}
