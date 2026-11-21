/**
 * Registres de lecture et commandes manuelles Purevent, d'après protocol.py.
 * 0x06 lit la télécommande (trame 0x02) ; 0x07 lit les sondes (trame 0x03).
 */
export const BLE_RESPONSE_KIND_BY_REGISTER = Object.freeze({
  0x03: 'state',
  0x06: 'room',
  0x07: 'probes',
  0x18: 'state',
  0x19: 'state',
  0x1A: 'state'
});

/**
 * Sérialise les réponses typées sans identifiant de transaction.
 * Après timeout/annulation, la session est empoisonnée : une notification tardive
 * ne peut plus satisfaire une nouvelle attente sur cette même connexion.
 */
export function createBleResponseGate({
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
} = {}) {
  let pending = null;
  let invalidated = false;
  let invalidationReason = null;

  function invalidate(reason = new Error('Session de corrélation Bluetooth invalidée.')) {
    invalidated = true;
    invalidationReason = reason;
    if (pending) pending.reject(reason);
  }

  function reset() {
    if (pending) pending.reject(new Error('Nouvelle session Bluetooth.'));
    pending = null;
    invalidated = false;
    invalidationReason = null;
  }

  function waitFor(expectedKind, timeoutMs = 5000) {
    if (invalidated) {
      return Promise.reject(new Error(
        'Session Bluetooth invalide : reconnexion requise avant toute nouvelle attente.'
      ));
    }
    if (pending) {
      return Promise.reject(new Error('Une réponse Bluetooth est déjà attendue.'));
    }
    return new Promise((resolve, reject) => {
      const entry = {
        expectedKind,
        resolve: value => {
          clearTimeoutFn(entry.timer);
          if (pending === entry) pending = null;
          resolve(value);
        },
        reject: error => {
          clearTimeoutFn(entry.timer);
          if (pending === entry) pending = null;
          reject(error);
        },
        timer: null
      };
      entry.timer = setTimeoutFn(() => {
        const error = new Error(
          `Délai dépassé : aucune réponse VMI de type ${expectedKind} en ${timeoutMs} ms. Reconnexion requise pour éviter une réponse tardive ambiguë.`
        );
        invalidate(error);
      }, timeoutMs);
      pending = entry;
    });
  }

  function notify(kind, value) {
    if (invalidated || !pending || pending.expectedKind !== kind) return false;
    pending.resolve(value);
    return true;
  }

  function cancel(reason = new Error('Attente de réponse Bluetooth annulée.')) {
    invalidate(reason);
  }

  return {
    waitFor,
    notify,
    cancel,
    invalidate,
    reset,
    get pendingKind() { return pending?.expectedKind ?? null; },
    get isInvalidated() { return invalidated; },
    get invalidationReason() { return invalidationReason; }
  };
}
