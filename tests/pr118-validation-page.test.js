import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('la page de validation PR118 est accessible depuis l’application', async () => {
  const html = await readFile(new URL('./validation-pr118.html', import.meta.url), 'utf8');
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(index.includes('href="tests/validation-pr118.html">Test PR #118'));
  assert.ok(html.includes('validation-pr118.js'));
  assert.match(html, /Téléchargement de l'historique/);
  assert.match(html, /Interruption de transfert/);
  assert.match(html, /ne change ni la vitesse, ni Boost, ni le mode vacances/);
});

test('la page, son script et son style sont préchargés par le service worker', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'./tests/validation-pr118.html'"));
  assert.ok(sw.includes("'./tests/validation-pr118.js'"));
  assert.ok(sw.includes("'./tests/test-environment.css'"));
  assert.match(sw, /vmi-test-v14-cache-39/);
});
