import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

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
  const match = serviceWorker.match(/const APP_SHELL = \\[([\\s\\S]*?)\\n\\];/);
  assert.ok(match, 'Déclaration APP_SHELL introuvable dans sw.js');
  const cachedFiles = [...match[1].matchAll(/['"](\\.\\/js\\/[^'"]+\\.js)['"]/g)].map(item => item[1]).sort();
  const sourceFiles = await listJavaScriptFiles(new URL('../js/', import.meta.url).pathname);
  assert.deepEqual(cachedFiles, sourceFiles, 'APP_SHELL doit correspondre exactement aux fichiers JavaScript de js/');
  assert.doesNotMatch(match[1], /\\.\\/tests\\//, 'Les pages de test ne doivent pas être dans le cache de production');
});
