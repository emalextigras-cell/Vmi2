import test from 'node:test';
import assert from 'node:assert/strict';
import { selectDataRange } from '../js/modules/history-selection.js';
import { dayStart, shiftDay } from '../js/modules/date-utils.js';

test('selectDataRange filtre les dates invalides et trie sans modifier la source', () => {
  const source = [{ t: 1794000000000 }, { t: 1793900000000 }, null, { t: 0 }];
  const before = [...source];
  const result = selectDataRange(source, { daysSetting: 0 });
  assert.deepEqual(result.map(row => row.t), [1793900000000, 1794000000000]);
  assert.deepEqual(source, before);
});

test('selectDataRange sélectionne une journée locale complète', () => {
  const day = '2026-11-15';
  const start = dayStart(day);
  const end = dayStart(shiftDay(day, 1));
  const result = selectDataRange([
    { t: end }, { t: start + 3600000 }, { t: start - 1 }
  ], { selectedDate: day, daysSetting: 30 });
  assert.deepEqual(result.map(row => row.t), [start + 3600000]);
});

test('selectDataRange limite la période aux derniers jours depuis le relevé le plus récent', () => {
  const end = new Date(2026, 10, 15, 12).getTime();
  const result = selectDataRange([
    { t: end }, { t: end - 2 * 86400000 }, { t: end - 4 * 86400000 }
  ], { daysSetting: 3 });
  assert.deepEqual(result.map(row => row.t), [end - 2 * 86400000, end]);
});

test('selectDataRange retourne un tableau vide pour une entrée invalide', () => {
  assert.deepEqual(selectDataRange(null), []);
});

test('selectDataRange écarte les points futurs sans modifier les données sources', () => {
  const now = new Date(2026, 10, 17, 12, 0, 0).getTime();
  const past = { t: now - 60_000, sh: 55 };
  const future = { t: now + 60_000, sh: 90 };
  const records = [future, past];

  const selected = selectDataRange(records, { daysSetting: 0, maxTimestamp: now });

  assert.deepEqual(selected, [past]);
  assert.deepEqual(records, [future, past]);
});

test('la fenêtre des derniers jours est calculée depuis le dernier relevé non futur', () => {
  const now = new Date(2026, 10, 17, 12, 0, 0).getTime();
  const recent = { t: now - 2 * 86400000, sh: 50 };
  const old = { t: now - 40 * 86400000, sh: 60 };
  const future = { t: now + 86400000, sh: 80 };

  const selected = selectDataRange([old, recent, future], { daysSetting: 30, maxTimestamp: now });

  assert.deepEqual(selected, [recent]);
});


test('selectDataRange écarte les horodatages finis hors plage JavaScript', () => {
  const valid = { t: 1_800_000_000_000 };
  const invalidDate = { t: Number.MAX_VALUE };
  const result = selectDataRange([valid, invalidDate], { daysSetting: 0, maxTimestamp: Infinity });
  assert.deepEqual(result, [valid]);
});
