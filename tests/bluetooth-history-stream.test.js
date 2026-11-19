import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptHistoryFragment, createHistoryStreamState } from '../js/modules/bluetooth-history-stream.js';

test('accepte les fragments ordonnés d’une même ligne puis la ligne suivante', () => {
  const state = createHistoryStreamState();
  const a = acceptHistoryFragment(state, { sequence: 0, chunkIndex: 0, payload: 'entête' });
  const b = acceptHistoryFragment(state, { sequence: 1, chunkIndex: 0, payload: 'début' });
  const c = acceptHistoryFragment(state, { sequence: 1, chunkIndex: 10, payload: 'suite' });
  assert.equal(a.accepted, true);
  assert.equal(b.accepted, true);
  assert.equal(c.accepted, true);
  assert.equal(state.gapCount, 0);
});

test('ignore une notification strictement dupliquée sans la compter comme progrès', () => {
  const state = createHistoryStreamState();
  acceptHistoryFragment(state, { sequence: 0, chunkIndex: 0, payload: 'abc' });
  const duplicate = acceptHistoryFragment(state, { sequence: 0, chunkIndex: 0, payload: 'abc' });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.accepted, false);
  assert.equal(state.gapCount, 0);
});

test('détecte un fragment manquant et écarte le reste de la ligne corrompue', () => {
  const state = createHistoryStreamState();
  acceptHistoryFragment(state, { sequence: 0, chunkIndex: 0, payload: 'entête' });
  acceptHistoryFragment(state, { sequence: 1, chunkIndex: 0, payload: 'début' });
  const gap = acceptHistoryFragment(state, { sequence: 1, chunkIndex: 20, payload: 'fin' });
  const skipped = acceptHistoryFragment(state, { sequence: 1, chunkIndex: 30, payload: 'suite' });
  const next = acceptHistoryFragment(state, { sequence: 2, chunkIndex: 0, payload: 'ligne suivante' });
  assert.equal(gap.gap, true);
  assert.equal(gap.resetBuffer, true);
  assert.equal(skipped.accepted, false);
  assert.equal(next.accepted, true);
  assert.equal(state.gapCount, 1);
});

test('détecte un index de ligne manquant sans concaténer les données', () => {
  const state = createHistoryStreamState();
  acceptHistoryFragment(state, { sequence: 0, chunkIndex: 0, payload: 'a' });
  const result = acceptHistoryFragment(state, { sequence: 2, chunkIndex: 0, payload: 'c' });
  assert.equal(result.accepted, true);
  assert.equal(result.gap, true);
  assert.equal(result.resetBuffer, true);
  assert.equal(state.gapCount, 1);
});

test('les lignes d’un transfert partiel ne deviennent pas une borne d’arrêt', async () => {
  const { isHistorySyncBaseline, markHistoryRows } = await import('../js/modules/bluetooth-history-stream.js');
  const partial = markHistoryRows([{ rk: '01/01/2026 00:00:00', d: 1 }], false);
  assert.equal(partial[0].syncPartial, true);
  assert.equal(isHistorySyncBaseline(partial[0]), false);
  const completed = markHistoryRows(partial, true);
  assert.equal(completed[0].syncPartial, false);
  assert.equal(isHistorySyncBaseline(completed[0]), true);
});


test('rejette les index de fragment qui ne sont pas des nombres entiers explicites', () => {
  const state = createHistoryStreamState();
  const invalid = acceptHistoryFragment(state, {
    sequence: null,
    chunkIndex: '0',
    payload: 'fragment mal typé'
  });

  assert.equal(invalid.accepted, false);
  assert.equal(invalid.gap, true);
  assert.equal(invalid.resetBuffer, true);
  assert.equal(state.fragments.size, 0);
});

