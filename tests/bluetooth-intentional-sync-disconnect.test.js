import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../js/modules/bluetooth-runtime.js', import.meta.url), 'utf8');
const service = await readFile(new URL('../js/modules/bluetooth-service.js', import.meta.url), 'utf8');

test('la fin de synchronisation marque la déconnexion comme volontaire avant disconnect()', () => {
  const finish = source.slice(source.indexOf('function finishDownload('), source.indexOf('async function startDownload('));
  assert.match(finish, /if\(completeBoundary&&connected\(\)\)bluetoothService\.disconnectIntentional\(\);/);
});

test('onDisconnect absorbe une déconnexion volontaire sans programmer de reconnexion', () => {
  const handler = service.slice(service.indexOf('function onDisconnect()'), service.indexOf('async function reconnect()'));
  assert.match(handler, /const wasIntentional\\s*=\\s*intentionalDisconnect;/);
  assert.match(handler, /intentionalDisconnect\\s*=\\s*false;/);
  assert.match(handler, /if\(wasIntentional\)\{setStatus\('Synchronisation terminée\. Bluetooth déconnecté\.'\);return\}/);
  assert.ok(handler.indexOf('if (wasIntentional)') < handler.indexOf('setTimeoutFn(reconnect, 4000)'));
});

test('une reconnexion ne réinitialise pas la synchronisation automatique', () => {
  const connect = service.slice(service.indexOf('async function connectDevice('), service.indexOf('function onDisconnect()'));
  assert.doesNotMatch(connect, /autoHistoryDone=false/);
  assert.match(connect, /!autoHistoryDone/);
  assert.match(connect, /autoHistoryDone=true/);
});

test('un nouveau clic utilisateur autorise une nouvelle synchronisation initiale', () => {
  const connect = service.slice(service.indexOf('async function connectBLE('), service.indexOf('async function autoConnectAuthorizedDevice('));
  assert.match(connect, /autoHistoryDone=false/);
});

test('une ligne historique rejetée empêche de certifier le transfert comme complet', () => {
  const finish = source.slice(source.indexOf('function finishDownload('), source.indexOf('async function startDownload('));
  assert.match(finish, /const complete=[^;]*invalidRows/);
});

test('signale les lignes rejetées au lieu d’annoncer un historique à jour', () => {
  const finish = source.slice(source.indexOf('function finishDownload('), source.indexOf('async function startDownload('));
  assert.match(finish, /download\.invalidRows\s*>\s*0\s*\?/);
  assert.match(finish, /lignes rejetées/);
});

test('sépare les lignes historiques sur CR et LF du flux VMI+', () => {
  assert.match(runtime, /download\.buf\.split\(\/\\r\\n\|\\n\|\\r\(\?!\$\)\/\)/);
});

test('ignore le préambule et l’en-tête VMI+ avant les lignes de relevés', () => {
  const parser = source.slice(source.indexOf('function parseDownloadLine('), source.indexOf('function armTimer('));
  assert.match(parser, /download\.dataStarted/);
  assert.match(parser, /Date;Event;/);
});
