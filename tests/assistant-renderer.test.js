import test from 'node:test';
import assert from 'node:assert/strict';
import { renderVmiAssistant } from '../js/modules/assistant-renderer.js';

function makeElement() {
  return {
    className: '',
    textContent: '',
    children: [],
    replaceChildren() { this.children = []; },
    append(...items) { this.children.push(...items); }
  };
}

test('ne modifie rien lorsque les éléments de l’assistant sont absents', () => {
  assert.doesNotThrow(() => renderVmiAssistant([], {
    documentRef: { getElementById: () => null }
  }));
});

test('affiche un état explicite lorsque l’historique est vide', () => {
  const elements = new Map([
    'assistantStatus', 'assistantOverview', 'assistantRecommendations',
    'assistantSections', 'assistantLimits'
  ].map(id => [id, makeElement()]));
  const documentRef = {
    getElementById: id => elements.get(id),
    createElement: () => makeElement()
  };

  renderVmiAssistant([], { documentRef });

  assert.match(elements.get('assistantStatus').textContent, /aucun|historique|donnée/i);
  assert.ok(elements.get('assistantRecommendations').children.length > 0);
});


test('affiche une synthèse normale avec un historique non vide', () => {
  const elements = new Map([
    'assistantStatus', 'assistantOverview', 'assistantRecommendations',
    'assistantSections', 'assistantLimits'
  ].map(id => [id, makeElement()]));
  const documentRef = {
    getElementById: id => elements.get(id),
    createElement: () => makeElement()
  };
  const start = Date.UTC(2026, 0, 1, 8);
  const history = Array.from({ length: 12 }, (_, index) => ({
    t: start + index * 60 * 60 * 1000,
    st: 20,
    sh: 50,
    te: 10,
    he: 60,
    rpm: 1200,
    mode: 2
  }));

  assert.doesNotThrow(() => renderVmiAssistant(history, { documentRef }));
  assert.match(elements.get('assistantStatus').textContent, /Analyse|partielle/i);
  assert.notEqual(elements.get('assistantOverview').textContent, '');
});

test('affiche une erreur de synthèse et transmet le message à onError', () => {
  const elements = new Map([
    'assistantStatus', 'assistantOverview', 'assistantRecommendations',
    'assistantSections', 'assistantLimits'
  ].map(id => [id, makeElement()]));
  const documentRef = {
    getElementById: id => elements.get(id),
    createElement: () => makeElement()
  };
  const brokenHistory = new Proxy([], {
    get(target, property, receiver) {
      if (property === 'length') throw new Error('historique indisponible');
      return Reflect.get(target, property, receiver);
    }
  });
  const errors = [];

  renderVmiAssistant(brokenHistory, {
    documentRef,
    onError: message => errors.push(message)
  });

  assert.match(elements.get('assistantStatus').textContent, /n’a pas pu terminer/i);
  assert.match(elements.get('assistantOverview').textContent, /historique indisponible/);
  assert.deepEqual(errors, ['Assistant VMI : historique indisponible']);
});
