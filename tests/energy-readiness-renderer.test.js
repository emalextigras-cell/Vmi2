import test from 'node:test';
import assert from 'node:assert/strict';
import { renderEnergyReadiness } from '../js/modules/energy-readiness-renderer.js';

function makeElement(tag = 'div') {
  return {
    tagName: tag.toUpperCase(), nodeType: 1, children: [], textContent: '',
    className: '', attributes: {}, style: {},
    append(...nodes) { this.children.push(...nodes); },
    prepend(...nodes) { this.children.unshift(...nodes); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    createTextNode(value) { return { nodeType: 3, textContent: String(value) }; },
    setAttribute(name, value) { this.attributes[name] = value; }
  };
}

test('le rendu énergétique construit le DOM sans innerHTML et conserve les textes comme du texte', () => {
  const container = makeElement('div');
  const documentRef = {
    getElementById: () => container,
    createElement: tag => makeElement(tag),
    createTextNode: value => ({ nodeType: 3, textContent: String(value) })
  };
  renderEnergyReadiness([{ rpm: 1200, debit: 125, volumeRaw: 250 }], { documentRef, container });

  const visit = node => [node, ...(node.children || []).flatMap(visit)];
  const all = visit(container);
  assert.ok(all.some(node => node.tagName === 'TABLE'));
  assert.ok(all.every(node => !('innerHTML' in node)));
  assert.match(container.children.map(node => node.textContent).join(' '), /Aucune mesure électrique vérifiée/);
});

test('ne plante pas si le conteneur de rendu est absent', () => {
  assert.doesNotThrow(() => renderEnergyReadiness([], {
    documentRef: { getElementById: () => null, createElement: () => makeElement() }
  }));
});
