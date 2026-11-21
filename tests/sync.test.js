import test from 'node:test';
import assert from 'node:assert/strict';
import { findNewestCounterRecord, classifyHistoryDownloadRow } from '../js/modules/sync.js';

test('retient le compteur de la dernière ligne reçue, pas le premier compteur', () => {
  const records = [{ d: 180 }, { d: 181 }, { d: 182 }];
  assert.equal(findNewestCounterRecord(records), records[2]);
});

test('respecte l’ordre du flux après une remise à zéro du compteur', () => {
  const records = [{ d: 190 }, { d: 191 }, { d: 2 }, { d: 3 }];
  assert.equal(findNewestCounterRecord(records), records[3]);
  assert.equal(findNewestCounterRecord(records).d, 3);
});

test('ignore les compteurs absents, fractionnaires ou négatifs en remontant le flux', () => {
  const records = [{ d: 5 }, { d: -1 }, { d: 2.5 }, {}, { d: 6 }];
  assert.equal(findNewestCounterRecord(records), records[4]);
  assert.equal(findNewestCounterRecord([{ d: -1 }, { d: 1.5 }, {}]), null);
});

test('retourne null pour un historique vide ou mal formé', () => {
  assert.equal(findNewestCounterRecord([]), null);
  assert.equal(findNewestCounterRecord(null), null);
});


test('le bootstrap saute les lignes partielles connues et collecte les lignes historiques encore inconnues', () => {
  const baselineSignatures = new Set();
  const knownSignatures = new Set([
    '01/05/2018 23:34:40|178',
    '01/05/2018 22:34:40|178'
  ]);
  const seenSignatures = new Set();
  const options = { baselineSignatures, knownSignatures, seenSignatures, bootstrap: true };

  assert.equal(classifyHistoryDownloadRow('01/05/2018 23:34:40|178', options), 'skip');
  assert.equal(classifyHistoryDownloadRow('01/05/2018 21:34:40|178', options), 'collect');
  assert.equal(classifyHistoryDownloadRow('01/05/2018 22:34:40|178', options), 'skip');
  assert.equal(classifyHistoryDownloadRow('01/05/2018 21:34:40|178', options), 'skip');
  assert.equal(classifyHistoryDownloadRow('01/05/2018 20:34:39|178', options), 'collect');
});

test('une borne complète coupe le flux après avoir ignoré les lignes partielles déjà connues', () => {
  const baseline = '12/04/2018 07:24:02|159';
  const options = {
    baselineSignatures: new Set([baseline]),
    knownSignatures: new Set(['01/05/2018 23:34:40|178', baseline]),
    seenSignatures: new Set(),
    bootstrap: false
  };

  assert.equal(classifyHistoryDownloadRow('01/05/2018 23:34:40|178', options), 'skip');
  assert.equal(classifyHistoryDownloadRow('01/05/2018 22:34:40|178', options), 'collect');
  assert.equal(classifyHistoryDownloadRow(baseline, options), 'cut');
});
