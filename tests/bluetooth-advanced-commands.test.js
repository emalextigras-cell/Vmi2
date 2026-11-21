import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAdvancedCommand, stopPreheating } from '../js/modules/bluetooth-advanced-commands.js';

function harness(initial, outcomes = []) {
  let state = { ...initial };
  const writes = [];
  let reads = 0;
  return {
    writes,
    get reads() { return reads; },
    deps: {
      isConnected: () => true,
      readState: async () => { reads++; return { ...state }; },
      writeCommand: async (register, value) => {
        writes.push([register, value]);
        const next = outcomes.shift();
        if (next) state = { ...state, ...next };
      },
      getLastCommandState: async () => ({ ...state })
    },
    setState(next) { state = { ...state, ...next }; }
  };
}

test('surventilation : lecture préalable puis bascule unique et confirmation', async () => {
  const h = harness({ surventilation: false }, [{ surventilation: true }]);
  const result = await applyAdvancedCommand(h.deps, 'surventilation', true);
  assert.deepEqual(h.writes, [[0x0B, 0]]);
  assert.equal(result.confirmed, true);
});

test('surventilation déjà dans l’état demandé : aucune écriture', async () => {
  const h = harness({ surventilation: true });
  const result = await applyAdvancedCommand(h.deps, 'surventilation', true);
  assert.deepEqual(h.writes, []);
  assert.equal(result.changed, false);
});

test('surventilation non confirmée : ne renvoie jamais la bascule', async () => {
  const h = harness({ surventilation: false });
  await assert.rejects(applyAdvancedCommand(h.deps, 'surventilation', true), /ne sera pas renvoyée/);
  assert.deepEqual(h.writes, [[0x0B, 0]]);
});

test('limite estivale : valide la plage puis confirme le registre 0x17', async () => {
  const h = harness({ summerLimit: 32 }, [{ summerLimit: 35 }]);
  await applyAdvancedCommand(h.deps, 'summerLimit', 35);
  assert.deepEqual(h.writes, [[0x17, 35]]);
  await assert.rejects(applyAdvancedCommand(h.deps, 'summerLimit', 38), RangeError);
});

test('débit fixe : écrit 1 ou 0 selon l’état demandé', async () => {
  const h = harness({ fixedAirflow: false }, [{ fixedAirflow: true }]);
  await applyAdvancedCommand(h.deps, 'fixedAirflow', true);
  assert.deepEqual(h.writes, [[0x1B, 1]]);
});

test('consigne de préchauffage : refuse hors plage et confirme 0x1C', async () => {
  const h = harness({ preheatSetpoint: 0 }, [{ preheatSetpoint: 15 }]);
  await applyAdvancedCommand(h.deps, 'preheatSetpoint', 15);
  assert.deepEqual(h.writes, [[0x1C, 15]]);
  await assert.rejects(applyAdvancedCommand(h.deps, 'preheatSetpoint', 19), RangeError);
});

test('arrêt du préchauffage : 0x2F=0 suffit si marche et consigne sont nulles', async () => {
  const h = harness({ preheatOn: true, preheatSetpoint: 15 }, [
    { preheatOn: false, preheatSetpoint: 0 }
  ]);
  await stopPreheating(h.deps);
  assert.deepEqual(h.writes, [[0x2F, 0]]);
});

test('arrêt du préchauffage : utilise 0x1C=0 si la consigne reste posée', async () => {
  const h = harness({ preheatOn: true, preheatSetpoint: 15 }, [
    { preheatOn: false, preheatSetpoint: 15 },
    { preheatOn: false, preheatSetpoint: 0 }
  ]);
  await stopPreheating(h.deps);
  assert.deepEqual(h.writes, [[0x2F, 0], [0x1C, 0]]);
});

test('arrêt du préchauffage : aucune seconde écriture si la première suffit à éteindre', async () => {
  const h = harness({ preheatOn: false, preheatSetpoint: 0 });
  await stopPreheating(h.deps);
  assert.deepEqual(h.writes, []);
});

test('une commande non confirmée échoue sans répétition', async () => {
  const h = harness({ fixedAirflow: false });
  await assert.rejects(applyAdvancedCommand(h.deps, 'fixedAirflow', true), /Aucune nouvelle écriture/);
  assert.deepEqual(h.writes, [[0x1B, 1]]);
});

test('aucune écriture si la connexion est absente', async () => {
  const h = harness({ fixedAirflow: false });
  h.deps.isConnected = () => false;
  await assert.rejects(applyAdvancedCommand(h.deps, 'fixedAirflow', true), /interrompue/);
  assert.deepEqual(h.writes, []);
});
