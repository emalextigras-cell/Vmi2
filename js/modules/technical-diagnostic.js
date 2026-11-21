/**
 * Présentation du diagnostic technique Purevent à partir de l'état BLE connu.
 * Aucune valeur n'est déduite lorsqu'un champ manque ; la fraîcheur est indépendante
 * de la valeur afin de conserver les zéros valides et de signaler les anciennes sessions.
 */

const VALUE_DEFINITIONS = [
  ['jours', 'Jours de fonctionnement', value => `${value} j`],
  ['filtre', 'Autonomie du filtre', value => `${value} j`],
  ['vol', 'Volume à ventiler', value => `${value} m³`],
  ['vit', 'Vitesse (niveau affiché)', value => String(value)],
  ['boost', 'Boost', value => value ? 'Actif' : 'Arrêté'],
  ['holidayDays', 'Vacances restantes', value => `${value} j`],
  ['surventilation', 'Surventilation', value => value ? 'Active' : 'Arrêtée'],
  ['preheatOn', 'Préchauffage', value => value ? 'En marche' : 'Arrêté'],
  ['preheatSetpoint', 'Consigne préchauffage', value => value > 0 ? `${value} °C` : 'Aucune'],
  ['summerLimit', 'Limite estivale', value => `${value} °C`],
  ['fixedAirflow', 'Débit fixe', value => value ? 'Actif' : 'Inactif'],
  ['airChangesPerHour', 'Renouvellement', value => `${value.toFixed(3)} vol/h`],
  ['airflowM3h', 'Débit théorique estimé', value => `${value} m³/h`]
];

/**
 * Produit un instantané d'affichage sans mutation des mesures.
 * @param {{cur?:Object,lastSeen?:Object,connected?:boolean,now?:number,maxAgeMs?:number}} input
 * @returns {{status:string,statusLabel:string,freshness:string,items:Array<{key:string,label:string,value:string,status:string,ageLabel:string}>}}
 */
export function buildTechnicalDiagnosticSnapshot({
  cur = {}, lastSeen = {}, connected = false, now = Date.now(), maxAgeMs = 35000
} = {}) {
  const receivedAt = Number.isFinite(lastSeen.state) ? lastSeen.state : 0;
  const ageMs = receivedAt > 0 ? Math.max(0, now - receivedAt) : null;
  const hasStateValues = VALUE_DEFINITIONS.some(([key]) => cur[key] !== undefined && cur[key] !== null);
  const status = !hasStateValues ? 'missing'
    : ageMs === null || ageMs > maxAgeMs || !connected ? 'stale' : 'fresh';
  const ageLabel = ageMs === null ? 'Date de réception inconnue'
    : ageMs < 1000 ? 'à l’instant'
      : ageMs < 60000 ? `il y a ${Math.round(ageMs / 1000)} s`
        : `il y a ${Math.round(ageMs / 60000)} min`;
  const freshness = status === 'missing'
    ? 'Aucune donnée d’état disponible dans cette session.'
    : status === 'fresh'
      ? `Trame d’état reçue ${ageLabel} · liaison active.`
      : `${connected ? 'Données périmées' : 'Hors connexion · données périmées'} · ${ageLabel}.`;
  const items = VALUE_DEFINITIONS.map(([key, label, format]) => {
    const value = cur[key];
    const valid = typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
    return {
      key, label,
      value: valid ? format(value) : 'Non disponible',
      status: valid ? status : 'missing',
      ageLabel: valid ? ageLabel : 'Aucune valeur reçue'
    };
  });
  return {
    status,
    statusLabel: status === 'fresh' ? 'À jour' : status === 'stale' ? 'Périmé' : 'Non disponible',
    freshness,
    items
  };
}

/**
 * Rend le diagnostic sans interpréter les valeurs ni injecter de HTML dynamique.
 * @param {HTMLElement|null} container
 * @param {{cur?:Object,lastSeen?:Object,connected?:boolean,now?:number,maxAgeMs?:number}} input
 */
export function renderTechnicalDiagnostic(container, input = {}) {
  if (!container) return;
  const snapshot = buildTechnicalDiagnosticSnapshot(input);
  const documentRef = container.ownerDocument || document;
  const status = container.querySelector('#technicalDiagnosticStatus');
  const freshness = container.querySelector('#technicalDiagnosticFreshness');
  const values = container.querySelector('#technicalDiagnosticValues');
  container.dataset.freshness = snapshot.status;
  if (status) status.textContent = snapshot.statusLabel;
  if (freshness) freshness.textContent = snapshot.freshness;
  if (!values) return;
  values.replaceChildren();
  for (const item of snapshot.items) {
    const term = documentRef.createElement('dt');
    term.textContent = item.label;
    const definition = documentRef.createElement('dd');
    definition.textContent = item.value;
    const detail = documentRef.createElement('small');
    detail.textContent = item.ageLabel;
    definition.append(detail);
    values.append(term, definition);
  }
}
