const STORAGE_KEY = 'vmi-test-pr118-validation-v1';
const labels = {
  connect: 'Connexion Bluetooth',
  notifications: 'Notifications et mesures en direct',
  disconnect: 'Déconnexion volontaire',
  reconnect: 'Reconnexion',
  history: 'Téléchargement de l’historique',
  repeat: 'Deuxième synchronisation',
  interruption: 'Interruption de transfert (facultatif)'
};
const environment = document.querySelector('#environment');
const checks = [...document.querySelectorAll('[data-id]')];
const safeGet = key => { try { return localStorage.getItem(key); } catch { return null; } };
const safeSet = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
function loadResults() {
  try { return JSON.parse(safeGet(STORAGE_KEY) || '{}') || {}; } catch { return {}; }
}
let results = loadResults();
checks.forEach(row => {
  const select = row.querySelector('select');
  select.value = ['pending','ok','ko'].includes(results[row.dataset.id]) ? results[row.dataset.id] : 'pending';
  select.addEventListener('change', () => {
    results[row.dataset.id] = select.value;
    safeSet(STORAGE_KEY, JSON.stringify(results));
    render();
  });
});
function environmentItem(label, ok, detail) {
  const article = document.createElement('article');
  article.className = 'diagnosis-item ' + (ok ? 'diagnosis-positive' : 'diagnosis-caution');
  const tag = document.createElement('span');
  tag.className = 'diagnosis-tag';
  tag.textContent = ok ? 'Disponible' : 'À vérifier';
  const title = document.createElement('h4');
  title.textContent = label;
  const description = document.createElement('p');
  description.textContent = detail;
  article.append(tag, title, description);
  environment.append(article);
}
function checkEnvironment() {
  environment.replaceChildren();
  environmentItem('Contexte HTTPS sécurisé', window.isSecureContext === true,
    window.isSecureContext ? 'Le navigateur autorise les fonctions nécessitant un contexte sécurisé.' : 'Ouvre l’application depuis son adresse HTTPS GitHub Pages.');
  environmentItem('API Web Bluetooth', !!navigator.bluetooth,
    navigator.bluetooth ? 'Le navigateur expose Web Bluetooth. La connexion à la VMI reste à tester.' : 'Web Bluetooth indisponible dans ce navigateur ou ce contexte.');
  environmentItem('Service worker enregistré', 'serviceWorker' in navigator,
    'serviceWorker' in navigator ? 'Le navigateur prend en charge le service worker.' : 'Service worker non pris en charge.');
  environmentItem('Service worker contrôlant la page', !!navigator.serviceWorker?.controller,
    navigator.serviceWorker?.controller ? 'La page est contrôlée par le service worker.' : 'Pas encore de contrôleur : recharge la page après le premier chargement.');
  environmentItem('Navigateur', /Android/i.test(navigator.userAgent) && /Chrome\//i.test(navigator.userAgent),
    navigator.userAgent);
}
function render() {
  let ok = 0, ko = 0, pending = 0;
  for (const row of checks) {
    const value = row.querySelector('select').value;
    if (value === 'ok') ok++;
    else if (value === 'ko') ko++;
    else pending++;
  }
  document.querySelector('#passed').textContent = ok;
  document.querySelector('#failed').textContent = ko;
  document.querySelector('#pending').textContent = pending;
  const verdict = document.querySelector('#verdict');
  verdict.className = 'advice' + (ko ? ' warn' : ok === checks.length ? ' good' : '');
  verdict.textContent = ko
    ? 'Au moins un essai est en échec : ne considère pas la PR #118 comme validée. Copie le compte rendu pour analyser le problème.'
    : pending
      ? 'Validation matérielle en cours : ' + pending + ' essai(s) restent à effectuer.'
      : 'Tous les essais sélectionnés sont réussis. Cela valide uniquement ce scénario sur ce téléphone et cette VMI, pas tous les firmwares ni un fonctionnement longue durée.';
  document.querySelector('#report').textContent = buildReport();
}
function buildReport() {
  const lines = [
    'VMI Purevent — validation matérielle PR #118',
    'Date : ' + new Date().toLocaleString('fr-FR'),
    'Navigateur : ' + navigator.userAgent,
    'HTTPS sécurisé : ' + window.isSecureContext,
    'Web Bluetooth : ' + !!navigator.bluetooth,
    'Service worker contrôlant la page : ' + !!navigator.serviceWorker?.controller,
    ''
  ];
  for (const row of checks) {
    const value = row.querySelector('select').value;
    const status = value === 'ok' ? 'RÉUSSI' : value === 'ko' ? 'ÉCHEC' : 'NON TESTÉ';
    lines.push(status + ' — ' + labels[row.dataset.id]);
  }
  const ok = checks.filter(row => row.querySelector('select').value === 'ok').length;
  const ko = checks.filter(row => row.querySelector('select').value === 'ko').length;
  const pending = checks.length - ok - ko;
  lines.push('', 'Bilan : ' + ok + ' réussis, ' + ko + ' échecs, ' + pending + ' non testés.');
  lines.push('Limite : ce compte rendu est une saisie manuelle ; la page ne lit pas l’état interne de la connexion Bluetooth de l’application.');
  return lines.join('\n');
}
document.querySelector('#refreshEnvironment').addEventListener('click', checkEnvironment);
document.querySelector('#copyReport').addEventListener('click', async () => {
  const text = buildReport();
  try {
    await navigator.clipboard.writeText(text);
    document.querySelector('#verdict').textContent = 'Compte rendu copié. Tu peux le coller dans la conversation.';
  } catch {
    document.querySelector('#report').textContent = text + '\n\nCopie manuelle : sélectionne le texte ci-dessus.';
  }
});
document.querySelector('#resetChecks').addEventListener('click', () => {
  results = {};
  safeSet(STORAGE_KEY, '{}');
  checks.forEach(row => { row.querySelector('select').value = 'pending'; });
  render();
});
checkEnvironment();
render();
