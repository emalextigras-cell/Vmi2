import test from 'node:test';
import assert from 'node:assert/strict';
import { fixClock, evaluateCounterBaseline } from '../js/modules/clock-correction.js';

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


test('fixClock recale les dates Bluetooth de 2018 avec un repère récent et rejette celles après la synchronisation', () => {
  const referenceDate = new Date(2026, 10, 18, 11, 0, 0).getTime();
  const syncFinishedAt = new Date(2026, 10, 19, 11, 12, 48).getTime();
  const history = [{ t: referenceDate, d: 194, rk: '18/11/2026 11:00:00' }];
  const rawRows = [
    { t: new Date(2018, 4, 18, 13, 47, 41).getTime(), d: 195 },
    { t: new Date(2018, 4, 18, 12, 48, 29).getTime(), d: 195 },
    { t: new Date(2018, 4, 18, 11, 48, 29).getTime(), d: 195 },
    { t: new Date(2018, 4, 18, 10, 48, 29).getTime(), d: 195 },
    { t: new Date(2018, 4, 18, 9, 48, 28).getTime(), d: 195 }
  ];

  const result = fixClock(rawRows, history, MIN_VALID, syncFinishedAt, { allowPre2020RawDates: true });

  assert.equal(result.fixed, 2);
  assert.equal(result.kept.length, 2);
  assert.equal(result.future, 3);
  assert.deepEqual(result.kept.map(record => new Date(record.t).getHours()), [10, 9]);
  assert.ok(result.kept.every(record => new Date(record.t).getFullYear() === 2026));
  assert.ok(result.kept.every(record => record.fixed === true));
});

test('fixClock ne recale pas une date Bluetooth ancienne sans repère récent fiable', () => {
  const oldRecord = { t: new Date(2018, 4, 18, 9, 48, 28).getTime(), d: 195 };
  const result = fixClock([oldRecord], [], MIN_VALID, Date.now(), { allowPre2020RawDates: true });

  assert.equal(result.fixed, 0);
  assert.deepEqual(result.kept, []);
  assert.equal(oldRecord.fixed, undefined);
});


test('fixClock ne retient comme repères que les relevés à partir de 10 h', () => {
  const beforeThreshold = { t: new Date(2026, 10, 10, 9, 59).getTime(), d: 80 };
  const atThreshold = { t: new Date(2026, 10, 10, 10, 0).getTime(), d: 100 };
  const afterThreshold = { t: new Date(2026, 10, 10, 11, 0).getTime(), d: 100 };

  const result = fixClock([beforeThreshold, atThreshold, afterThreshold], [], MIN_VALID);

  assert.equal(result.referenceCount, 2);
  assert.equal(result.concordantCount, 2);
  assert.equal(result.concordanceRate, 100);
});

test('fixClock expose le nombre de repères et le taux de concordance du décalage majoritaire', () => {
  const base = dayNumber(new Date(2026, 10, 10, 10, 0).getTime()) - 100;
  const records = [
    { t: new Date(2026, 10, 10, 10, 0).getTime(), d: 100 },
    { t: new Date(2026, 10, 10, 11, 0).getTime(), d: 100 },
    { t: new Date(2026, 10, 10, 12, 0).getTime(), d: 100 },
    { t: new Date(2026, 10, 11, 13, 0).getTime(), d: 100 }
  ];

  // Le dernier relevé est volontairement discordant d'un jour.
  const result = fixClock(records, [], MIN_VALID);

  assert.equal(result.referenceCount, 4);
  assert.equal(result.concordantCount, 3);
  assert.equal(result.concordanceRate, 75);
  assert.ok(Number.isFinite(base));
});

test('fixClock ne publie aucun repère concordant lorsque le compteur a reculé', () => {
  const history = [{ t: new Date(2026, 10, 10, 11, 0).getTime(), d: 194 }];
  const incoming = [{ t: new Date(2018, 4, 18, 11, 0).getTime(), d: 12 }];
  const result = fixClock(incoming, history, MIN_VALID, Date.now(), { allowPre2020RawDates: true });

  assert.equal(result.counterReset, true);
  assert.deepEqual(result.counterResetDetails, { previousMax: 194, current: 12, reason: 'counter-decreased' });
  assert.equal(result.referenceCount, 0);
  assert.equal(result.concordantCount, 0);
  assert.equal(result.concordanceRate, null);
  assert.equal(result.referenceSource, 'none');
  assert.equal(result.fixed, 0);
});


