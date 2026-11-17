import test from 'node:test';
import assert from 'node:assert/strict';
import { formatWeather, requestCurrentWeather, weatherLabel, weatherUrl } from '../js/modules/weather.js';

test('traduit les codes météo courants', () => {
  assert.equal(weatherLabel(0), 'Ciel dégagé');
  assert.equal(weatherLabel(61), 'Pluie faible');
  assert.equal(weatherLabel(999), 'Conditions inconnues');
});

test('construit une URL météo sans exposer de clé API', () => {
  const url = new URL(weatherUrl(48.1, -1.6));
  assert.equal(url.hostname, 'api.open-meteo.com');
  assert.equal(url.searchParams.get('latitude'), '48.1');
  assert.equal(url.searchParams.get('longitude'), '-1.6');
  assert.equal(url.searchParams.has('apikey'), false);
});

test('normalise la réponse actuelle Open-Meteo', () => {
  assert.deepEqual(formatWeather({
    timezone: 'Europe/Paris',
    current: { temperature_2m: 12.3, relative_humidity_2m: 78, apparent_temperature: 11.2, precipitation: 0.4, wind_speed_10m: 18, weather_code: 3, time: '2026-11-17T14:00' }
  }), {
    temperature: 12.3, apparentTemperature: 11.2, humidity: 78, precipitation: 0.4,
    wind: 18, code: 3, label: 'Couvert', time: '2026-11-17T14:00', timezone: 'Europe/Paris'
  });
});

test('refuse une position invalide et signale une réponse HTTP en erreur', async () => {
  await assert.rejects(requestCurrentWeather({ coords: { latitude: NaN, longitude: 1 } }, () => Promise.resolve()), /Position GPS invalide/);
  await assert.rejects(requestCurrentWeather({ latitude: 48, longitude: 1 }, () => Promise.resolve({ ok: false })), /Service météo indisponible/);
});
