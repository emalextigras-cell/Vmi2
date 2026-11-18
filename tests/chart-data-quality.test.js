import test from 'node:test';
import assert from 'node:assert/strict';
import { fillMissing, hasBlockedBetween } from '../js/modules/chart-renderer.js';

test('une absence reste vide et ne fabrique pas une mesure', () => {
  const points = [
    { t: 0, v: 10 },
    { t: 60_000, v: null },
    { t: 120_000, v: 20 }
  ];
  const result = fillMissing(points);
  assert.deepEqual(result.map(point => point.v), [10, null, 20]);
  assert.equal(result[1].blocked, true);
});

test('une mesure rejetée comme aberrante reste un trou dans la courbe', () => {
  const points = [
    { t: 0, v: 10 },
    { t: 60_000, v: null, blocked: true },
    { t: 120_000, v: 20 }
  ];
  const result = fillMissing(points);
  assert.deepEqual(result, [
    { t: 0, v: 10, blocked: false },
    { t: 60_000, v: null, blocked: true },
    { t: 120_000, v: 20, blocked: false }
  ]);
});

test('une absence et une anomalie restent chacune à leur position exacte', () => {
  const points = [
    { t: 0, v: 10 },
    { t: 60_000, v: null },
    { t: 120_000, v: null, blocked: true },
    { t: 180_000, v: null },
    { t: 240_000, v: 20 }
  ];
  const result = fillMissing(points);
  assert.deepEqual(result.map(point => point.v), [10, null, null, null, 20]);
  assert.equal(result[2].blocked, true);
});

test('le moteur de tracé détecte une anomalie entre deux points valides', () => {
  const points = [
    { t: 0, v: 10, blocked: false },
    { t: 60_000, v: null, blocked: true },
    { t: 120_000, v: 20, blocked: false }
  ];
  assert.equal(hasBlockedBetween(points, 0, 120_000), true);
  assert.equal(hasBlockedBetween(points, 0, 60_000), false);
  assert.equal(hasBlockedBetween(points, 60_000, 120_000), false);
});


test('les graphiques ne reçoivent pas de relevés sans horodatage exploitable', async () => {
  const { renderCharts } = await import('../js/modules/chart-renderer.js');
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) {
      const element = {
        innerHTML: '',
        querySelectorAll: () => [],
        querySelector: selector => selector === 'svg'
          ? { addEventListener() {}, getBoundingClientRect: () => ({ width: 700, left: 0 }) }
          : selector === '.tip'
            ? { style: {} }
            : { setAttribute() {}, style: {} }
      };
      elements.set(id, element);
    }
    return elements.get(id);
  };

  renderCharts([
    { sh: 50, st: 20, he: 60, te: 10 },
    { t: Number.MAX_VALUE, sh: 55, st: 21, he: 65, te: 11 },
    { t: 1_800_000_000_000, sh: 58, st: 22, he: 68, te: 12 }
  ], null, get);

  assert.doesNotMatch(elements.get('chartRH').innerHTML, /NaN|Invalid Date/);
  assert.match(elements.get('chartRH').innerHTML, /1\.8/);
});


test('renderCharts trace les relevés dans l’ordre chronologique même si l’entrée est désordonnée', async () => {
  const { renderCharts } = await import('../js/modules/chart-renderer.js');
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        innerHTML: '',
        querySelectorAll: () => [],
        querySelector: selector => selector === 'svg'
          ? { addEventListener() {}, getBoundingClientRect: () => ({ width: 700, left: 0 }) }
          : selector === '.tip'
            ? { style: {} }
            : { setAttribute() {}, style: {} }
      });
    }
    return elements.get(id);
  };

  renderCharts([
    { t: 2_000, sh: 60, st: 20, he: 65, te: 10 },
    { t: 1_000, sh: 50, st: 19, he: 60, te: 9 }
  ], null, get);

  const pathData = elements.get('chartRH').innerHTML.match(/<path d="([^"]+)"/)?.[1];
  assert.ok(pathData?.startsWith('M48.0 '));
  assert.match(pathData, /L688\.0 /);
});
