/**
 * Orchestration sûre des réglages avancés Purevent.
 *
 * Les callbacks BLE sont injectés : les tests n'ouvrent aucune liaison et
 * n'envoient aucune commande physique.
 */
export const ADVANCED_COMMANDS = Object.freeze({
  surventilation: { register: 0x0B, label: 'Surventilation' },
  summerLimit: { register: 0x17, label: 'Limite estivale' },
  fixedAirflow: { register: 0x1B, label: 'Débit fixe' },
  preheatSetpoint: { register: 0x1C, label: 'Consigne de préchauffage' },
  preheatPower: { register: 0x2F, label: 'Marche du préchauffage' }
});

function assertConnected(isConnected) {
  if (!isConnected()) throw new Error('La liaison Bluetooth avec la VMI est interrompue.');
}

function isConfirmed(state, key, expected) {
  return state != null && state[key] === expected;
}

/**
 * Lit l'état juste avant l'action, écrit au plus une fois puis relit si besoin.
 * @param {any} deps Dépendances BLE injectées.
 * @param {any} options Réglage et condition de confirmation.
 * @returns {Promise<{changed:boolean,confirmed:true,state:object}>}
 */
async function setAndConfirm(deps, options) {
  const key = options.key;
  const register = options.register;
  const value = options.value;
  const expected = options.expected;
  const label = options.label;
  const confirmState = options.confirmState || (state => isConfirmed(state, key, expected));
  assertConnected(deps.isConnected);
  const before = await deps.readState();
  assertConnected(deps.isConnected);
  if (!before || typeof before[key] !== typeof expected) {
    throw new Error(label + ' : état initial non disponible.');
  }
  if (confirmState(before)) {
    return { changed: false, confirmed: true, state: before };
  }

  // Une seule écriture : une absence de réponse ne justifie jamais un renvoi.
  await deps.writeCommand(register, value);
  assertConnected(deps.isConnected);
  let after = await deps.getLastCommandState?.();
  if (!confirmState(after)) {
    after = await deps.readState();
  }
  assertConnected(deps.isConnected);
  if (!confirmState(after)) {
    throw new Error(label + ' : la VMI n’a pas confirmé le nouvel état. Aucune nouvelle écriture ne sera envoyée.');
  }
  return { changed: true, confirmed: true, state: after };
}

/**
 * Applique un réglage avancé Purevent avec validation des plages.
 * @param {any} deps Callbacks readState/writeCommand/getLastCommandState/isConnected.
 * @param {string} action Nom de réglage.
 * @param {number|boolean} value Valeur souhaitée.
 */
export async function applyAdvancedCommand(deps, action, value) {
  if (action === 'surventilation') {
    if (typeof value !== 'boolean') throw new TypeError('La surventilation attend un booléen.');
    assertConnected(deps.isConnected);
    const before = await deps.readState();
    assertConnected(deps.isConnected);
    if (!before || typeof before.surventilation !== 'boolean') {
      throw new Error('Surventilation : état initial non disponible.');
    }
    if (before.surventilation === value) return { changed: false, confirmed: true, state: before };
    // 0x0B est une bascule : la valeur transmise est ignorée par le firmware.
    await deps.writeCommand(0x0B, 0);
    assertConnected(deps.isConnected);
    let after = await deps.getLastCommandState?.();
    if (after?.surventilation !== value) after = await deps.readState();
    assertConnected(deps.isConnected);
    if (after?.surventilation !== value) {
      throw new Error('Surventilation : état non confirmé. La bascule ne sera pas renvoyée.');
    }
    return { changed: true, confirmed: true, state: after };
  }

  if (action === 'summerLimit') {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 22 || value > 37) {
      throw new RangeError('La limite estivale doit être comprise entre 22 et 37 °C.');
    }
    return setAndConfirm(deps, {
      key: 'summerLimit', register: 0x17, value, expected: value, label: 'Limite estivale'
    });
  }

  if (action === 'fixedAirflow') {
    if (typeof value !== 'boolean') throw new TypeError('Le débit fixe attend un booléen.');
    return setAndConfirm(deps, {
      key: 'fixedAirflow', register: 0x1B, value: value ? 1 : 0,
      expected: value, label: 'Débit fixe'
    });
  }

  if (action === 'preheatSetpoint') {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 12 || value > 18) {
      throw new RangeError('La consigne de préchauffage doit être comprise entre 12 et 18 °C.');
    }
    return setAndConfirm(deps, {
      key: 'preheatSetpoint', register: 0x1C, value, expected: value,
      confirmState: state => state?.preheatSetpoint === value && state?.preheatOn === true,
      label: 'Consigne de préchauffage'
    });
  }

  if (action === 'preheatPower') {
    if (typeof value !== 'boolean') throw new TypeError('Le préchauffage attend un booléen.');
    if (value) {
      return setAndConfirm(deps, {
        key: 'preheatOn', register: 0x2F, value: 1, expected: true,
        label: 'Marche du préchauffage'
      });
    }
    return stopPreheating(deps);
  }

  throw new Error('Réglage avancé inconnu : ' + action);
}

/**
 * Arrêt complet documenté : 0x2F=0, puis si nécessaire 0x1C=0.
 * @param {any} deps Callbacks BLE injectés.
 */
export async function stopPreheating(deps) {
  assertConnected(deps.isConnected);
  const before = await deps.readState();
  assertConnected(deps.isConnected);
  if (!before || typeof before.preheatOn !== 'boolean' || !Number.isFinite(before.preheatSetpoint)) {
    throw new Error('Préchauffage : état initial non disponible.');
  }
  if (!before.preheatOn && before.preheatSetpoint === 0) {
    return { changed: false, confirmed: true, state: before };
  }

  await deps.writeCommand(0x2F, 0);
  assertConnected(deps.isConnected);
  let after = await deps.getLastCommandState?.();
  if (after?.preheatOn !== false) {
    try {
      after = await deps.readState();
    } catch {
      // La consigne à zéro reste un repli sûr si la réponse à l'arrêt manque.
      after = null;
    }
  }
  assertConnected(deps.isConnected);

  if (after?.preheatOn !== false || after?.preheatSetpoint !== 0) {
    // La consigne à zéro est le repli documenté par Purevent. Elle n'augmente
    // jamais la puissance et n'est envoyée qu'une seule fois.
    await deps.writeCommand(0x1C, 0);
    assertConnected(deps.isConnected);
    after = await deps.getLastCommandState?.();
    if (after?.preheatOn !== false || after?.preheatSetpoint !== 0) {
      after = await deps.readState();
    }
  }

  assertConnected(deps.isConnected);
  if (after?.preheatOn !== false || after?.preheatSetpoint !== 0) {
    throw new Error('Arrêt du préchauffage non confirmé (marche et consigne doivent être à zéro).');
  }
  return { changed: true, confirmed: true, state: after };
}
