import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveMeasurementFilters } from '../js/modules/measurement-filter.js';

test('attend une seconde mesure cohérente au démarrage du flux', () => {
  const filters = createLiveMeasurementFilters();
  assert.deepEqual(filters.filter('sal_t', 20), { value: null, status: 'pending' });
  assert.deepEqual(filters.filter('sal_t', 20.5), { value: 20.5, status: 'accepted' });
});

test('un saut de température est retenu seulement si la mesure suivante le confirme', () => {
  const filters = createLiveMeasurementFilters();
  filters.filter('sal_t', 20);
  filters.filter('sal_t', 20);
  assert.deepEqual(filters.filter('sal_t', 35), { value: 20, status: 'pending' });
  assert.deepEqual(filters.filter('sal_t', 35.5), { value: 35.5, status: 'accepted' });
});

test('un retour à la valeur stable annule un candidat isolé', () => {
  const filters = createLiveMeasurementFilters();
  filters.filter('sal_t', 20);
  filters.filter('sal_t', 20);
  assert.deepEqual(filters.filter('sal_t', 35), { value: 20, status: 'pending' });
  assert.deepEqual(filters.filter('sal_t', 20.5), { value: 20.5, status: 'accepted' });
});

test('un saut d’humidité supérieur à 30 points attend une confirmation', () => {
  const filters = createLiveMeasurementFilters();
  filters.filter('sal_h', 50);
  filters.filter('sal_h', 51);
  assert.deepEqual(filters.filter('sal_h', 90), { value: 51, status: 'pending' });
  assert.deepEqual(filters.filter('sal_h', 91), { value: 91, status: 'accepted' });
});

test('une valeur hors plage conserve la dernière mesure puis la perd après trois rejets', () => {
  const filters = createLiveMeasurementFilters();
  filters.filter('s2_t', 12);
  filters.filter('s2_t', 12);
  assert.deepEqual(filters.filter('s2_t', 255), { value: 12, status: 'invalid' });
  assert.deepEqual(filters.filter('s2_t', 255), { value: 12, status: 'invalid' });
  assert.deepEqual(filters.filter('s2_t', 255), { value: null, status: 'unavailable' });
});

test('les filtres sont indépendants par capteur', () => {
  const filters = createLiveMeasurementFilters();
  filters.filter('sal_t', 20);
  filters.filter('sal_t', 20);
  filters.filter('s2_t', 12);
  filters.filter('s2_t', 12);
  assert.equal(filters.filter('sal_t', 21).value, 21);
  assert.equal(filters.filter('s2_t', 12.5).value, 12.5);
});

test('un emplacement de sonde vide et une reconnexion peuvent réinitialiser les filtres', () => {
  const filters = createLiveMeasurementFilters();
  filters.filter('s1_t', 12);
  filters.filter('s1_t', 12);
  filters.reset('s1_t');
  assert.deepEqual(filters.filter('s1_t', 30), { value: null, status: 'pending' });
  filters.resetAll();
  assert.deepEqual(filters.filter('s1_t', 30), { value: null, status: 'pending' });
});

test('refuse une configuration invalide du nombre de rejets', () => {
  for (const maxInvalidReadings of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => createLiveMeasurementFilters({ maxInvalidReadings }), RangeError);
  }
});
