/** @typedef {import('../types/vmi-types.js').VmiRecord} VmiRecord */
/** @typedef {import('../types/vmi-types.js').UnknownRecord} UnknownRecord */
/** @typedef {{hist:VmiRecord[],live:VmiRecord[],meta:UnknownRecord,addedHistory:number,enrichedHistory:number,addedLive:number}} BackupMergeResult */

import { mergeRecordFields, isRawDateEligible } from './history.js';

/** Construit une sauvegarde versionnée sans modifier les données sources.
 * @param {{hist: VmiRecord[], live: VmiRecord[], meta: UnknownRecord, exportedAt?: string}} options Données à sauvegarder et horodatage d'export.
 * @returns {UnknownRecord} Instantané de sauvegarde compatible avec le format VMI.
 */
export function createBackupSnapshot({ hist, live, meta, exportedAt = new Date().toISOString() }) {
  return {
    app: 'vmi-purevent', version: 1, exportedAt,
    hist: Array.isArray(hist) ? hist : [],
    live: Array.isArray(live) ? live : [],
    meta: meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {}
  };
}

/** Fusionne une sauvegarde dans les données locales en préservant les champs existants.
 * @param {{backup: UnknownRecord, currentHist?: VmiRecord[], currentLive?: VmiRecord[], currentMeta?: UnknownRecord, minValid: number, maxLive?: number, maxTimestamp?: number}} options Sauvegarde et état local à fusionner.
 * @returns {BackupMergeResult} Données fusionnées et compteurs d'import.
 */
export function mergeBackupData({
  backup, currentHist = [], currentLive = [], currentMeta = {},
  minValid, maxLive = 10000, maxTimestamp = Date.now()
}) {
  if (!backup || backup.app !== 'vmi-purevent' || !Array.isArray(backup.hist)) {
    throw new Error('Fichier de sauvegarde non reconnu.');
  }
  const source = /** @type {UnknownRecord & {hist:VmiRecord[], live?:VmiRecord[], meta?:{lastSync?:string}}} */ (backup);
  if (!Number.isFinite(minValid) || minValid <= 0) {
    throw new RangeError('minValid doit être un horodatage fini strictement positif.');
  }
  if (!Number.isSafeInteger(maxLive) || maxLive < 0) {
    throw new RangeError('maxLive doit être un entier sûr positif ou nul.');
  }
  if (!Number.isFinite(maxTimestamp)) {
    throw new RangeError('maxTimestamp doit être un horodatage fini.');
  }
  const isUsableHistory = record => isRawDateEligible(record, minValid) &&
    record.t >= minValid && record.t <= maxTimestamp;
  const history = new Map();
  for (const record of currentHist.filter(isUsableHistory)) {
    const existing = history.get(record.t);
    history.set(record.t, existing ? mergeRecordFields(existing, record) : record);
  }
  let addedHistory = 0, enrichedHistory = 0;
  for (const record of source.hist) {
    if (!isUsableHistory(record)) continue;
    if (!history.has(record.t)) { history.set(record.t, record); addedHistory++; }
    else {
      const previous = history.get(record.t), merged = mergeRecordFields(previous, record);
      if (Object.keys(merged).some(key => merged[key] !== previous[key])) enrichedHistory++;
      history.set(record.t, merged);
    }
  }
  const hist = [...history.values()].sort((a,b) => a.t-b.t);

  // Les horodatages futurs sont écartés des relevés directs, qu'ils viennent
  // de la sauvegarde ou de l'état local.
  const isUsableLive = record => record && Number.isFinite(record.t) &&
    Number.isFinite(new Date(record.t).getTime()) && record.t <= maxTimestamp;
  let live = currentLive.filter(isUsableLive), addedLive = 0;
  if (Array.isArray(source.live)) {
    const byTime = new Map();
    for (const record of live) {
      const existing = byTime.get(record.t);
      byTime.set(record.t, existing ? mergeRecordFields(existing, record) : record);
    }
    for (const record of source.live) {
      if (!isUsableLive(record)) continue;
      if (!byTime.has(record.t)) { byTime.set(record.t,record); addedLive++; }
      else byTime.set(record.t,mergeRecordFields(byTime.get(record.t),record));
    }
    live=[...byTime.values()].sort((a,b)=>a.t-b.t);
    if(maxLive===0) live=[];
    else if(live.length>maxLive) live=live.slice(-maxLive);
  }
  const meta={...(currentMeta && typeof currentMeta === 'object' && !Array.isArray(currentMeta) ? currentMeta : {})};
  if(source.meta?.lastSync&&(!meta.lastSync||source.meta.lastSync>String(meta.lastSync))) meta.lastSync=source.meta.lastSync;
  return { hist, live, meta, addedHistory, enrichedHistory, addedLive };
}
