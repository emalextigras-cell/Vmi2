import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStateTelemetryRecord, normalizeStateTelemetry, appendStateTelemetry, mergeStateTelemetry
} from '../js/modules/bluetooth-state-telemetry.js';

const decoded = overrides => ({
  kind:'state', volume:337, rawSpeed:2, renewal:360, airChangesPerHour:0.36,
  airflowM3h:121, fixedAirflow:false, ...overrides
});

test('conserve les champs réels de renouvellement d’une trame état sans inventer le mode manuel', () => {
  const record = createStateTelemetryRecord({ timestamp:1000, decoded:decoded() });
  assert.deepEqual(record, {
    t:1000, volumeM3:337, rawSpeed:2, renewalRaw:360,
    airChangesPerHour:0.36, airflowM3h:121, fixedAirflow:false
  });
  assert.equal(Object.hasOwn(record, 'manualMode'), false);
});

test('refuse une trame incomplète ou incohérente', () => {
  assert.equal(createStateTelemetryRecord({timestamp:1,decoded:{kind:'room'}}), null);
  assert.equal(createStateTelemetryRecord({timestamp:1,decoded:decoded({renewal:NaN})}), null);
});

test('enregistre une transition mais ignore les répétitions du même état', () => {
  const first = createStateTelemetryRecord({timestamp:1000,decoded:decoded()});
  const repeated = createStateTelemetryRecord({timestamp:2000,decoded:decoded()});
  const changed = createStateTelemetryRecord({timestamp:3000,decoded:decoded({rawSpeed:3,renewal:450,airChangesPerHour:0.45,airflowM3h:152})});
  const one = appendStateTelemetry([], first);
  assert.deepEqual(appendStateTelemetry(one, repeated), one);
  assert.equal(appendStateTelemetry(one, changed).length, 2);
});

test('normalise, trie et limite les relevés', () => {
  const result = normalizeStateTelemetry([
    {t:2,volumeM3:337,rawSpeed:2,renewalRaw:360,airChangesPerHour:.36,airflowM3h:121,fixedAirflow:false},
    {t:1,volumeM3:337,rawSpeed:1,renewalRaw:220,airChangesPerHour:.22,airflowM3h:74,fixedAirflow:false},
    {t:3,volumeM3:337,rawSpeed:1,renewalRaw:1,airChangesPerHour:.1,airflowM3h:1,fixedAirflow:'no'}
  ], 1);
  assert.deepEqual(result.map(record=>record.t), [2]);
});

test('fusionne les relevés, remplace les doublons et écarte les dates futures', () => {
  const base = {volumeM3:337,rawSpeed:2,renewalRaw:360,airChangesPerHour:.36,airflowM3h:121,fixedAirflow:false};
  const result = mergeStateTelemetry([{t:1,...base}], [{t:1,...base,renewalRaw:450,airChangesPerHour:.45,airflowM3h:152},{t:2,...base},{t:9,...base}], 2);
  assert.deepEqual(result.map(record=>record.t), [1,2]);
  assert.equal(result[0].renewalRaw, 450);
});
