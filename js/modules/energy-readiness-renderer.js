import { median, summarizeEnergyReadiness, summarizeRawVmiSpeed, summarizeRawVmiMode, summarizeOperatingReference, summarizeTemperatureLimit } from './analysis.js';
import { fmt } from './date-utils.js';

function element(documentRef, tag, value, className) {
  const node = documentRef.createElement(tag);
  if (value !== undefined && value !== null) node.textContent = String(value);
  if (className) node.className = className;
  return node;
}

function appendTable(documentRef, parent, headers, rows) {
  const table = element(documentRef, 'table');
  const thead = element(documentRef, 'thead');
  const headerRow = element(documentRef, 'tr');
  headers.forEach(label => headerRow.append(element(documentRef, 'th', label)));
  thead.append(headerRow);
  const tbody = element(documentRef, 'tbody');
  rows.forEach(row => {
    const tr = element(documentRef, 'tr');
    row.forEach(value => {
      const td = element(documentRef, 'td');
      if (value && typeof value === 'object' && value.tagName === 'TD') tr.append(value);
      else {
        td.textContent = value == null ? '–' : String(value);
        tr.append(td);
      }
    });
    tbody.append(tr);
  });
  table.append(thead, tbody);
  parent.append(table);
  return table;
}

function labeledCell(documentRef, label, unit) {
  const cell = element(documentRef, 'td');
  cell.append(documentRef.createTextNode(String(label)));
  if (unit) {
    cell.append(element(documentRef, 'br'));
    cell.append(element(documentRef, 'small', unit));
  }
  return cell;
}

function appendSectionTitle(documentRef, parent, title, description) {
  parent.append(element(documentRef, 'h4', title));
  if (description) parent.append(element(documentRef, 'p', description, 'muted'));
}

function appendAdvice(documentRef, parent, value, className = 'advice') {
  parent.append(element(documentRef, 'div', value, className));
}

/**
 * Rendu DOM sûr du bilan des données énergétiques.
 * Toutes les valeurs variables sont affectées via textContent/text nodes.
 * @param {Array<object>} data
 * @param {{documentRef?: Document, container?: Element|null}} options
 */
