

/** Exécute une séquence BLE uniquement dans la session qui l'a démarrée. */
/**
 * Exécute une séquence BLE uniquement dans la session qui l'a démarrée.
 * @param {{token: unknown, getToken: Function, isActive: Function, steps: Function[]}} options Identifiants de session et opérations séquentielles.
 * @returns {Promise<boolean>} Vrai si toutes les étapes ont réussi dans la session active.
 */
export async function runBleSessionSequence({ token, getToken, isActive, steps }) {
  for (const step of steps) {
    if (getToken() !== token || !isActive()) return false;
    const succeeded = await step();
    if (!succeeded || getToken() !== token || !isActive()) return false;
  }
  return true;
}
