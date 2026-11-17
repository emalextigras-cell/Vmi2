/** Météo actuelle facultative, sans clé API et sans blocage de l'application. */

const WEATHER_LABELS = new Map([
  [0, 'Ciel dégagé'], [1, 'Plutôt dégagé'], [2, 'Partiellement nuageux'], [3, 'Couvert'],
  [45, 'Brouillard'], [48, 'Brouillard givrant'], [51, 'Bruine légère'], [53, 'Bruine'],
  [55, 'Bruine forte'], [61, 'Pluie faible'], [63, 'Pluie'], [65, 'Pluie forte'],
  [71, 'Neige faible'], [73, 'Neige'], [75, 'Neige forte'], [80, 'Averses faibles'],
  [81, 'Averses'], [82, 'Averses fortes'], [95, 'Orage'], [96, 'Orage avec grêle'],
  [99, 'Orage avec forte grêle']
]);

export function weatherLabel(code) {
  return WEATHER_LABELS.get(Number(code)) || 'Conditions inconnues';
}

export function weatherUrl(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude), timezone: 'auto',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code'
  });
  return 'https://api.open-meteo.com/v1/forecast?' + params;
}

export function formatWeather(data) {
  const current = data?.current;
  if (!current) throw new Error('Réponse météo incomplète');
  return {
    temperature: Number(current.temperature_2m),
    apparentTemperature: Number(current.apparent_temperature),
    humidity: Number(current.relative_humidity_2m),
    precipitation: Number(current.precipitation),
    wind: Number(current.wind_speed_10m),
    code: Number(current.weather_code),
    label: weatherLabel(current.weather_code),
    time: current.time,
    timezone: data.timezone || 'auto'
  };
}

export function requestCurrentWeather(position, fetcher = fetch) {
  const { latitude, longitude } = position.coords || position;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return Promise.reject(new Error('Position GPS invalide'));
  }
  return fetcher(weatherUrl(latitude, longitude)).then(response => {
    if (!response.ok) throw new Error('Service météo indisponible');
    return response.json();
  }).then(formatWeather);
}

export function setupWeather({ button, status, output }) {
  const safe = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const render = weather => {
    output.innerHTML = '<div class="grid weather-grid">' +
      `<div class="metric"><b>${safe(weather.temperature.toFixed(1))} °C</b><span>Température extérieure</span></div>` +
      `<div class="metric"><b>${safe(weather.humidity)} %</b><span>Humidité extérieure</span></div>` +
      `<div class="metric"><b>${safe(weather.wind.toFixed(0))} km/h</b><span>Vent</span></div>` +
      `<div class="metric"><b>${safe(weather.precipitation.toFixed(1))} mm</b><span>Précipitations actuelles</span></div>` +
      '</div>' + `<p class="note">${safe(weather.label)} · ressenti ${safe(weather.apparentTemperature.toFixed(1))} °C · mise à jour ${safe(weather.time)} (${safe(weather.timezone)})</p>`;
  };
  button.addEventListener('click', () => {
    if (!navigator.geolocation) { status.textContent = 'La géolocalisation est indisponible dans ce navigateur.'; return; }
    button.disabled = true;
    status.textContent = 'Demande de position…';
    navigator.geolocation.getCurrentPosition(position => {
      status.textContent = 'Récupération de la météo…';
      requestCurrentWeather(position).then(weather => { render(weather); status.textContent = 'Météo actuelle chargée.'; })
        .catch(error => { status.textContent = error.message || 'Impossible de récupérer la météo.'; })
        .finally(() => { button.disabled = false; });
    }, error => {
      status.textContent = error.code === 1 ? 'Localisation refusée : la météo reste désactivée.' : 'Position indisponible.';
      button.disabled = false;
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 900000 });
  });
}