export function renderEnergyReadiness(data, {
  documentRef = globalThis.document,
  container = documentRef?.getElementById?.('energyReadiness')
} = {}) {
  if (!documentRef || !container) return;
  const rows = Array.isArray(data) ? data : [];
  const result = summarizeEnergyReadiness(rows);
  const labels = {
    rpm: 'Régime moteur',
    debit: 'Débit VMI+ (m³/h)',
    vmiSpeedRaw: 'Code vitesse VMI+ brut',
    vmiPwmRaw: 'PWM brut',
    consDpRaw: 'Cons DP brut',
    consTmaxRaw: 'Seuil température extérieure (Cons TMax)'
  };
  container.replaceChildren();

  const fields = element(documentRef, 'section');
  appendTable(documentRef, fields,
    ['Champ exporté', 'Mesures', 'Zéros', 'Manquants', 'Minimum', 'Maximum', 'Valeurs distinctes'],
    result.fields.map(field => {
      const distinct = field.distinct.length > 8
        ? field.distinct.slice(0, 8).map(fmt).join(', ') + '…'
        : field.distinct.map(fmt).join(', ') || '–';
      const name = labeledCell(documentRef, labels[field.key] || field.label, field.unit);
      return [name, field.count, field.zeroCount, field.missingCount,
        field.min == null ? '–' : fmt(field.min),
        field.max == null ? '–' : fmt(field.max), distinct];
    }));
  container.append(fields);

  const operating = summarizeOperatingReference(rows);
  const operatingSection = element(documentRef, 'section');
  appendSectionTitle(documentRef, operatingSection,
    'Référence descriptive du fonctionnement par mode VMI+',
    'Profil calculé à partir des relevés importés, en séparant strictement le champ Mode du code Vitesse brut. Les valeurs PWM, Pression moteur et Cons DP restent des signaux bruts.');
  if (!operating.groups.length) {
    appendAdvice(documentRef, operatingSection, 'Aucune donnée Mode exploitable pour construire cette référence.');
  } else {
    const operatingRows = [];
    operating.groups.forEach(group => group.fields.forEach(field => {
      operatingRows.push([
        fmt(group.mode), group.sampleCount + ' / ' + group.dayCount,
        labeledCell(documentRef, field.label, field.unit),
        field.median == null ? '–' : fmt(field.median),
        field.min == null ? '–' : fmt(field.min) + ' – ' + fmt(field.max)
      ]);
    }));
    appendTable(documentRef, operatingSection,
      ['Mode', 'Relevés / jours', 'Variable', 'Médiane', 'Plage observée'], operatingRows);
  }
  appendAdvice(documentRef, operatingSection, operating.limits.join(' '));
  container.append(operatingSection);

  const modeGroups = summarizeRawVmiMode(rows);
  const modeSection = element(documentRef, 'section');
  appendSectionTitle(documentRef, modeSection,
    'Débit et renouvellement théorique par mode VMI+',
    'Le champ « mode » est distinct du champ « Vitesse ». La colonne « Debit » de l’export VMI+ correspond au débit d’air en m³/h. Le mode 3 dispose d’une référence distincte communiquée par l’utilisateur de 184 m³/h. Le taux de renouvellement théorique est calculé à partir du débit en m³/h et du volume du logement ; il ne mesure pas l’air effectivement distribué dans chaque pièce.');
  if (!modeGroups.length) {
    appendAdvice(documentRef, modeSection, 'Aucun mode VMI+ exploitable dans la période sélectionnée.');
  } else {
    appendTable(documentRef, modeSection,
      ['Mode VMI+', 'Relevés', 'Débit médian / référence', 'Min–max débit mesuré', 'Renouvellement théorique'],
      modeGroups.map(group => [
        fmt(group.mode), group.sampleCount,
        group.medianDebit != null ? fmt(group.medianDebit) + ' m³/h (médiane)' : group.referenceDebit != null ? fmt(group.referenceDebit) + ' m³/h (référence)' : '–',
        group.minDebit == null ? '–' : fmt(group.minDebit) + ' – ' + fmt(group.maxDebit) + ' m³/h',
        group.medianRenewalRate != null ? fmt(group.medianRenewalRate) + ' vol/h' : group.referenceRenewalRate != null ? fmt(group.referenceRenewalRate) + ' vol/h (théorique)' : '–'
      ]));
  }
  container.append(modeSection);

  const rawGroups = summarizeRawVmiSpeed(rows);
  const rawSection = element(documentRef, 'section');
  appendSectionTitle(documentRef, rawSection,
    'Débit selon le code vitesse brut VMI+',
    'Le code « Vitesse » est affiché séparément du mode. Les codes bruts ne sont pas assimilés aux niveaux manuels 1, 2 ou 3.');
  if (!rawGroups.length) {
    appendAdvice(documentRef, rawSection, 'Aucun code vitesse brut exploitable dans la période sélectionnée.');
  } else {
    appendTable(documentRef, rawSection,
      ['Code vitesse brut', 'Relevés', 'Débit médian (m³/h)', 'Minimum (m³/h)', 'Maximum (m³/h)'],
      rawGroups.map(group => [
        fmt(group.code), group.sampleCount,
        group.medianDebit == null ? '–' : fmt(group.medianDebit) + ' m³/h',
        group.minDebit == null ? '–' : fmt(group.minDebit) + ' m³/h',
        group.maxDebit == null ? '–' : fmt(group.maxDebit) + ' m³/h'
      ]));
  }
  container.append(rawSection);

  const volumes = rows.map(row => row?.volumeRaw).filter(value => Number.isFinite(value) && value > 0);
  const volumeValues = [...new Set(volumes)].sort((a, b) => a - b);
  const volumeMedian = median(volumes);
  const volumeSection = element(documentRef, 'section');
  appendSectionTitle(documentRef, volumeSection, 'Volume du logement enregistré dans la VMI+');
  if (volumeMedian == null) {
    appendAdvice(documentRef, volumeSection, 'Aucune valeur de volume (champ Vol(m³)) disponible dans cette période.');
  } else {
    const volumeText = fmt(volumeMedian) + ' m³ · ' + volumes.length + ' relevé(s) renseigné(s)' +
      (volumeValues.length > 1 ? ' · valeurs rencontrées : ' + volumeValues.map(fmt).join(', ') + ' m³' : ' · valeur constante dans les relevés') +
      '. Cette donnée correspond au volume du logement déclaré dans la VMI+, pas à un volume d’air réellement renouvelé.';
    appendAdvice(documentRef, volumeSection, volumeText);
  }
  container.append(volumeSection);

  const temperatureLimit = summarizeTemperatureLimit(rows);
  const temperatureSection = element(documentRef, 'section');
  appendSectionTitle(documentRef, temperatureSection, 'Régulation selon la température extérieure');
  if (!temperatureLimit.thresholds.length) {
    appendAdvice(documentRef, temperatureSection, 'Aucune paire de données exploitable entre le seuil Cons TMax et la température extérieure Tempext. Le réglage est conservé, mais aucune comparaison n’est possible.');
  } else {
    temperatureLimit.thresholds.forEach(item => {
      appendAdvice(documentRef, temperatureSection,
        'Seuil configuré : ' + fmt(item.threshold) + ' °C · ' + item.sampleCount +
        ' relevés avec température extérieure · ' + item.aboveThresholdCount +
        ' au-dessus du seuil · ' + item.atOrBelowThresholdCount + ' au seuil ou en dessous.');
      if (item.modes.length) {
        const cell = segment => segment.sampleCount + ' relevé(s) au total · ' + segment.dayCount + ' jour(s)';
        const paired = (group, segment) => group.comparable
          ? ' · comparaison sur ' + segment.dayCount + ' jours communs (' + segment.sampleCount +
            ' relevés) : débit ' + (segment.medianDebit == null ? '–' : fmt(segment.medianDebit) + ' m³/h') +
            ' · régime ' + (segment.medianRPM == null ? '–' : fmt(segment.medianRPM) + ' tr/min')
          : ' · comparaison non disponible (effectif ou dates communes insuffisants)';
        appendTable(documentRef, temperatureSection,
          ['Mode manuel', 'Au-dessus du seuil', 'Au seuil ou en dessous'],
          item.modes.map(group => [
            group.mode, cell(group.above) + paired(group, group.pairedAbove),
            cell(group.atOrBelow) + paired(group, group.pairedAtOrBelow)
          ]));
      } else {
        appendAdvice(documentRef, temperatureSection, 'Aucun Mode manuel 1, 2 ou 3 renseigné pour ces relevés.', 'muted');
      }
    });
  }
  appendAdvice(documentRef, temperatureSection,
    'Lecture prudente : les relevés au-dessus du seuil correspondent à des conditions où la réduction de ventilation peut s’appliquer. Une différence de débit ne démontre pas à elle seule que la régulation en est la cause. Les comparaisons sont séparées par mode et restent descriptives.');
  container.append(temperatureSection);

  const referenceSection = element(documentRef, 'section');
  appendSectionTitle(documentRef, referenceSection,
    'Repères électriques constructeur — PUREVENT',
    'Valeurs publiées par VMI pour le ventilateur selon le débit et la pression. Mesures réalisées par TÜV SÜD.');
  appendTable(documentRef, referenceSection,
    ['Débit (m³/h)', 'Pression (Pa)', 'Puissance (W)'],
    [[50, 5, 4], [125, 25, 10], [200, 64, 25], [245, 96, 39], [350, 195, 99]]);
  appendAdvice(documentRef, referenceSection,
    'La notice indique également une puissance maximale de 169 W sans préchauffage et une puissance maximale de préchauffage de 1 800 W. Ces repères ne permettent pas de reconstituer la consommation réelle de ton historique : le CSV ne fournit pas de mesure électrique vérifiée, et l’état/temps de fonctionnement du préchauffage n’est pas confirmé par les champs disponibles. Ne pas assimiler « Cons Res » à des watts.');
  const source = element(documentRef, 'p', '');
  source.className = 'note';
  source.append(documentRef.createTextNode('Source : '));
  const link = element(documentRef, 'a', 'notice officielle VMI PUREVENT, §2.2–2.3, pages 7–8');
  link.href = 'https://www.vmi-technologies.com/wp-content/uploads/2024/11/FR-VMI%C2%AE-Purevent-Notice-dinstallation-et-de-maintenance-1.pdf';
  link.target = '_blank';
  link.rel = 'noopener';
  source.append(link, documentRef.createTextNode('. Il s’agit d’une référence constructeur, pas d’une mesure de cette installation.'));
  referenceSection.append(source);
  container.append(referenceSection);

  appendAdvice(documentRef, container,
    result.message + ' Les valeurs brutes sont conservées ; aucune conversion des champs non documentés en watts, kWh ou rendement n’est appliquée. Le débit exporté VMI+ est exprimé en m³/h.');
}
