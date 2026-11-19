import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderVmiAssistantView } from '../js/modules/assistant-view.js';

function makeElement() {
  return {
    className: '',
    textContent: '',
    children: [],
    replaceChildren() { this.children = []; },
    append(...items) { this.children.push(...items); }
  };
}

test('le renderer projette un résultat métier sans recalculer le diagnostic', () => {
  const elements = new Map([
    'assistantStatus', 'assistantOverview', 'assistantRecommendations',
    'assistantSections', 'assistantLimits'
  ].map(id => [id, makeElement()]));
  const documentRef = {
    getElementById: id => elements.get(id),
    createElement: () => makeElement()
  };

  renderVmiAssistantView({
    status: 'available',
    title: 'Analyse disponible',
    confidence: 'Confiance élevée',
    overview: 'Synthèse calculée en amont.',
    recommendations: [{
      priority: 'favorable',
      title: 'Surveiller',
      text: 'Texte de conseil.',
      reason: 'Mesures disponibles.'
    }],
    sections: [{
      id: 'hygrometry',
      title: 'Hygrométrie',
      status: 'disponible',
      summary: 'Résumé.',
      details: ['Détail 1']
    }],
    limits: ['Limite 1']
  }, { documentRef });

  assert.equal(elements.get('assistantStatus').className, 'advice good');
  assert.match(elements.get('assistantStatus').textContent, /Analyse disponible/);
  assert.equal(elements.get('assistantOverview').textContent, 'Synthèse calculée en amont.');
  assert.equal(elements.get('assistantRecommendations').children.length, 1);
  assert.equal(elements.get('assistantSections').children.length, 1);
  assert.equal(elements.get('assistantLimits').children.length, 1);
});

test('les modules de calcul et de décodage restent indépendants du DOM et des API matérielles', async () => {
  const paths = [
    'js/modules/analysis.js',
    'js/modules/psychrometry.js',
    'js/modules/bluetooth-protocol.js',
    'js/modules/bluetooth-decoder.js'
  ];
  for (const path of paths) {
    const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
    // Les mots présents dans la documentation JSDoc ne sont pas des dépendances d’exécution.
    const executableSource = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    // Vérifie les accès effectifs aux API, pas les mots utilisés dans les chaînes métier.
    assert.doesNotMatch(executableSource, /\b(?:document|window|navigator|indexedDB|localStorage)\s*(?:\.|\[)/,
      path + ' ne doit pas accéder au DOM, au stockage ou aux API navigateur matérielles');
  }
});

test('le renderer de l’assistant ne dépend ni du calcul métier ni du transport Bluetooth', async () => {
  const source = await readFile(new URL('../js/modules/assistant-view.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /assistant-summary|bluetooth-|indexedDB|localStorage|navigator/);
});