test('accepte les cinq fragments observés dans la capture Bluetooth', () => {
  const state = createHistoryStreamState();
  for (let sequence = 0; sequence < 25; sequence++) {
    const result = acceptHistoryFragment(state, { sequence, chunkIndex: 0, payload: 'metadata-' + sequence });
    assert.equal(result.accepted, true);
  }
  const accepted = [0, 10, 20, 30, 40].map(chunkIndex =>
    acceptHistoryFragment(state, { sequence: 25, chunkIndex, payload: 'fragment-' + chunkIndex })
  );
  assert.ok(accepted.every(result => result.accepted));
  assert.equal(state.expectedChunk, 50);
  assert.equal(state.gapCount, 0);
});

test('récupère après le fragment 10 manquant observé sur la ligne 394', () => {
  const state = createHistoryStreamState();
  state.sequence = 393;
  state.expectedChunk = 0;
  assert.equal(acceptHistoryFragment(state, { sequence: 394, chunkIndex: 0, payload: 'ligne-394-0' }).accepted, true);
  const missing = acceptHistoryFragment(state, { sequence: 394, chunkIndex: 20, payload: 'ligne-394-20' });
  assert.equal(missing.gap, true);
  assert.equal(missing.resetBuffer, true);
  assert.equal(acceptHistoryFragment(state, { sequence: 394, chunkIndex: 30, payload: 'ligne-394-30' }).accepted, false);
  assert.equal(acceptHistoryFragment(state, { sequence: 394, chunkIndex: 40, payload: 'ligne-394-40' }).accepted, false);
  assert.equal(acceptHistoryFragment(state, { sequence: 395, chunkIndex: 0, payload: 'ligne-395-0' }).accepted, true);
  assert.equal(state.gapCount, 1);
});

test('détecte un fragment reçu dans le désordre et ignore la suite de cette ligne', () => {
  const state = createHistoryStreamState();
  acceptHistoryFragment(state, { sequence: 0, chunkIndex: 0, payload: 'entête' });
  acceptHistoryFragment(state, { sequence: 1, chunkIndex: 0, payload: 'début' });
  const outOfOrder = acceptHistoryFragment(state, { sequence: 1, chunkIndex: 20, payload: 'fragment tardif' });
  const later = acceptHistoryFragment(state, { sequence: 1, chunkIndex: 10, payload: 'fragment arrivé après' });
  const next = acceptHistoryFragment(state, { sequence: 2, chunkIndex: 0, payload: 'ligne suivante' });
  assert.equal(outOfOrder.gap, true);
  assert.equal(outOfOrder.resetBuffer, true);
  assert.equal(later.accepted, false);
  assert.equal(next.accepted, true);
});

test('un doublon avec un contenu différent invalide la ligne concernée', () => {
  const state = createHistoryStreamState();
  acceptHistoryFragment(state, { sequence: 0, chunkIndex: 0, payload: 'entête' });
  const conflict = acceptHistoryFragment(state, { sequence: 0, chunkIndex: 0, payload: 'contenu différent' });
  assert.equal(conflict.gap, true);
  assert.equal(conflict.resetBuffer, true);
  assert.equal(state.fragments.size, 0);
  const rest = acceptHistoryFragment(state, { sequence: 0, chunkIndex: 10, payload: 'suite' });
  const next = acceptHistoryFragment(state, { sequence: 1, chunkIndex: 0, payload: 'ligne suivante' });
  assert.equal(rest.accepted, false);
  assert.equal(next.accepted, true);
});

test('une notification tronquée abandonne la ligne courante jusqu’à la suivante', async () => {
  const { markHistoryStreamInvalid } = await import('../js/modules/bluetooth-history-stream.js');
  const state = createHistoryStreamState();
  acceptHistoryFragment(state, { sequence: 0, chunkIndex: 0, payload: 'entête' });
  acceptHistoryFragment(state, { sequence: 1, chunkIndex: 0, payload: 'début de ligne' });
  const invalid = markHistoryStreamInvalid(state);
  const remaining = acceptHistoryFragment(state, { sequence: 1, chunkIndex: 10, payload: 'suite tronquée' });
  const next = acceptHistoryFragment(state, { sequence: 2, chunkIndex: 0, payload: 'ligne suivante' });
  assert.equal(invalid.gap, true);
  assert.equal(invalid.resetBuffer, true);
  assert.equal(remaining.accepted, false);
  assert.equal(next.accepted, true);
  assert.equal(state.gapCount, 1);
});


