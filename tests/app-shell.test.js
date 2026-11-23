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
  const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
  return files.flat().map(file => './' + path.relative(repositoryRoot, file).split(path.sep).join('/')).sort();
}

test('APP_SHELL contient tous les fichiers JavaScript de js/ et aucun outil de validation', async () => {
  const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const core = await readFile(new URL('../js/modules/core.js', import.meta.url), 'utf8');
  const start = serviceWorker.indexOf('const APP_SHELL = [');
  const end = serviceWorker.indexOf('\n];', start);
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
  const versionLine = core.split('\n').find(line => line.startsWith('export const APP_VERSION = '));
  const appVersion = versionLine?.split("'")[1];
  assert.ok(appVersion, 'APP_VERSION introuvable dans core.js');
  assert.ok(serviceWorker.includes(`const CACHE_NAME = 'vmi-test-v${appVersion}-cache-`), 'Le cache du service worker doit utiliser la même version applicative');
});


test('les commandes avancées non validées restent masquées et bloquées à l’exécution', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="unverifiedAdvancedCommands"/);
  assert.match(html, /<div hidden aria-hidden="true">[\s\S]*data-advanced="preheatPower"[^>]*disabled/);
  assert.match(html, /Commandes masquées par précaution[\s\S]*capturer chaque action dans l’application officielle VMI\+ avant toute réactivation/);
  assert.match(app, /const ADVANCED_COMMANDS_ENABLED = false;/);
  assert.match(app, /if\(!ADVANCED_COMMANDS_ENABLED\)[\s\S]*Commande avancée bloquée/);
});


test('la navigation expose les données et les aides au réglage sans déplacer le bloc de supervision', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const nav = html.slice(html.indexOf('<nav class="main-nav"'), html.indexOf('</nav>'));
  assert.match(nav, /href="#donnees">Données/);
  assert.match(nav, /href="#reglages">Réglages Bluetooth/);
  const liveMeasurements = html.indexOf('<details class="card compact"><summary>Mesures en direct</summary>');
  const dataSection = html.indexOf('id="donnees"');
  assert.ok(liveMeasurements > -1 && dataSection > liveMeasurements, 'Le bloc de mesures existant reste avant les nouvelles rubriques');
  assert.match(html, /id="energyEstimateCard"/);
  assert.match(html, /<summary>Aide hygrométrique<\/summary>/);
  assert.match(html, /<summary>Aide thermique et saisonnière<\/summary>/);
  for (const id of ['fanEnergyEstimate','fanEnergyByMode','dailyEnergyClimateContext','weeklyDiagnostic','targetRH','minSamples','seasonalAdvice','speedAnalysis','energyReadiness']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'Identifiant fonctionnel conservé : ' + id);
  }
});


test('les informations énergétiques sont regroupées dans Données', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const dataStart = html.indexOf('id="donnees"');
  const dataEnd = html.indexOf('id="historique"');
  const settingsStart = html.indexOf('id="reglageAides"');
  const settingsEnd = html.indexOf('id="donnees"');
  assert.ok(dataStart > -1 && dataEnd > dataStart);
  const dataMarkup = html.slice(dataStart, dataEnd);
  const settingsMarkup = html.slice(settingsStart, settingsEnd);
  assert.match(dataMarkup, /id="energyEstimateCard"/);
  assert.match(dataMarkup, /id="energyReadiness"/);
  assert.doesNotMatch(settingsMarkup, /id="energyReadiness"/);
});
