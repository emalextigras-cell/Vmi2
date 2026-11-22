/**
 * Coque mobile VMI : navigation par onglets et synthèse d'accueil.
 * Déplace les panneaux existants sans recréer leurs contrôles ni perdre leurs identifiants.
 */
const main = document.querySelector('main');
if (main) {
  main.querySelector('.main-nav')?.remove();
  const byId = id => main.querySelector('#' + id);
  const detailsBySummary = phrase => children.find(node =>
    node.tagName === 'DETAILS' && node.querySelector(':scope > summary')?.textContent.includes(phrase)
  );

  const home = document.createElement('section');
  home.id = 'tab-home';
  home.className = 'tab-panel';
  home.setAttribute('aria-label', 'Accueil');

  const history = document.createElement('section');
  history.id = 'tab-history';
  history.className = 'tab-panel';
  history.setAttribute('aria-label', 'Historique');

  const settings = document.createElement('section');
  settings.id = 'tab-settings';
  settings.className = 'tab-panel';
  settings.setAttribute('aria-label', 'Réglages');

  const tools = document.createElement('section');
  tools.id = 'tab-tools';
  tools.className = 'tab-panel';
  tools.setAttribute('aria-label', 'Outils');

  const intro = byId('accueil');
  const errorBanner = byId('errBanner');
  const live = detailsBySummary('Mesures en direct');
  const commands = detailsBySummary('État de la VMI');
  const connection = byId('reglages');
  const diagnosis = byId('technicalDiagnostic');
  const analyses = byId('analyses');
  const comparison = detailsBySummary('Comparaison des modes');
  const historyPanel = byId('historique');
  const advanced = byId('advancedTools');
  const footer = main.querySelector(':scope > footer');

  const append = (target, ...nodes) => nodes.filter(Boolean).forEach(node => target.append(node));
  append(home, intro, errorBanner, live, commands, analyses, comparison);
  append(history, historyPanel);
  append(settings, connection);
  if (connection) connection.open = true;
  append(tools, diagnosis, advanced, footer);

  // La protection et les rappels de sauvegarde sont des outils, pas des éléments de consultation.
  if (historyPanel && advanced) {
    ['storageProtection', 'backupReminder', 'backupReminderExport'].forEach(id => {
      const node = byId(id);
      if (node) advanced.insertBefore(node, advanced.querySelector('details') || null);
    });
  }

  // Déplace les commandes de vitesse existantes : leurs handlers métier seront attachés par app.js.
  const speedButtons = commands ? Array.from(commands.querySelectorAll('[data-r="24"]')) : [];
  const speedRow = speedButtons[0]?.parentElement;
  const hero = document.createElement('section');
  hero.className = 'home-hero';
  hero.setAttribute('aria-labelledby', 'homeVerdict');
  hero.innerHTML = `
    <div class="home-connection"><span class="connection-indicator" aria-hidden="true"></span><span id="homeConnection">Connexion en attente</span></div>
    <div class="home-humidity-wrap" data-level="unknown">
      <div class="home-humidity-label">Humidité du salon</div>
      <div class="home-humidity"><span id="homeHumidity">–</span><span class="home-percent">%</span></div>
      <p id="homeVerdict" class="home-verdict" role="status" aria-live="polite">En attente des mesures</p>
    </div>
    <div class="home-quick-stats">
      <div><span>Vitesse actuelle</span><strong id="homeSpeed">–</strong></div>
      <div><span>Température salon</span><strong id="homeTemperature">–</strong></div>
    </div>
    <div class="home-speed-control">
      <div class="home-speed-heading">Commande manuelle de vitesse</div>
      <div class="segmented-speed" id="homeSpeedControl" role="group" aria-label="Choisir la vitesse de ventilation"></div>
    </div>
    <p class="home-safety-note">La vitesse affichée est l’état reçu de la VMI. Une commande n’est envoyée qu’après ton appui.</p>
  `;
  if (intro) intro.prepend(hero);
  const speedControl = hero.querySelector('#homeSpeedControl');
  speedButtons.forEach((button, index) => {
    button.classList.remove('outline');
    button.classList.add('speed-choice');
    button.setAttribute('aria-label', 'Régler la vitesse ' + (index + 1));
    button.setAttribute('aria-pressed', 'false');
    speedControl.append(button);
  });
  if (speedRow && !speedRow.querySelector('button')) speedRow.remove();

  // Les réglages d'analyse sont accessibles dans Réglages, sans dupliquer leurs champs.
  const legacyPeriodRow = historyPanel?.querySelector('[data-days]')?.closest('.row');
  if (legacyPeriodRow) legacyPeriodRow.remove();
  const selectedDayRow = historyPanel?.querySelector('#dayPicker')?.closest('.row');
  if (selectedDayRow) {
    const filterDetails = document.createElement('details');
    filterDetails.className = 'history-filter';
    filterDetails.innerHTML = '<summary>Filtrer un jour précis</summary>';
    filterDetails.append(selectedDayRow);
    historyPanel.insertBefore(filterDetails, historyPanel.querySelector('#historyStatus'));
  }

  const preferenceRow = comparison?.querySelector('#targetRH')?.closest('.row');
  if (preferenceRow) {
    const preferences = document.createElement('section');
    preferences.className = 'card compact preferences-card';
    preferences.innerHTML = '<h3>Préférences d’analyse</h3><p class="note">Ces paramètres modifient les analyses, pas les commandes de la VMI.</p>';
    preferences.append(preferenceRow);
    settings.append(preferences);
  }

  // Un seul emplacement graphique : les anciennes cibles restent masquées pour compatibilité DOM.
  const chartContainer = historyPanel?.querySelector('#chartRH');
  if (chartContainer) {
    const chartCard = document.createElement('section');
    chartCard.className = 'card main-chart-card';
    chartCard.innerHTML = `
      <h3>Évolution des mesures</h3>
      <div class="chart-options">
        <div class="chart-choice-group" role="group" aria-label="Courbe à afficher">
          <button type="button" data-chart-metric="humidity" aria-pressed="true">Humidité</button>
          <button type="button" data-chart-metric="temperature" aria-pressed="false">Température</button>
          <button type="button" data-chart-metric="rpm" aria-pressed="false">Régime</button>
        </div>
        <div class="chart-period-group" role="group" aria-label="Période du graphique">
          <button type="button" data-chart-period="24h" aria-pressed="false">24 h</button>
          <button type="button" data-chart-period="7d" aria-pressed="true">7 j</button>
          <button type="button" data-chart-period="30d" aria-pressed="false">30 j</button>
        </div>
      </div>
      <p class="chart-comfort-note" id="chartComfortNote">Zone de confort indicative : 40 à 60 % d’humidité relative.</p>
      <div id="chartMain" class="chart"></div>
      <p class="note">Pince avec deux doigts pour zoomer. Les interruptions de relevés restent visibles : aucune donnée n’est inventée.</p>
    `;
    chartContainer.parentElement.insertBefore(chartCard, chartContainer);
  }

  // Le vocabulaire de l'interface décrit l'air, pas le matériel interne de la sonde.
  main.querySelectorAll('span, label').forEach(node => {
    if (node.textContent.includes('Sonde résistances')) node.textContent = node.textContent.replace('Sonde résistances', 'Air chauffé');
  });
  const emptyState = historyPanel?.querySelector('#historyStatus');
  if (emptyState && !historyPanel.querySelector('#historyEmpty')) {
    const note = document.createElement('p');
    note.id = 'historyEmpty';
    note.className = 'history-empty';
    note.textContent = 'Pas encore d’historique : connecte la VMI pour le récupérer ou importe un export VMI+.';
    historyPanel.insertBefore(note, historyPanel.querySelector('#chartRH')?.parentElement || historyPanel.firstChild);
  }

  // Réorganise le DOM principal en quatre panneaux persistants.
  [home, history, settings, tools].forEach(panel => main.insertBefore(panel, main.querySelector(':scope > footer')));
  const nav = document.createElement('nav');
  nav.className = 'bottom-tabs';
  nav.setAttribute('aria-label', 'Navigation principale');
  nav.innerHTML = `
    <button type="button" data-tab="home" aria-controls="tab-home" aria-selected="true">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg><span>Accueil</span>
    </button>
    <button type="button" data-tab="history" aria-controls="tab-history" aria-selected="false">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v5h5M4 8a9 9 0 1 1-1 6M12 7v5l4 2"/></svg><span>Historique</span>
    </button>
    <button type="button" data-tab="settings" aria-controls="tab-settings" aria-selected="false">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a8 8 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a8 8 0 0 1 0 1.8Z"/></svg><span>Réglages</span>
    </button>
    <button type="button" data-tab="tools" aria-controls="tab-tools" aria-selected="false">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6a4 4 0 0 0 5 5l-8.5 8.5a2.1 2.1 0 0 1-3-3L16 8a4 4 0 0 0-2-2Z"/><path d="m5 5 4 4M4 8l4-4"/></svg><span>Outils</span>
    </button>
  `;
  main.append(nav);

  const activate = name => {
    [home, history, settings, tools].forEach(panel => {
      const active = panel.id === 'tab-' + name;
      panel.hidden = !active;
    });
    nav.querySelectorAll('[data-tab]').forEach(button => {
      button.setAttribute('aria-selected', String(button.dataset.tab === name));
    });
    document.body.dataset.activeTab = name;
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-tab]');
    if (button) activate(button.dataset.tab);
  });
  activate('home');

  // Les messages de commande deviennent des toasts courts, au-dessus de la barre d'onglets.
  const commandResult = byId('cmdResult');
  if (commandResult && typeof MutationObserver !== 'undefined') {
    commandResult.classList.add('command-toast');
    const observer = new MutationObserver(() => {
      const message = commandResult.textContent.trim();
      if (!message) return;
      commandResult.classList.add('toast-visible');
      clearTimeout(commandResult._toastTimer);
      commandResult._toastTimer = setTimeout(() => commandResult.classList.remove('toast-visible'), 3200);
    });
    observer.observe(commandResult, { childList: true, characterData: true, subtree: true });
  }
}
