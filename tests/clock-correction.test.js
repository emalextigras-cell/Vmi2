import test from 'node:test';
import assert from 'node:assert/strict';
import { fixClock } from '../js/modules/clock-correction.js';

const MIN_VALID = new Date(2025, 0, 1).getTime();
const dayNumber = timestamp => {
  const date = new Date(timestamp);
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
};

test('fixClock corrige un épisode ancien à partir du compteur de jours', () => {
  const referenceDate = new Date(2026, 10, 10, 11, 30).getTime();
  const referenceDays = 1200;
  const history = [{ t: referenceDate, d: referenceDays }];
  const oldDate = new Date(2018, 3, 12, 11, 30).getTime();
  const oldRecord = { t: oldDate, d: referenceDays };
  const expectedOffset = dayNumber(referenceDate) - referenceDays + referenceDays - dayNumber(oldDate);

  const result = fixClock([oldRecord], history, MIN_VALID);

  assert.equal(result.fixed, 1);
  assert.equal(result.kept.length, 1);
  assert.equal(oldRecord.fixed, true);
  assert.equal(oldRecord.t, new Date(2018, 3, 12 + expectedOffset, 11, 30).getTime());
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

test('fixClock sépare les épisodes éloignés de plus de trois jours', () => {
  const reference = new Date(2026, 10, 10, 11, 0).getTime();
  const history = [{ t: reference, d: 1000 }];
  const first = { t: new Date(2018, 3, 10, 11, 0).getTime(), d: 1000 };
  const second = { t: new Date(2018, 3, 20, 11, 0).getTime(), d: 1010 };
  const result = fixClock([first, second], history, MIN_VALID);
  assert.equal(result.fixed, 2);
  assert.equal(first.fixed, true);
  assert.equal(second.fixed, true);
  assert.ok(first.t >= MIN_VALID);
  assert.ok(second.t >= MIN_VALID);
});

test('fixClock recale les dates 2018 avec un repère réel de novembre 2026', () => {
  const referenceDate = new Date(2026, 10, 10, 16, 45, 35).getTime();
  const history = [{ t: referenceDate, d: 185 }];
  const morning = { t: new Date(2018, 3, 12, 7, 24, 2).getTime(), d: 159 };
  const daytime = { t: new Date(2018, 3, 12, 11, 30, 0).getTime(), d: 159 };
  const dayNumber = timestamp => {
    const date = new Date(timestamp);
    return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
  };
  const offset = dayNumber(referenceDate) - 186 + 159 - dayNumber(daytime.t);
  const result = fixClock([morning, daytime], history, MIN_VALID);

  assert.equal(result.fixed, 2);
  assert.equal(result.kept.length, 2);
  assert.equal(morning.fixed, true);
  assert.equal(daytime.fixed, true);
  assert.equal(morning.t, new Date(2018, 3, 12 + offset, 7, 24, 2).getTime());
  assert.equal(daytime.t, new Date(2018, 3, 12 + offset, 11, 30, 0).getTime());
});


test('fixClock écarte les dates reconstruites après la fin de la synchronisation', () => {
  const referenceDate = Date.UTC(2026, 10, 16, 10, 7, 9);
  const syncFinishedAt = Date.UTC(2026, 10, 17, 8, 7, 53);
  const history = [{ t: referenceDate, d: 186 }];
  const first = { t: new Date(2018, 4, 16, 11, 15, 45).getTime(), d: 186 };
  const second = { t: new Date(2018, 4, 16, 11, 19, 35).getTime(), d: 186 };

  const result = fixClock([first, second], history, MIN_VALID, syncFinishedAt);

  assert.equal(result.fixed, 0);
  assert.equal(result.future, 2);
  assert.deepEqual(result.kept, []);
  assert.equal(first.t, new Date(2018, 4, 16, 11, 15, 45).getTime());
  assert.equal(second.t, new Date(2018, 4, 16, 11, 19, 35).getTime());
  assert.equal(first.fixed, undefined);
  assert.equal(second.fixed, undefined);
});

test('fixClock conserve une date reconstruite antérieure à la fin de synchronisation', () => {
  const referenceDate = new Date(2026, 10, 16, 11, 7, 9).getTime();
  const syncFinishedAt = new Date(2026, 10, 17, 12, 0, 0).getTime();
  const history = [{ t: referenceDate, d: 185 }];
  const oldRecord = { t: new Date(2018, 4, 16, 11, 15, 45).getTime(), d: 186 };

  const result = fixClock([oldRecord], history, MIN_VALID, syncFinishedAt);

  assert.equal(result.fixed, 1);
  assert.equal(result.future, 0);
  assert.equal(result.kept.length, 1);
  assert.equal(oldRecord.fixed, true);
  assert.ok(oldRecord.t <= syncFinishedAt);
});

test('fixClock écarte aussi un relevé déjà daté après la fin de synchronisation', () => {
  const syncFinishedAt = new Date(2026, 10, 17, 12, 0, 0).getTime();
  const futureRecord = { t: syncFinishedAt + 60_000, d: 200 };

  const result = fixClock([futureRecord], [], MIN_VALID, syncFinishedAt);

  assert.equal(result.future, 1);
  assert.deepEqual(result.kept, []);
});
