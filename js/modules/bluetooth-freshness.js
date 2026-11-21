/**
 * Détermine si la liaison BLE est restée ouverte sans recevoir de trame d'état récente.
 * Le seuil de 35 s reprend la fraîcheur utilisée par la référence Purevent.
 */
export function isBleStateStale({
  connected,
  downloadActive = false,
  commandPending = false,
  now,
  connectedAt,
  lastStateAt,
  maxSilenceMs = 35000
}) {
  if (!connected || downloadActive || commandPending) return false;
  const reference = Number.isFinite(lastStateAt) && lastStateAt > 0
    ? lastStateAt
    : connectedAt;
  if (!Number.isFinite(reference) || reference <= 0 || !Number.isFinite(now)) return false;
  return now - reference >= maxSilenceMs;
}
