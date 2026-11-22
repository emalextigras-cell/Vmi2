/**
 * Demande au navigateur de protéger l'origine contre l'éviction automatique.
 * Cela ne remplace jamais une sauvegarde externe et le navigateur reste décisionnaire.
 * @returns {Promise<{status:'persisted'|'granted'|'denied'|'unsupported'|'error',error?:string}>}
 */
export async function requestPersistentStorage(storage = globalThis.navigator?.storage) {
  if (!storage || typeof storage.persist !== 'function') return { status: 'unsupported' };
  try {
    if (typeof storage.persisted === 'function' && await storage.persisted()) {
      return { status: 'persisted' };
    }
    const granted = await storage.persist();
    return { status: granted ? 'granted' : 'denied' };
  } catch (error) {
    return { status: 'error', error: error?.message || String(error) };
  }
}
