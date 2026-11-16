import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('la page de validation PR118 est accessible depuis l’application', async () => {
  const html = await readFile(new URL('./tests/validation-pr118.html', import.meta.url), 'utf8');
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(index, /href="tests/validation-pr118\.html">Test PR #118/);
  assert.match(html, /validation-pr118\.js/);
  assert.match(html, /Téléchargement de l'historique/);
  assert.match(html, /Interruption de transfert/);
  assert.match(html, /ne change ni la vitesse, ni Boost, ni le mode vacances/);
});

test('la page et son script sont préchargés par le service worker', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'./validation-pr118.html'"));
  assert.ok(sw.includes("'./tests/validation-pr118.js'"));
  assert.match(sw, /vmi-test-v14-cache-39/);
});
