import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
  }));
  return files.flat().map(file => './' + file.split(path.sep).join('/')).sort();
}

test('APP_SHELL contient tous les fichiers JavaScript de js/ et aucun outil de validation', async () => {
  const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const core = await readFile(new URL('../js/modules/core.js', import.meta.url), 'utf8');
  const start = serviceWorker.indexOf('const APP_SHELL = [');
  const end = serviceWorker.indexOf('\\n];', start);
  assert.notEqual(start, -1, 'Déclaration APP_SHELL introuvable dans sw.js');
  assert.notEqual(end, -1, 'Fin de la déclaration APP_SHELL introuvable dans sw.js');
  const declaration = serviceWorker.slice(start, end);
  const cachedFiles = [...declaration.matchAll(/['"]([^'"]+)['"]/g)]
    .map(item => item[1])
    .filter(file => file.startsWith('./js/') && file.endsWith('.js'))
    .sort();
  const sourceFiles = await listJavaScriptFiles(fileURLToPath(new URL('../js/', import.meta.url)));
  assert.deepEqual(cachedFiles, sourceFiles, 'APP_SHELL doit correspondre exactement aux fichiers JavaScript de js/');
  assert.ok(!declaration.includes('./tests/'), 'Les pages de test ne doivent pas être dans le cache de production');
  const versionLine = core.split('\\n').find(line => line.startsWith('export const APP_VERSION = '));
  const appVersion = versionLine?.split("'")[1];
  assert.ok(appVersion, 'APP_VERSION introuvable dans core.js');
  assert.ok(serviceWorker.includes(`const CACHE_NAME = 'vmi-test-v${appVersion}-cache-`), 'Le cache du service worker doit utiliser la même version applicative');
});
