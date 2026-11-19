import test from 'node:test';
import assert from 'node:assert/strict';

import { decodeVmiNotification } from '../js/modules/bluetooth-decoder.js';
import {
  acceptHistoryFragment,
  createHistoryStreamState,
  markHistoryRows
} from '../js/modules/bluetooth-history-stream.js';
import { validateBluetoothHistoryRow } from '../js/modules/bluetooth-history-row.js';
import { mergeImportedHistory } from '../js/modules/history.js';
import { buildVmiAssistantSummary } from '../js/modules/assistant-summary.js';
import { renderVmiAssistantView } from '../js/modules/assistant-view.js';

function makeHistoryNotification(sequence, chunkIndex, payload, final = false) {
  const encoded = new TextEncoder().encode(payload);
  const bytes = new Uint8Array(15 + encoded.length);
  bytes[0] = 0xA5;
  bytes[1] = 0xB6;
  bytes[2] = 0x30;
  bytes[9] = sequence & 0xff;
  bytes[10] = sequence >> 8;
  bytes[12] = chunkIndex;
  bytes[13] = final ? 1 : 0;
  bytes.set(encoded, 14);
  return bytes;
}

function makeElement() {
  return {
    className: '',
    textContent: '',
    children: [],
    replaceChildren() { this.children = []; },
    append(...items) { this.children.push(...items); }
  };
}

test('contrat intégré : notification BLE décodée, fragments réassemblés puis ligne historique validée', () => {
  const line = '10/11/2026 16:55:00;1;2;3;4;5;6;7;8;9;10;1234\r\n';
  const splitAt = 27;
  const notifications = [
    makeHistoryNotification(0, 0, line.slice(0, splitAt)),
    makeHistoryNotification(0, 10, line.slice(splitAt), true)
  ];

  const stream = createHistoryStreamState();
  let buffer = '';
  const validatedRows = [];

  for (const bytes of notifications) {
    const decoded = decodeVmiNotification(bytes);
    assert.equal(decoded?.kind, 'history');
    assert.equal(decoded.valid, true);

    const payload = new TextDecoder('latin1').decode(decoded.payload);
    const integrity = acceptHistoryFragment(stream, {
      sequence: decoded.sequence,
      chunkIndex: decoded.chunkIndex,
      payload
    });

    assert.equal(integrity.accepted, true);
    buffer += payload;
    const lines = buffer.split(/\r\n|\n|\r(?!$)/);
    buffer = lines.pop();
    for (const row of lines) {
      if (row.trim()) validatedRows.push(validateBluetoothHistoryRow(row));
    }
  }

  assert.equal(buffer, '');
  assert.equal(validatedRows.length, 1);
  assert.equal(validatedRows[0].valid, true);
  assert.equal(validatedRows[0].fields[0], '10/11/2026 16:55:00');
  assert.equal(validatedRows[0].fields[11], '1234');
  assert.equal(stream.gapCount, 0);
});

test('contrat intégré : un transfert partiel fusionné ne dégrade pas un relevé complet déjà stocké', () => {
  const timestamp = Date.UTC(2026, 10, 10, 16, 55);
  const stored = [{
    t: timestamp,
    st: 19.7,
    sh: 61,
    te: 10.7,
    he: 89,
    syncPartial: false
  }];
  const incomingPartial = markHistoryRows([{
    t: timestamp,
    st: null,
    sh: 63,
    te: 10.9,
    he: null
  }], false);

  const merged = mergeImportedHistory(stored, incomingPartial);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].st, 19.7);
  assert.equal(merged[0].sh, 63);
  assert.equal(merged[0].te, 10.9);
  assert.equal(merged[0].he, 89);
  assert.equal(merged[0].syncPartial, false);
  assert.equal(stored[0].sh, 61);
  assert.equal(incomingPartial[0].syncPartial, true);
});

