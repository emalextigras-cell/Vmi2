import test from 'node:test';
import assert from 'node:assert/strict';
import { findNewestCounterRecord } from '../js/modules/sync.js';

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