test('fixClock reconstruit avec les seuls nouveaux repères après un recul du compteur', () => {
  const history = [{ t: new Date(2026, 10, 10, 11, 0).getTime(), d: 194 }];
  const incoming = [
    { t: new Date(2026, 10, 18, 11, 0).getTime(), d: 3 },
    { t: new Date(2026, 10, 19, 11, 0).getTime(), d: 4 },
    { t: new Date(2018, 4, 18, 11, 0).getTime(), d: 3 }
  ];
  const result = fixClock(incoming, history, MIN_VALID, Date.now(), { allowPre2020RawDates: true });

  assert.equal(result.counterReset, true);
  assert.equal(result.referenceSource, 'incoming-only');
  assert.equal(result.referenceCount, 2);
  assert.equal(result.fixed, 1);
  assert.equal(new Date(result.kept.find(record => record.fixed).t).getFullYear(), 2026);
});

test('fixClock ne réutilise pas l’ancien décalage si aucun nouveau repère fiable existe', () => {
  const history = [{ t: new Date(2026, 10, 10, 11, 0).getTime(), d: 194 }];
  const incoming = [{ t: new Date(2018, 4, 18, 11, 0).getTime(), d: 3 }];
  const result = fixClock(incoming, history, MIN_VALID, Date.now(), { allowPre2020RawDates: true });

  assert.equal(result.counterReset, true);
  assert.equal(result.referenceSource, 'none');
  assert.equal(result.fixed, 0);
  assert.deepEqual(result.kept, []);
});


test('fixClock exige deux jours de repères indépendants après un recul', () => {
  const history = [{ t: new Date(2026, 10, 10, 11, 0).getTime(), d: 194 }];
  const incoming = [
    { t: new Date(2026, 10, 18, 10, 30).getTime(), d: 3 },
    { t: new Date(2026, 10, 18, 11, 0).getTime(), d: 3 },
    { t: new Date(2018, 4, 18, 11, 0).getTime(), d: 3 }
  ];
  const result = fixClock(incoming, history, MIN_VALID, Date.now(), { allowPre2020RawDates: true });

  assert.equal(result.counterReset, true);
  assert.equal(result.referenceCount, 0);
  assert.equal(result.referenceSource, 'none');
  assert.equal(result.fixed, 0);
});


test('counter baseline accepte une progression cohérente avec le temps écoulé', () => {
  const result = evaluateCounterBaseline({
    baseline: { d: 186, observedAt: Date.UTC(2026, 10, 1, 12) },
    currentDays: 196,
    observedAt: Date.UTC(2026, 10, 11, 12)
  });
  assert.equal(result.discontinuity, false);
  assert.equal(result.baseline.d, 196);
  assert.equal(result.candidate, null);
});

test('counter baseline détecte un saut supérieur au temps écoulé même si le compteur dépasse l’ancien maximum', () => {
  const result = evaluateCounterBaseline({
    baseline: { d: 186, observedAt: Date.UTC(2026, 10, 1, 12) },
    currentDays: 230,
    observedAt: Date.UTC(2026, 10, 11, 12)
  });
  assert.equal(result.discontinuity, true);
  assert.equal(result.reason, 'counter-jump');
  assert.equal(result.previousDays, 186);
  assert.equal(result.candidate.d, 230);
  assert.equal(result.baseline.d, 186);
});

test('counter baseline confirme une nouvelle référence après une seconde progression cohérente', () => {
  const result = evaluateCounterBaseline({
    baseline: { d: 186, observedAt: Date.UTC(2026, 10, 1, 12) },
    candidate: { d: 230, observedAt: Date.UTC(2026, 10, 11, 12) },
    currentDays: 231,
    observedAt: Date.UTC(2026, 10, 12, 12)
  });
  assert.equal(result.discontinuity, true);
  assert.equal(result.reason, 'candidate-confirmed');
  assert.equal(result.baseline.d, 231);
  assert.equal(result.candidate, null);
});

test('counter baseline remplace une candidate si sa progression reste incohérente', () => {
  const result = evaluateCounterBaseline({
    baseline: { d: 186, observedAt: Date.UTC(2026, 10, 1, 12) },
    candidate: { d: 230, observedAt: Date.UTC(2026, 10, 11, 12) },
    currentDays: 280,
    observedAt: Date.UTC(2026, 10, 12, 12)
  });
  assert.equal(result.discontinuity, true);
  assert.equal(result.reason, 'candidate-replaced');
  assert.equal(result.candidate.d, 280);
  assert.equal(result.baseline.d, 186);
});