test('un index de fragment invalide condamne toute la ligne identifiable', () => {
  const state = createHistoryStreamState();
  acceptHistoryFragment(state, { sequence: 0, chunkIndex: 0, payload: 'entête' });
  const invalid = acceptHistoryFragment(state, { sequence: 1, chunkIndex: 7, payload: 'fragment invalide' });
  const sameLine = acceptHistoryFragment(state, { sequence: 1, chunkIndex: 0, payload: 'reprise incorrecte' });
  const nextLine = acceptHistoryFragment(state, { sequence: 2, chunkIndex: 0, payload: 'ligne suivante' });
  assert.equal(invalid.gap, true);
  assert.equal(invalid.resetBuffer, true);
  assert.equal(sameLine.accepted, false);
  assert.equal(nextLine.accepted, true);
  assert.equal(state.gapCount, 1);
});


test('rejette une durée de fonctionnement négative dans une ligne historique', async () => {
  const { validateBluetoothHistoryRow } = await import('../js/modules/bluetooth-history-row.js');
  const row = '10/11/2026 16:45:35;35;337;1;4;0;28;25;09,3;1;6.4.2;-1';
  const result = validateBluetoothHistoryRow(row);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'duration-invalid');
});


test('rejette une durée de fonctionnement fractionnaire exprimée en jours', async () => {
  const { validateBluetoothHistoryRow } = await import('../js/modules/bluetooth-history-row.js');
  const row = '10/11/2026 16:45:35;35;337;1;4;0;28;25;09,3;1;6.4.2;1.5';
  const result = validateBluetoothHistoryRow(row);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'duration-invalid');
});

test('rejette un index de ligne supérieur à la précision entière sûre de JavaScript', () => {
  const state = createHistoryStreamState();
  const result = acceptHistoryFragment(state, {
    sequence: Number.MAX_SAFE_INTEGER + 1,
    chunkIndex: 0,
    payload: 'index non représentable sans ambiguïté'
  });

  assert.equal(result.accepted, false);
  assert.equal(result.gap, true);
  assert.equal(state.fragments.size, 0);
});


test('un index de ligne non sûr ne doit pas empoisonner la séquence du flux', () => {
  const state = createHistoryStreamState();
  const invalid = acceptHistoryFragment(state, {
    sequence: Number.MAX_SAFE_INTEGER + 1,
    chunkIndex: 0,
    payload: 'index non représentable'
  });
  const valid = acceptHistoryFragment(state, {
    sequence: 0,
    chunkIndex: 0,
    payload: 'première ligne identifiable'
  });

  assert.equal(invalid.accepted, false);
  assert.equal(valid.accepted, true);
  assert.equal(state.sequence, 0);
  assert.equal(state.fragments.has('0:0'), true);
});


test('libère les fragments des lignes précédentes quand le flux avance', () => {
  const state = createHistoryStreamState();
  assert.equal(acceptHistoryFragment(state, {
    sequence: 0,
    chunkIndex: 0,
    payload: 'première ligne'
  }).accepted, true);
  assert.equal(acceptHistoryFragment(state, {
    sequence: 1,
    chunkIndex: 0,
    payload: 'deuxième ligne'
  }).accepted, true);

  assert.equal(state.fragments.size, 1);
  assert.equal(state.fragments.has('0:0'), false);
  assert.equal(state.fragments.has('1:0'), true);
});


test('condamne la ligne en cours lorsqu’une notification ne permet pas de lire son index', () => {
  const state = createHistoryStreamState();
  assert.equal(acceptHistoryFragment(state, {
    sequence: 0, chunkIndex: 0, payload: 'début de ligne'
  }).accepted, true);

  const invalid = acceptHistoryFragment(state, {
    sequence: null, chunkIndex: 10, payload: 'notification tronquée'
  });
  const remaining = acceptHistoryFragment(state, {
    sequence: 0, chunkIndex: 10, payload: 'suite de ligne'
  });

  assert.equal(invalid.accepted, false);
  assert.equal(invalid.gap, true);
  assert.equal(invalid.resetBuffer, true);
  assert.equal(remaining.accepted, false);
  assert.equal(state.skippedSequence, 0);
});


