import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCharts, resetChartViews } from '../js/modules/charts.js';

test('charts.js expose les deux fonctions publiques du moteur graphique', () => {
  assert.equal(typeof renderCharts, 'function');
  assert.equal(typeof resetChartViews, 'function');
});

test('renderCharts accepte un historique vide sans DOM graphique complexe', () => {
  const ids = [
    'chartRH', 'chartVmiAbs', 'chartHA',
    'chartTemp', 'chartRPM', 'chartDebit'
  ];
  const elements = new Map(ids.map(id => [id, { innerHTML: '' }]));

  assert.doesNotThrow(() => renderCharts([], null, id => elements.get(id)));
  for (const element of elements.values()) {
    assert.match(element.innerHTML, /Pas de données disponibles/);
  }
  assert.doesNotThrow(() => resetChartViews());
});

