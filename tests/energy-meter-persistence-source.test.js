import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('les anciens index électriques restent conservés sans interface de saisie', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

  // L'interface de saisie et son rendu ont été retirés.
  assert.doesNotMatch(source, /energyMeterForm|energyMeterHistory|renderEnergyMeterTracking|localDateTimeValue/);

  // Les relevés déjà stockés restent chargés, exportés et restaurables.
  assert.match(source, /dbGet\('energyReadings'\)/);
  assert.match(source, /createBackupSnapshot\(\{hist,live,meta,energyReadings\}\)/);
  assert.match(source, /currentEnergyReadings:energyReadings/);
  assert.match(source, /\['energyReadings',result\.energyReadings\]/);
});