test('condamne la ligne en cours lorsque la séquence reçue est NaN', () => {
  const state = createHistoryStreamState();
  assert.equal(acceptHistoryFragment(state, {
    sequence: 0, chunkIndex: 0, payload: 'début de ligne'
  }).accepted, true);

  const invalid = acceptHistoryFragment(state, {
    sequence: Number.NaN, chunkIndex: 10, payload: 'séquence NaN'
  });
  const remaining = acceptHistoryFragment(state, {
    sequence: 0, chunkIndex: 10, payload: 'suite de ligne'
  });

  assert.equal(invalid.accepted, false);
  assert.equal(invalid.gap, true);
  assert.equal(remaining.accepted, false);
  assert.equal(state.skippedSequence, 0);
});


test('condamne la ligne en cours lorsque la séquence reçue est une chaîne', () => {
  const state = createHistoryStreamState();
  assert.equal(acceptHistoryFragment(state, {
    sequence: 0, chunkIndex: 0, payload: 'début de ligne'
  }).accepted, true);

  const invalid = acceptHistoryFragment(state, {
    sequence: '0', chunkIndex: 10, payload: 'séquence textuelle'
  });
  const remaining = acceptHistoryFragment(state, {
    sequence: 0, chunkIndex: 10, payload: 'suite de ligne'
  });

  assert.equal(invalid.accepted, false);
  assert.equal(invalid.gap, true);
  assert.equal(remaining.accepted, false);
  assert.equal(state.skippedSequence, 0);
});


test('détecte un dernier fragment manquant au passage à la ligne suivante', () => {
  const state = createHistoryStreamState();

  // Les 25 séquences initiales sont des métadonnées, pas des lignes de mesures.
  for (let sequence = 0; sequence < 25; sequence++) {
    const result = acceptHistoryFragment(state, {
      sequence, chunkIndex: 0, payload: 'metadata-' + sequence
    });
    assert.equal(result.accepted, true);
  }

  const rowStart = '\n12/11/2026 14:31:00;35;337;1;04;00;28;25;09,3;1;6.4.2;'
  const send = (sequence, chunkIndex, payload) =>
    acceptHistoryFragment(state, { sequence, chunkIndex, payload });

  // Une première ligne complète établit le format observé (fragments 0 à 40).
  assert.equal(send(25, 0, rowStart).accepted, true);
  for (const chunkIndex of [10, 20, 30, 40]) {
    assert.equal(send(25, chunkIndex, 'fragment-' + chunkIndex).accepted, true);
  }

  // La ligne suivante perd son dernier fragment 40 : les fragments 0 à 30 arrivent.
  assert.equal(send(26, 0, rowStart).accepted, true);
  for (const chunkIndex of [10, 20, 30]) {
    assert.equal(send(26, chunkIndex, 'fragment-' + chunkIndex).accepted, true);
  }

  // L'arrivée de la ligne suivante révèle la perte terminale et impose de vider le buffer.
  const nextRow = send(27, 0, rowStart);
  assert.equal(nextRow.accepted, true);
  assert.equal(nextRow.gap, true);
  assert.equal(nextRow.resetBuffer, true);
  assert.equal(state.gapCount, 1);

  // La ligne suivante reste exploitable et sa complétude est reconnue.
  for (const chunkIndex of [10, 20, 30, 40]) {
    assert.equal(send(27, chunkIndex, 'fragment-' + chunkIndex).accepted, true);
  }
  const followingRow = send(28, 0, rowStart);
  assert.equal(followingRow.accepted, true);
  assert.equal(followingRow.gap, false);
  assert.equal(state.gapCount, 1);
});
