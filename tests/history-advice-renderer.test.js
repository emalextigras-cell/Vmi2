import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHistoryFreshness, renderRecommendation, renderSeasonalAdvice } from '../js/modules/history-advice-renderer.js';

function element() { return { className: '', textContent: '', innerHTML: '' }; }
const format = value => Number(value).toFixed(1);
const formatShort = value => new Date(value).toISOString();

test('fraîcheur : signale un historique vide', () => {
  const container = element();
  renderHistoryFreshness({ container, history: [], metadata: {}, now: 1000, dayMs: 86400000, minValid: 0, formatShort });
  assert.equal(container.className, 'advice');
  assert.match(container.textContent, /Aucun historique mémorisé/);
});

test('fraîcheur : affiche la dernière date et la dernière synchronisation', () => {
  const container = element(), newest = Date.UTC(2026, 0, 10);
  renderHistoryFreshness({ container, history: [{ t: newest }, { t: newest + 3600000 }], metadata: { lastSync: newest + 7200000 }, now: newest + 3600000, dayMs: 86400000, minValid: 0, formatShort });
  assert.match(container.textContent, /Historique à jour/);
  assert.match(container.textContent, /Dernière synchronisation/);
});

test('conseil saisonnier : affiche le message d’attente', () => {
  const container = element();
  renderSeasonalAdvice([], { container, analyzeSeasonalVentilation: () => ({ status: 'insufficient', advice: 'Données insuffisantes.' }), format, formatShort });
  assert.equal(container.textContent, 'Données insuffisantes.');
});

test('recommandation : n’encourage pas une hausse sans mesures valides', () => {
  const container = element();
  renderRecommendation([], { container, targetRH: 50, median: values => values[0], absoluteHumidity: () => 0, isPlausibleTemperature: () => true, isPlausibleHumidity: () => true, format });
  assert.match(container.textContent, /Pas assez de données historiques valides/);
});

test('recommandation : contextualise une humidité élevée et un air entrant plus sec', () => {
  const container = element();
  renderRecommendation([{ st: 20, sh: 70, te: 10, he: 50 }], { container, targetRH: 50, median: values => values[0], absoluteHumidity: (temperature) => temperature === 20 ? 12 : 5, isPlausibleTemperature: () => true, isPlausibleHumidity: () => true, format });
  assert.match(container.textContent, /au-dessus de ton objectif/);
  assert.match(container.textContent, /potentiel d'assèchement/);
});