test('contrat intégré : la synthèse métier produit un modèle directement affichable par le renderer', () => {
  const hour = 60 * 60 * 1000;
  const start = new Date(2026, 10, 1, 0, 0, 0).getTime();
  const history = [];

  for (let day = 0; day < 7; day++) {
    for (let h = 0; h < 24; h++) {
      history.push({
        t: start + day * 24 * hour + h * hour,
        st: 20,
        sh: 60,
        te: 10,
        he: 50,
        tExt: 12,
        debit: 125,
        rpm: 1200,
        volumeRaw: 337,
        vmiModeRaw: h < 8 ? 1 : h < 16 ? 2 : 3,
        vmiSpeedRaw: 5,
        consTmaxRaw: 10,
        seasonRaw: 1
      });
    }
  }

  const summary = buildVmiAssistantSummary(history);
  const elements = new Map([
    'assistantStatus',
    'assistantOverview',
    'assistantRecommendations',
    'assistantSections',
    'assistantLimits'
  ].map(id => [id, makeElement()]));
  const documentRef = {
    getElementById: id => elements.get(id),
    createElement: () => makeElement()
  };

  assert.ok(['available', 'limited'].includes(summary.status));
  assert.ok(Array.isArray(summary.sections));
  assert.ok(Array.isArray(summary.recommendations));
  assert.ok(Array.isArray(summary.limits));

  assert.doesNotThrow(() => renderVmiAssistantView(summary, { documentRef }));
  assert.match(elements.get('assistantStatus').textContent, /Analyse/);
  assert.equal(elements.get('assistantOverview').textContent, summary.overview);
  assert.equal(elements.get('assistantRecommendations').children.length, summary.recommendations.length);
  assert.equal(elements.get('assistantSections').children.length, summary.sections.length);
  assert.equal(elements.get('assistantLimits').children.length, summary.limits.length);
});


test('contrat intégré : un fragment initial manquant dans le flux BLE condamne la ligne sans bloquer la suivante', () => {
  const stream = createHistoryStreamState();
  let buffer = '';
  let integrityGap = false;
  const validatedRows = [];
  const rows = [
    '\n11/11/2026 14:00:00;1;2;3;4;5;6;7;8;9;10;1000\n',
    '\n11/11/2026 13:00:00;1;2;3;4;5;6;7;8;9;10;1001\n'
  ];
  const fragments = row => [
    row.slice(0, 12),
    row.slice(12, 24),
    row.slice(24, 36),
    row.slice(36, 48),
    row.slice(48)
  ];

  const receive = (sequence, chunkIndex, payload) => {
    const decoded = decodeVmiNotification(makeHistoryNotification(sequence, chunkIndex, payload));
    assert.equal(decoded?.kind, 'history');
    assert.equal(decoded.valid, true);
    const text = new TextDecoder('latin1').decode(decoded.payload);
    const result = acceptHistoryFragment(stream, {
      sequence: decoded.sequence,
      chunkIndex: decoded.chunkIndex,
      payload: text
    });
    if (result.gap) integrityGap = true;
    if (result.resetBuffer) buffer = '';
    if (!result.accepted) return;
    buffer += text;
    const lines = buffer.split(/\r\n|\n|\r(?!$)/);
    buffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) validatedRows.push(validateBluetoothHistoryRow(line));
    }
  };

  // Rejoue les séquences de métadonnées précédant les lignes de mesures.
  for (let sequence = 0; sequence < 77; sequence++) {
    const metadata = acceptHistoryFragment(stream, {
      sequence, chunkIndex: 0, payload: 'metadata-' + sequence
    });
    assert.equal(metadata.accepted, true);
  }
  // Ligne 77 complète, comme les lignes précédant la perte observée dans la capture.
  fragments(rows[0]).forEach((part, index) => receive(77, index * 10, part));
  // Ligne 78 : le fragment 0 manque ; les fragments restants doivent être ignorés.
  fragments(rows[0]).slice(1).forEach((part, index) => receive(78, (index + 1) * 10, part));
  // Ligne 79 : la ligne suivante complète doit redevenir exploitable.
  fragments(rows[1]).forEach((part, index) => receive(79, index * 10, part));

  assert.equal(integrityGap, true);
  assert.equal(validatedRows.length, 2);
  assert.equal(validatedRows[0].valid, true);
  assert.equal(validatedRows[1].valid, true);
  assert.equal(validatedRows[1].fields[0], '11/11/2026 13:00:00');
  assert.equal(stream.gapCount, 1);

  const savedRows = markHistoryRows(
    validatedRows.filter(result => result.valid).map(result => ({ rk: result.fields[0] })),
    !integrityGap
  );
  assert.ok(savedRows.every(row => row.syncPartial === true));
});
