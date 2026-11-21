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
 * Associe une réponse typée du protocole VMI à une seule requête en attente.
 * Le protocole observé ne fournit pas d'identifiant de transaction : les échanges
 * doivent donc être sérialisés et une réponse ne valide que le type attendu.
 */
export function createBleResponseGate({
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
} = {}) {
  let pending = null;

  function waitFor(expectedKind, timeoutMs = 5000) {
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
        entry.reject(new Error(`Délai dépassé : aucune réponse VMI de type ${expectedKind} en ${timeoutMs} ms.`));
      }, timeoutMs);
      pending = entry;
    });
  }

  function notify(kind, value) {
    if (!pending || pending.expectedKind !== kind) return false;
    pending.resolve(value);
    return true;
  }

  function cancel(reason = new Error('Attente de réponse Bluetooth annulée.')) {
    if (pending) pending.reject(reason);
  }

  return { waitFor, notify, cancel, get pendingKind() { return pending?.expectedKind ?? null; } };
}
