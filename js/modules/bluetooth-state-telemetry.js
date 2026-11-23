/**
 * Historique compact des états Bluetooth VMI : conserve les changements observés
 * du code de vitesse et du renouvellement réellement transmis par la trame 0x01.
 * Le mode manuel n'est pas présent dans cette trame et n'est donc jamais déduit ici.
 */
export const STATE_TELEMETRY_MAX = 2000;

/**
 * Construit un relevé à partir d'une trame d'état décodée.
 * @param {{timestamp?:number,decoded?:object}} [input] État reçu et horodatage local.
 * @returns {object|null} Relevé exploitable, ou null si les champs requis manquent.
 */
export function createStateTelemetryRecord({ timestamp, decoded } = {}) {
  if (!Number.isFinite(timestamp) || !decoded || decoded.kind !== 'state') return null;
  const volumeM3 = decoded.volume;
  const rawSpeed = decoded.rawSpeed;
  const renewalRaw = decoded.renewal;
  const airChangesPerHour = decoded.airChangesPerHour;
  const airflowM3h = decoded.airflowM3h;
  if (![volumeM3, rawSpeed, renewalRaw, airChangesPerHour, airflowM3h].every(Number.isFinite) ||
      volumeM3 <= 0 || rawSpeed < 0 || renewalRaw < 0 || airChangesPerHour < 0 || airflowM3h < 0 ||
      typeof decoded.fixedAirflow !== 'boolean') return null;
  return {
    t: timestamp,
    volumeM3,
    rawSpeed,
    renewalRaw,
    airChangesPerHour,
    airflowM3h,
    fixedAirflow: decoded.fixedAirflow
  };
}

/** Valide et normalise une collection de relevés sauvegardés. */
export function normalizeStateTelemetry(records, maxRecords = STATE_TELEMETRY_MAX) {
  if (!Array.isArray(records)) return [];
  return records.filter(record => record && Number.isFinite(record.t) &&
    Number.isFinite(record.volumeM3) && record.volumeM3 > 0 &&
    Number.isFinite(record.rawSpeed) && Number.isFinite(record.renewalRaw) &&
    Number.isFinite(record.airChangesPerHour) && Number.isFinite(record.airflowM3h) &&
    typeof record.fixedAirflow === 'boolean')
    .map(record => ({
      t: record.t, volumeM3: record.volumeM3, rawSpeed: record.rawSpeed,
      renewalRaw: record.renewalRaw, airChangesPerHour: record.airChangesPerHour,
      airflowM3h: record.airflowM3h, fixedAirflow: record.fixedAirflow
    }))
    .sort((a, b) => a.t - b.t)
    .slice(-maxRecords);
}

/**
 * Ajoute uniquement un nouvel état ou une transition observable.
 * Les répétitions du même état ne gonflent pas l'historique.
 */
export function appendStateTelemetry(records, record, maxRecords = STATE_TELEMETRY_MAX) {
  const current = normalizeStateTelemetry(records, maxRecords);
  const next = normalizeStateTelemetry([record], 1)[0];
  if (!next) return current;
  const previous = current.at(-1);
  if (previous && previous.volumeM3 === next.volumeM3 &&
      previous.rawSpeed === next.rawSpeed && previous.renewalRaw === next.renewalRaw &&
      previous.fixedAirflow === next.fixedAirflow) return current;
  return [...current, next].slice(-maxRecords);
}

/** Fusionne deux historiques de télémétrie, sans doublon temporel ni date future. */
export function mergeStateTelemetry(current = [], imported = [], maxTimestamp = Date.now(), maxRecords = STATE_TELEMETRY_MAX) {
  const byTime = new Map();
  for (const record of [...normalizeStateTelemetry(current), ...normalizeStateTelemetry(imported)]) {
    if (record.t <= maxTimestamp) byTime.set(record.t, { ...byTime.get(record.t), ...record });
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t).slice(-maxRecords);
}
