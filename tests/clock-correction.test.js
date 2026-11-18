import test from 'node:test';
import assert from 'node:assert/strict';
import { fixClock } from '../js/modules/clock-correction.js';

const MIN_VALID = new Date(2025, 0, 1).getTime();
const dayNumber = timestamp => {
  const date = new Date(timestamp);
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
};

test('fixClock rejette un épisode brut de 2018', () => {
  const referenceDate = new Date(2026, 10, 10, 11, 30).getTime();
  const referenceDays = 1200;
  const history = [{ t: referenceDate, d: referenceDays }];
  const oldDate = new Date(2018, 3, 12, 11, 30).getTime();
  const oldRecord = { t: oldDate, d: referenceDays };
  const result = fixClock([oldRecord], history, MIN_VALID);

  assert.equal(result.fixed, 0);
  assert.deepEqual(result.kept, []);
  assert.equal(oldRecord.fixed, undefined);
  assert.equal(oldRecord.t, oldDate);
});

test('fixClock conserve les relevés déjà valides sans les compter comme corrigés', () => {
  const valid = { t: MIN_VALID + 60_000, d: 100 };
  const result = fixClock([valid], [], MIN_VALID);
  assert.equal(result.fixed, 0);
  assert.deepEqual(result.kept, [valid]);
});

test('fixClock laisse les dates anciennes non corrigées hors des relevés conservés si aucun repère fiable', () => {
  const oldRecord = { t: new Date(2018, 3, 12, 9, 0).getTime(), d: 10 };
  const result = fixClock([oldRecord], [], MIN_VALID);
  assert.equal(result.fixed, 0);
  assert.deepEqual(result.kept, []);
  assert.equal(oldRecord.t, new Date(2018, 3, 12, 9, 0).getTime());
});

test('fixClock rejette les épisodes bruts de 2018 éloignés', () => {
  const reference = new Date(2026, 10, 10, 11, 0).getTime();
  const history = [{ t: reference, d: 1000 }];
  const first = { t: new Date(2018, 3, 10, 11, 0).getTime(), d: 1000 };
  const second = { t: new Date(2018, 3, 20, 11, 0).getTime(), d: 1010 };
  const result = fixClock([first, second], history, MIN_VALID);
  assert.equal(result.fixed, 0);
  assert.equal(first.fixed, undefined);
  assert.equal(second.fixed, undefined);
  assert.deepEqual(result.kept, []);
});

test('fixClock rejette les dates 2018 même avec un repère réel', () => {
  const referenceDate = new Date(2026, 10, 10, 16, 45, 35).getTime();
  const history = [{ t: referenceDate, d: 186 }];
  const morning = { t: new Date(2018, 3, 12, 7, 24, 2).getTime(), d: 159 };
  const daytime = { t: new Date(2018, 3, 12, 11, 30, 0).getTime(), d: 159 };
  const result = fixClock([morning, daytime], history, MIN_VALID);

  assert.equal(result.fixed, 0);
  assert.deepEqual(result.kept, []);
  assert.equal(morning.fixed, undefined);
  assert.equal(daytime.fixed, undefined);
});


test('fixClock écarte les dates reconstruites après la fin de la synchronisation', () => {
  const referenceDate = Date.UTC(2026, 10, 16, 10, 7, 9);
  const syncFinishedAt = Date.UTC(2026, 10, 17, 8, 7, 53);
  const history = [{ t: referenceDate, d: 185 }];
  const first = { t: new Date(2018, 4, 16, 11, 15, 45).getTime(), d: 186 };
  const second = { t: new Date(2018, 4, 16, 11, 19, 35).getTime(), d: 186 };

  const result = fixClock([first, second], history, MIN_VALID, syncFinishedAt);

  assert.equal(result.fixed, 0);
  assert.equal(result.future, 0);
  assert.deepEqual(result.futureDetails, []);
  assert.deepEqual(result.kept, []);
  assert.equal(first.t, new Date(2018, 4, 16, 11, 15, 45).getTime());
  assert.equal(second.t, new Date(2018, 4, 16, 11, 19, 35).getTime());
  assert.equal(first.fixed, undefined);
  assert.equal(second.fixed, undefined);
});

test('fixClock rejette une date brute de 2018 même antérieure à la fin de synchronisation', () => {
  const referenceDate = new Date(2026, 10, 16, 11, 7, 9).getTime();
  const syncFinishedAt = new Date(2026, 10, 17, 12, 0, 0).getTime();
  const history = [{ t: referenceDate, d: 185 }];
  const oldRecord = { t: new Date(2018, 4, 16, 11, 15, 45).getTime(), d: 186 };

  const result = fixClock([oldRecord], history, MIN_VALID, syncFinishedAt);

  assert.equal(result.fixed, 0);
  assert.equal(result.future, 0);
  assert.deepEqual(result.kept, []);
  assert.equal(oldRecord.fixed, undefined);
});

test('fixClock écarte aussi un relevé déjà daté après la fin de synchronisation', () => {
  const syncFinishedAt = new Date(2026, 10, 17, 12, 0, 0).getTime();
  const futureRecord = { t: syncFinishedAt + 60_000, d: 200 };

  const result = fixClock([futureRecord], [], MIN_VALID, syncFinishedAt);

  assert.equal(result.future, 1);
  assert.deepEqual(result.kept, []);
});


test('fixClock exclut un horodatage fini mais hors plage JavaScript', () => {
  const invalidDate = { t: Number.MAX_VALUE, d: 200 };
  const result = fixClock([invalidDate], [], MIN_VALID);

  assert.equal(result.fixed, 0);
  assert.deepEqual(result.kept, []);
  assert.equal(result.future, 0);
});
