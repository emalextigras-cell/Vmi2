/**
 * Rendu de l'historique des états reçus par Bluetooth.
 * Les points représentent des trames réellement reçues. Les segments en escalier
 * ne sont tracés que lorsque deux transitions sont espacées de 2 h maximum ;
 * les interruptions plus longues restent visuellement interrompues.
 */
const MAX_GAP_MS = 2 * 60 * 60 * 1000;
const SVG_NS = 'http://www.w3.org/2000/svg';

function validRecords(records) {
  return (Array.isArray(records) ? records : [])
    .filter(record => record && Number.isFinite(record.t) &&
      Number.isFinite(record.airChangesPerHour) && record.airChangesPerHour >= 0 &&
      Number.isFinite(record.airflowM3h) && record.airflowM3h >= 0)
    .slice()
    .sort((a, b) => a.t - b.t);
}

/** Résume les transitions sans extrapoler les périodes sans trame. */
export function summarizeStateTelemetry(records, rangeDays = 30, now = Date.now()) {
  const all = validRecords(records);
  const cutoff = rangeDays > 0 ? now - rangeDays * 86400000 : -Infinity;
  const selected = all.filter(record => record.t >= cutoff && record.t <= now);
  const gaps = [];
  for (let index = 1; index < selected.length; index += 1) {
    const duration = selected[index].t - selected[index - 1].t;
    if (duration > MAX_GAP_MS) gaps.push(duration);
  }
  const stats = key => {
    const values = selected.map(record => record[key]);
    if (!values.length) return null;
    return {
      min: Math.min(...values),
      mean: values.reduce((sum, value) => sum + value, 0) / values.length,
      max: Math.max(...values)
    };
  };
  return {
    records: selected,
    count: selected.length,
    firstTimestamp: selected[0]?.t ?? null,
    lastTimestamp: selected.at(-1)?.t ?? null,
    gapCount: gaps.length,
    longestGapMs: gaps.length ? Math.max(...gaps) : 0,
    renewal: stats('airChangesPerHour'),
    airflow: stats('airflowM3h')
  };
}

function svgElement(name, attributes = {}, textContent = null) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (textContent !== null) node.textContent = textContent;
  return node;
}

function formatDate(timestamp, includeDate = true) {
  return new Date(timestamp).toLocaleString('fr-FR', includeDate
    ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { hour: '2-digit', minute: '2-digit' });
}

function renderMetricChart(container, records, key, label, unit, digits) {
  container.replaceChildren();
  if (!records.length) {
    const empty = document.createElement('p');
    empty.className = 'status';
    empty.textContent = 'Aucune trame Bluetooth reçue dans cette période. Le graphique se remplira lors des prochaines connexions à la VMI.';
    container.append(empty);
    return;
  }

  const width = 720, height = 260;
  const margin = { top: 18, right: 18, bottom: 42, left: 58 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = records.map(record => record[key]);
  const rawMin = Math.min(...values), rawMax = Math.max(...values);
  const padding = rawMin === rawMax ? Math.max(rawMax * 0.08, 0.02) : (rawMax - rawMin) * 0.12;
  const min = Math.max(0, rawMin - padding), max = rawMax + padding || 1;
  const first = records[0].t, last = records.at(-1).t;
  const x = timestamp => first === last ? margin.left + plotWidth / 2
    : margin.left + ((timestamp - first) / (last - first)) * plotWidth;
  const y = value => margin.top + ((max - value) / (max - min)) * plotHeight;
  const svg = svgElement('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `${label} selon les transitions Bluetooth réellement reçues`
  });

  for (let index = 0; index <= 4; index += 1) {
    const value = min + ((max - min) * index) / 4;
    const position = y(value);
    svg.append(svgElement('line', {
      x1: margin.left, x2: width - margin.right, y1: position, y2: position, class: 'gridline'
    }));
    svg.append(svgElement('text', {
      x: margin.left - 8, y: position + 3, 'text-anchor': 'end'
    }, value.toFixed(digits)));
  }

  let segment = '';
  records.forEach((record, index) => {
    const px = x(record.t), py = y(record[key]);
    if (index === 0) segment = `M ${px} ${py}`;
    else {
      const previous = records[index - 1];
      if (record.t - previous.t <= MAX_GAP_MS) {
        segment += ` H ${px} V ${py}`;
      } else {
        if (segment) svg.append(svgElement('path', { d: segment, class: 'telemetry-step' }));
        segment = `M ${px} ${py}`;
      }
    }
  });
  if (segment) svg.append(svgElement('path', { d: segment, class: 'telemetry-step' }));

  records.forEach(record => {
    const point = svgElement('circle', {
      cx: x(record.t), cy: y(record[key]), r: 4, class: 'telemetry-point'
    });
    point.append(svgElement('title', {}, `${formatDate(record.t)} · ${record[key].toFixed(digits)} ${unit} · vitesse brute ${record.rawSpeed}`));
    svg.append(point);
  });

  svg.append(svgElement('text', { x: margin.left, y: height - 12 }, formatDate(first)));
  svg.append(svgElement('text', {
    x: width - margin.right, y: height - 12, 'text-anchor': 'end'
  }, formatDate(last)));
  const axis = svgElement('text', {
    x: 13, y: margin.top + plotHeight / 2,
    transform: `rotate(-90 13 ${margin.top + plotHeight / 2})`,
    'text-anchor': 'middle'
  }, `${label} (${unit})`);
  svg.append(axis);
  container.append(svg);

  const stats = values.length ? {
    min: rawMin,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    max: rawMax
  } : null;
  if (stats) {
    const caption = document.createElement('p');
    caption.className = 'note telemetry-range';
    caption.textContent = `Min. ${stats.min.toFixed(digits)} · moyenne ${stats.mean.toFixed(digits)} · max. ${stats.max.toFixed(digits)} ${unit} (sur les ${values.length} états reçus)`;
    container.append(caption);
  }
}

/** Met à jour les deux courbes et les indicateurs de couverture des transitions. */
export function renderStateTelemetryChart({
  renewalContainer, airflowContainer, summaryContainer, records, rangeDays = 30, now = Date.now()
}) {
  const summary = summarizeStateTelemetry(records, rangeDays, now);
  renderMetricChart(renewalContainer, summary.records, 'airChangesPerHour', 'Renouvellement', 'vol/h', 3);
  renderMetricChart(airflowContainer, summary.records, 'airflowM3h', 'Débit théorique calculé', 'm³/h', 0);

  summaryContainer.replaceChildren();
  const items = [
    ['États reçus', String(summary.count)],
    ['Interruptions > 2 h', String(summary.gapCount)],
    ['Plus longue interruption', summary.longestGapMs ? formatDuration(summary.longestGapMs) : 'Aucune détectée'],
    ['Dernière trame', summary.lastTimestamp ? formatDate(summary.lastTimestamp) : 'Aucune']
  ];
  items.forEach(([label, value]) => {
    const item = document.createElement('div');
    item.className = 'metric';
    const strong = document.createElement('b');
    strong.textContent = value;
    const caption = document.createElement('span');
    caption.textContent = label;
    item.append(strong, caption);
    summaryContainer.append(item);
  });
  return summary;
}

function formatDuration(milliseconds) {
  const minutes = Math.round(milliseconds / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days) return `${days} j ${hours % 24} h`;
  if (hours) return `${hours} h ${minutes % 60} min`;
  return `${minutes} min`;
}
