/** @typedef {import('../types/vmi-types.js').VmiRecord} VmiRecord */
/** @typedef {import('../types/vmi-types.js').UnknownRecord} UnknownRecord */
/** @typedef {import('../types/vmi-types.js').AnalysisOptions} AnalysisOptions */

/** Analyses statistiques communes (sans effet sur les commandes VMI). */
import { absoluteHumidity, dewPoint } from './psychrometry.js';
import { detectTransientSensorSpikes, isPlaceholderSensorRecord, isPlausibleHumidity, isPlausibleTemperature } from './data-quality.js';

/** Médiane d'une liste de valeurs numériques finies.
 * @param {number[]} values Valeurs à résumer.
 * @returns {number|null} Médiane, ou null si aucune valeur numérique finie.
 */
export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  const lower = sorted[middle-1], upper = sorted[middle];
  return Math.sign(lower) === Math.sign(upper)
    ? lower + (upper - lower) / 2
    : lower / 2 + upper / 2;
}

/**
 * Compare uniquement les niveaux manuels 1/2/3 déjà identifiés dans les relevés.
 * Les valeurs brutes importées de VMI+ ne sont pas assimilées à ces niveaux.
 */
/**
 * analyzeSpeedLevels — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} data Paramètre data.
 * @param {number} minSamples Paramètre minSamples.
 * @param {number} targetRH Paramètre targetRH.
 * @returns {import('../types/vmi-types.js').SpeedLevelResult} Comparaison descriptive des niveaux manuels.
 */
export function analyzeSpeedLevels(data, minSamples = 10, targetRH = 50) {
  if (!Number.isInteger(minSamples) || minSamples <= 0) {
    throw new RangeError('minSamples doit être un entier strictement positif.');
  }

  const eligibleRows = (Array.isArray(data) ? data : []).filter(r =>
    !isPlaceholderSensorRecord(r) && Number.isFinite(r?.vmiModeRaw) && [1,2,3].includes(r.vmiModeRaw) &&
    Number.isFinite(r.sh) && isPlausibleHumidity(r.sh) &&
    Number.isFinite(r.st) && isPlausibleTemperature(r.st)
  );
  // Un même mode et horodatage ne représentent qu'une observation ;
  // la dernière ligne valide rencontrée prévaut. Les imports sans date
  // ou avec une date hors plage restent conservés pour compatibilité.
  const uniqueRows = new Map();
  const untimedRows = [];
  for (const row of eligibleRows) {
    if (Number.isFinite(row.t) && Number.isFinite(new Date(row.t).getTime())) {
      uniqueRows.set(`${row.vmiModeRaw}:${row.t}`, row);
    } else {
      untimedRows.push(row);
    }
  }
  const rows = [...untimedRows, ...uniqueRows.values()];
  const groups = [1,2,3].map(v => {
    const samples = rows.filter(r => r.vmiModeRaw === v).sort((a,b)=>a.t-b.t);
    const deltas = samples.map(r => {
      const inside = absoluteHumidity(r.st,r.sh);
      const incoming = Number.isFinite(r.te) && isPlausibleTemperature(r.te) &&
        Number.isFinite(r.he) && isPlausibleHumidity(r.he)
        ? absoluteHumidity(r.te,r.he) : null;
      return inside != null && incoming != null ? inside-incoming : null;
    }).filter(Number.isFinite);
    const times=samples.map(r=>r.t).filter(t=>Number.isFinite(t)&&Number.isFinite(new Date(t).getTime()));
    const coveredDays=new Set(times.map(t=>{
      const d=new Date(t);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }));
    const rpms=samples.map(r=>r.rpm).filter(v=>Number.isFinite(v)&&v>0&&v<10000);
    const firstAt=times.length?times.reduce((min,time)=>Math.min(min,time),Infinity):null;
    const lastAt=times.length?times.reduce((max,time)=>Math.max(max,time),-Infinity):null;
    return {
      v,n:samples.length,sharedDays:0,
      daysCovered:coveredDays.size,
      coveredDayKeys:[...coveredDays],
      rh:median(samples.map(r=>r.sh)),
      ha:median(samples.map(r=>absoluteHumidity(r.st,r.sh))),
      delta:median(deltas),
      dryingShare:deltas.length?deltas.filter(v=>v>1).length/deltas.length:null,
      rpm:median(rpms),
      rpmSamples:rpms.length,
      deltaSamples:deltas.length,
      firstAt,
      lastAt,
      spanHours:times.length>1?(lastAt-firstAt)/3600000:0
    };
  });
  const sufficient=groups.filter(g=>g.n>=minSamples);
  const dayKeysBySpeed=new Map(groups.map(group=>[group.v,new Set(group.coveredDayKeys)]));
  for(const group of groups){
    const ownDays=dayKeysBySpeed.get(group.v);
    group.sharedDays=Math.max(0,...sufficient.filter(other=>other.v!==group.v).map(other=>
      [...ownDays].filter(day=>dayKeysBySpeed.get(other.v).has(day)).length
    ));
    delete group.coveredDayKeys;
  }
  const status=rows.length===0?'no-speed-data':sufficient.length?'comparison-ready':'insufficient';
  return {groups,status,bestSpeed:null,minSamples,targetRH,sampleCount:rows.length,
    comparableGroups:sufficient.length};
}

/**
 * Décrit les mesures par niveau manuel et tranche horaire locale de 6 h.
 * Une médiane n'est affichée que si l'effectif et le nombre de jours suffisent.
 * Les tranches ne sont pas considérées comme des essais contrôlés.
 */
/**
 * analyzeSpeedTimeContext — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} data Relevés hygrométriques et modes manuels.
 * @param {AnalysisOptions} options Seuils minimaux de comparaison.
 * @returns {import('../types/vmi-types.js').SpeedTimeContextResult} Groupes horaires et comparaisons descriptives.
 */
export function analyzeSpeedTimeContext(data, { minSamples = 5, minDays = 2 } = {}) {
  for (const [name, value] of Object.entries({ minSamples, minDays })) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(`${name} doit être un entier strictement positif.`);
    }
  }

  const uniqueRows=new Map();
  for(const row of Array.isArray(data)?data:[]){
    if(isPlaceholderSensorRecord(row)||!Number.isFinite(row?.t)||!Number.isFinite(row?.vmiModeRaw)||![1,2,3].includes(row.vmiModeRaw)||
      !Number.isFinite(row.st)||!isPlausibleTemperature(row.st)||
      !Number.isFinite(row.sh)||!isPlausibleHumidity(row.sh))continue;
    uniqueRows.set(`${row.vmiModeRaw}:${row.t}`,row);
  }
  const rows=[...uniqueRows.values()];
  const buckets=['00–05 h','06–11 h','12–17 h','18–23 h'];
  const bySpeedBucketDay=new Map();
  const dayKey=t=>{
    const d=new Date(t);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  };
  for(const row of rows){
    const bucket=Math.floor(new Date(row.t).getHours()/6);
    const key=row.vmiModeRaw+':'+bucket;
    if(!bySpeedBucketDay.has(key))bySpeedBucketDay.set(key,new Map());
    const days=bySpeedBucketDay.get(key),day=dayKey(row.t);
    if(!days.has(day))days.set(day,[]);
    days.get(day).push(row);
  }
  const summarizeDay=samples=>{
    const incoming=samples.filter(r=>Number.isFinite(r.te)&&isPlausibleTemperature(r.te)&&
      Number.isFinite(r.he)&&isPlausibleHumidity(r.he));
    const deltas=incoming.map(r=>absoluteHumidity(r.st,r.sh)-absoluteHumidity(r.te,r.he));
    const rpms=samples.map(r=>r.rpm).filter(v=>Number.isFinite(v)&&v>0&&v<10000);
    return {
      medianRH:median(samples.map(r=>r.sh)),
      medianIndoorHA:median(samples.map(r=>absoluteHumidity(r.st,r.sh))),
      medianIncomingHA:median(incoming.map(r=>absoluteHumidity(r.te,r.he))),
      medianDeltaHA:median(deltas),
      deltaSamples:deltas.length,
      medianRPM:median(rpms),
      rpmSamples:rpms.length
    };
  };
  // Chaque date pèse autant : on calcule d'abord une médiane par jour,
  // puis la médiane de ces valeurs journalières (et non une médiane globale pondérée par le volume).
  const summarize=daySamples=>{
    const daily=daySamples.map(samples=>summarizeDay(samples));
    const sum=key=>daily.reduce((total,item)=>total+item[key+'Samples'],0);
    return {
      medianRH:median(daily.map(day=>day.medianRH)),
      medianIndoorHA:median(daily.map(day=>day.medianIndoorHA)),
      medianIncomingHA:median(daily.map(day=>day.medianIncomingHA)),
      medianDeltaHA:median(daily.map(day=>day.medianDeltaHA)),
      deltaSamples:sum('delta'),
      medianRPM:median(daily.map(day=>day.medianRPM)),
      rpmSamples:sum('rpm'),
      dayCount:daily.length,
      daily
    };
  };
  const comparisons=[];
  const groupCandidates=new Map();
  for(let bucket=0;bucket<4;bucket++){
    for(const pair of [[1,2],[1,3],[2,3]]){
      const firstDays=bySpeedBucketDay.get(pair[0]+':'+bucket)||new Map();
      const secondDays=bySpeedBucketDay.get(pair[1]+':'+bucket)||new Map();
      const sharedDayKeys=[...firstDays.keys()].filter(day=>secondDays.has(day)).sort();
      const firstDaySamples=sharedDayKeys.map(day=>firstDays.get(day));
      const secondDaySamples=sharedDayKeys.map(day=>secondDays.get(day));
      const firstSamples=firstDaySamples.flat();
      const secondSamples=secondDaySamples.flat();
      const ready=sharedDayKeys.length>=minDays&&firstSamples.length>=minSamples&&secondSamples.length>=minSamples;
      const firstStats=ready?summarize(firstDaySamples):null;
      const secondStats=ready?summarize(secondDaySamples):null;
      const comparison={
        bucket,label:buckets[bucket],speeds: /** @type {[number,number]} */ (pair),
        sharedDayCount:sharedDayKeys.length,
        sampleCountFirst:firstSamples.length,
        sampleCountSecond:secondSamples.length,
        ready,
        reason:ready?null:sharedDayKeys.length<minDays
          ? 'Pas assez de dates communes'
          : 'Pas assez de relevés sur les dates communes',
        first:firstStats,
        second:secondStats,
        medianIncomingHADifference:ready?median(firstStats.daily.map((day,index)=>
          (secondStats.daily[index].medianIncomingHA??NaN)-(day.medianIncomingHA??NaN)
        )):null,
        medianDeltaHADifference:ready?median(firstStats.daily.map((day,index)=>
          (secondStats.daily[index].medianDeltaHA??NaN)-(day.medianDeltaHA??NaN)
        )):null,
        sharedDayKeys
      };
      comparisons.push(comparison);
      for(const [speed,samples,stats,otherSpeed,sampleCount] of [
        [pair[0],firstSamples,comparison.first,pair[1],firstSamples.length],
        [pair[1],secondSamples,comparison.second,pair[0],secondSamples.length]
      ]){
        const key=speed+':'+bucket;
        const candidate={
          speed,bucket,label:buckets[bucket],otherSpeed,
          sampleCount,dayCount:sharedDayKeys.length,sharedDays:sharedDayKeys.length,
          ready,stats
        };
        const current=groupCandidates.get(key);
        if(!current||candidate.sharedDays>current.sharedDays||
          (candidate.sharedDays===current.sharedDays&&candidate.ready&&!current.ready)||
          (candidate.sharedDays===current.sharedDays&&candidate.ready===current.ready&&candidate.sampleCount>current.sampleCount)){
          groupCandidates.set(key,candidate);
        }
      }
    }
  }
  const groups=[];
  for(let bucket=0;bucket<4;bucket++){
    for(const speed of [1,2,3]){
      const candidate=groupCandidates.get(speed+':'+bucket);
      groups.push(candidate?{
        ...candidate,
        medianRH:candidate.stats?.medianRH??null,
        medianIndoorHA:candidate.stats?.medianIndoorHA??null,
        medianIncomingHA:candidate.stats?.medianIncomingHA??null,
        medianDeltaHA:candidate.stats?.medianDeltaHA??null,
        deltaSamples:candidate.stats?.deltaSamples??0,
        medianRPM:candidate.stats?.medianRPM??null,
        rpmSamples:candidate.stats?.rpmSamples??0
      }:{
        speed,bucket,label:buckets[bucket],otherSpeed:null,
        sampleCount:0,dayCount:0,sharedDays:0,ready:false,
        medianRH:null,medianIndoorHA:null,medianIncomingHA:null,
        medianDeltaHA:null,deltaSamples:0,medianRPM:null,rpmSamples:0
      });
    }
  }
  return {
    groups,
    comparisons,
    minSamples,
    minDays,
    comparableBuckets:[...new Set(comparisons.filter(c=>c.ready).map(c=>c.bucket))]
  };
}

/**
 * Compare deux périodes calendaires successives à mode et tranche horaire identiques.
 * Les valeurs brutes restent brutes ; aucune variation n'est qualifiée de panne ou d'encrassement.
 */
/**
 * compareOperatingPeriods — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} data Historique des relevés VMI.
 * @param {AnalysisOptions} options Paramètres de fenêtre et de couverture.
 * @returns {import('../types/vmi-types.js').OperatingPeriodsResult} Comparaison des périodes successives.
 */
export function compareOperatingPeriods(data, {
  periodDays = 7, minSamples = 12, minDays = 3
} = {}) {
  for (const [name, value] of Object.entries({ periodDays, minSamples, minDays })) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(`${name} doit être un entier strictement positif.`);
    }
  }

  const uniqueRows = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    if (!Number.isFinite(row?.t) ||
        !Number.isFinite(new Date(row.t).getTime()) ||
        !Number.isFinite(row?.vmiModeRaw) || ![1, 2, 3].includes(row.vmiModeRaw)) continue;
    uniqueRows.set(`${row.vmiModeRaw}:${row.t}`, row);
  }
  const rows = [...uniqueRows.values()];
  if (!rows.length) {
    return { status: 'no-mode-data', periodDays, minSamples, minDays, periods: [], comparisons: [] };
  }

  const latestTimestamp = rows.reduce((latest, row) => Math.max(latest, row.t), -Infinity);
  const latest = new Date(latestTimestamp);
  const currentEnd = new Date(latest.getFullYear(), latest.getMonth(), latest.getDate() + 1);
  const currentStart = new Date(currentEnd);
  currentStart.setDate(currentStart.getDate() - periodDays);
  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - periodDays);
  const key = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const periods = [
    { id: 'previous', start: previousStart, end: currentStart },
    { id: 'current', start: currentStart, end: currentEnd }
  ].map(period => ({
    id: period.id,
    start: key(period.start),
    end: key(new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate()-1)),
    startMs: period.start.getTime(),
    endMs: period.end.getTime()
  }));

  const metrics = /** @type {Array<{key:'debit'|'rpm'|'vmiPwmRaw'|'motorPressureRaw',label:string,unit:string,verified?:boolean}>} */ ([
    { key: 'debit', label: 'Débit', unit: 'm³/h', verified: true },
    { key: 'rpm', label: 'Régime moteur', unit: 'tr/min' },
    { key: 'vmiPwmRaw', label: 'PWM', unit: 'valeur brute' },
    { key: 'motorPressureRaw', label: 'Pression moteur', unit: 'valeur brute, unité inconnue' }
  ]);
  const comparisons = [];
  for (const mode of [1, 2, 3]) {
    for (let bucket = 0; bucket < 4; bucket++) {
      const periodStats = periods.map(period => {
        const samples = rows.filter(row =>
          row.vmiModeRaw === mode &&
          row.t >= period.startMs && row.t < period.endMs &&
          new Date(row.t).getHours() >= bucket * 6 &&
          new Date(row.t).getHours() < (bucket + 1) * 6
        );
        const days = new Set(samples.map(row => key(new Date(row.t))));
        const values = Object.fromEntries(metrics.map(metric => {
          const valid = samples.map(row => row[metric.key]).filter((value) =>
            typeof value === 'number' && Number.isFinite(value) &&
            (metric.key !== 'rpm' || (value > 0 && value < 10000)) &&
            (metric.key === 'debit' ? value >= 0 : metric.key === 'rpm' ? value > 0 && value < 10000 : true)
          );
          return [metric.key, { median: median(valid), count: valid.length }];
        }));
        return {
          id: period.id, sampleCount: samples.length, dayCount: days.size,
          ready: samples.length >= minSamples && days.size >= minDays,
          values
        };
      });
      const [previous, current] = periodStats;
      /** @type {Record<string, {previous:number,current:number,absolute:number|null,relativePercent:number|null,unit:string}|null>} */
      const deltas = {};
      if (previous.ready && current.ready) {
        for (const metric of metrics) {
          const before = previous.values[metric.key].median;
          const after = current.values[metric.key].median;
          const enoughMetricSamples =
            previous.values[metric.key].count >= minSamples &&
            current.values[metric.key].count >= minSamples;
          if (!enoughMetricSamples || before == null || after == null) {
            deltas[metric.key] = null;
            continue;
          }
          const absoluteDelta = after - before;
          const relativeDelta = before !== 0 ? (absoluteDelta / Math.abs(before)) * 100 : null;
          deltas[metric.key] = {
            previous: before,
            current: after,
            absolute: Number.isFinite(absoluteDelta) ? absoluteDelta : null,
            relativePercent: Number.isFinite(relativeDelta) ? relativeDelta : null,
            unit: metric.unit
          };
        }
      }
      comparisons.push({
        mode, bucket, label: ['00–05 h','06–11 h','12–17 h','18–23 h'][bucket],
        previous, current,
        comparable: previous.ready && current.ready,
        deltas
      });
    }
  }
  for (const item of comparisons) {
    item.comparable = item.comparable && metrics.some(metric =>
      item.previous.values[metric.key].count >= minSamples &&
      item.current.values[metric.key].count >= minSamples &&
      item.previous.values[metric.key].median != null &&
      item.current.values[metric.key].median != null
    );
  }
  const comparableCount = comparisons.filter(item => item.comparable).length;
  return {
    status: comparableCount ? 'comparison-available' : 'insufficient-data',
    periodDays, minSamples, minDays, periods, comparisons,
    comparableCount,
    limits: [
      'Comparaison descriptive de deux périodes calendaires successives, à Mode et tranche horaire identiques.',
      'Chaque période doit contenir au moins le nombre minimal de relevés et de jours distincts.',
      'Les médianes ne neutralisent pas les différences de météo, d’occupation, d’ouvertures, ni les changements de réglage non consignés.',
      'Une variation de débit ou de régime moteur ne prouve pas un encrassement du filtre ni une panne.',
      'PWM et Pression moteur restent des valeurs brutes sans unité physique confirmée.'
    ]
  };
}

/** Inventaire des champs VMI+ disponibles ; aucune unité ni consommation n'est déduite. */
/**
 * summarizeEnergyReadiness — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} data Paramètre data.
 * @returns {import('../types/vmi-types.js').EnergyReadinessResult} Inventaire des champs énergétiques.
 */
export function summarizeEnergyReadiness(data) {
  const rows=Array.isArray(data)?data:[];
  const fields = /** @type {Array<{key:'rpm'|'debit'|'vmiSpeedRaw'|'vmiPwmRaw'|'consDpRaw'|'consResRaw'|'consHydroRRaw'|'consTmaxRaw'|'kmoteurRaw'|'jmoteurRaw'|'kreseauRaw'|'jreseauRaw'|'motorPressureRaw'|'offsetPressureRaw'|'operatingPctRaw'|'operatingPct2Raw'|'dcintRaw',label:string,unit:string,verified:boolean}>} */ ([
    {key:'rpm',label:'Régime moteur',unit:'tr/min (confirmé)',verified:true},
    {key:'debit',label:'Débit',unit:'m³/h',verified:true},
    {key:'vmiSpeedRaw',label:'Code vitesse VMI+',unit:'code brut',verified:false},
    {key:'vmiPwmRaw',label:'PWM VMI+',unit:'valeur brute (échelle à confirmer)',verified:false},
    {key:'consDpRaw',label:'Cons DP',unit:'signification et unité à confirmer',verified:false},
    {key:'consResRaw',label:'Cons Res',unit:'signification et unité à confirmer',verified:false},
    {key:'consHydroRRaw',label:'Cons HydroR',unit:'signification et unité à confirmer',verified:false},
    {key:'consTmaxRaw',label:'Seuil température extérieure (Cons TMax)',unit:'consigne en °C (sens confirmé)',verified:true},
    {key:'kmoteurRaw',label:'Kmoteur',unit:'signification et unité à confirmer',verified:false},
    {key:'jmoteurRaw',label:'Jmoteur',unit:'signification et unité à confirmer',verified:false},
    {key:'kreseauRaw',label:'Kreseau',unit:'signification et unité à confirmer',verified:false},
    {key:'jreseauRaw',label:'Jreseau',unit:'signification et unité à confirmer',verified:false},
    {key:'motorPressureRaw',label:'Pression Moteur',unit:'unité à confirmer',verified:false},
    {key:'offsetPressureRaw',label:'Offset Press',unit:'valeur brute',verified:false},
    {key:'operatingPctRaw',label:'% fonct',unit:'échelle à confirmer',verified:false},
    {key:'operatingPct2Raw',label:'% fonct.1',unit:'échelle à confirmer',verified:false},
    {key:'dcintRaw',label:'Dcint',unit:'signification et unité à confirmer',verified:false}
  ]).map(field=>{
    const values=rows.map(r=>r?.[field.key]).filter((value) => typeof value === 'number' && Number.isFinite(value));
    return {...field,count:values.length,
      zeroCount:values.filter(value=>value===0).length,
      nonZeroCount:values.filter(value=>value!==0).length,
      missingCount:rows.length-values.length,
      min:values.length?values.reduce((min,value)=>Math.min(min,value),Infinity):null,
      max:values.length?values.reduce((max,value)=>Math.max(max,value),-Infinity):null,
      distinct:[...new Set(values)].sort((a,b)=>a-b)};
  });
  return {
    total:rows.length,fields,
    hasVerifiedElectricalEnergy:false,
    message:'Aucune mesure électrique vérifiée en watts ou kWh n’est disponible : la consommation et le rendement énergétique ne peuvent pas encore être calculés.'
  };
}

/**
 * Analyse les relevés autour de la consigne de température extérieure Cons TMax.
 * Les comparaisons restent descriptives et sont séparées par mode manuel déclaré.
 */
/**
 * summarizeTemperatureLimit — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} data Historique des relevés VMI.
 * @param {{minimumGroupSamples?: number, minimumGroupDays?: number}} options Seuils de couverture par groupe.
 * @returns {import('../types/vmi-types.js').TemperatureLimitResult} Résumé descriptif de la consigne de température.
 */
export function summarizeTemperatureLimit(data, {
  minimumGroupSamples = 5, minimumGroupDays = 2
} = {}) {
  for (const [name, value] of Object.entries({ minimumGroupSamples, minimumGroupDays })) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(`${name} doit être un entier strictement positif.`);
    }
  }

  const rows = Array.isArray(data) ? data : [];
  const untimedEligible = [];
  const uniqueTimedEligible = new Map();
  for (const row of rows) {
    if ((row?.t != null && (!Number.isFinite(row.t) || !Number.isFinite(new Date(row.t).getTime()))) ||
        !Number.isFinite(row?.consTmaxRaw) || !isPlausibleTemperature(row.consTmaxRaw) ||
        !Number.isFinite(row?.tExt) || !isPlausibleTemperature(row.tExt)) continue;
    if (row.t == null) {
      untimedEligible.push(row);
    } else {
      uniqueTimedEligible.set(`${row.vmiModeRaw ?? 'unknown'}:${row.t}`, row);
    }
  }
  const eligible = [...untimedEligible, ...uniqueTimedEligible.values()];
  const settings = new Map();
  const dayKey = timestamp => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  };
  for (const row of eligible) {
    const threshold = row.consTmaxRaw;
    if (!settings.has(threshold)) settings.set(threshold, []);
    settings.get(threshold).push(row);
  }
  const summarize = samples => {
    const timestamps = samples.map(row => row.t).filter(Number.isFinite);
    const outdoor = samples.map(row => row.tExt).filter(Number.isFinite);
    return {
      sampleCount: samples.length,
      dayCount: new Set(timestamps.map(dayKey)).size,
      medianOutdoorTemp: median(outdoor)
    };
  };
  const pairedDailySummary = (dailyMap, sharedDays) => {
    const daily = sharedDays.map(day => {
      const samples = dailyMap.get(day) || [];
      return {
        sampleCount: samples.length,
        debit: median(samples.map(row => row.debit).filter(value => Number.isFinite(value) && value >= 0)),
        rpm: median(samples.map(row => row.rpm).filter(value => Number.isFinite(value) && value > 0 && value < 10000))
      };
    });
    return {
      sampleCount: daily.reduce((sum, item) => sum + item.sampleCount, 0),
      dayCount: daily.length,
      medianDebit: median(daily.map(item => item.debit)),
      medianRPM: median(daily.map(item => item.rpm))
    };
  };
  const thresholds = [...settings.entries()].sort((a,b) => a[0]-b[0]).map(([threshold, samples]) => {
    const aboveRows = samples.filter(row => row.tExt > threshold);
    const atOrBelowRows = samples.filter(row => row.tExt <= threshold);
    const modes = [1,2,3].map(mode => {
      const aboveModeRows = aboveRows.filter(row => row.vmiModeRaw === mode);
      const belowModeRows = atOrBelowRows.filter(row => row.vmiModeRaw === mode);
      const aboveDays = new Map(), belowDays = new Map();
      for (const row of aboveModeRows) {
        if (!Number.isFinite(row.t)) continue;
        const key = dayKey(row.t);
        if (!aboveDays.has(key)) aboveDays.set(key, []);
        aboveDays.get(key).push(row);
      }
      for (const row of belowModeRows) {
        if (!Number.isFinite(row.t)) continue;
        const key = dayKey(row.t);
        if (!belowDays.has(key)) belowDays.set(key, []);
        belowDays.get(key).push(row);
      }
      const sharedDays = [...aboveDays.keys()].filter(day => belowDays.has(day)).sort();
      const pairedAbove = pairedDailySummary(aboveDays, sharedDays);
      const pairedAtOrBelow = pairedDailySummary(belowDays, sharedDays);
      const hasPairedMetric = (metric, isValid) => {
        const dailyCounts = sharedDays.map(day => ({
          above: (aboveDays.get(day) || []).filter(row => isValid(row[metric])).length,
          below: (belowDays.get(day) || []).filter(row => isValid(row[metric])).length
        }));
        const metricSharedDays = dailyCounts.filter(day => day.above > 0 && day.below > 0);
        return metricSharedDays.length >= minimumGroupDays &&
          metricSharedDays.reduce((total, day) => total + day.above, 0) >= minimumGroupSamples &&
          metricSharedDays.reduce((total, day) => total + day.below, 0) >= minimumGroupSamples;
      };
      const hasComparableMetric =
        hasPairedMetric('debit', value => Number.isFinite(value) && value >= 0) ||
        hasPairedMetric('rpm', value => Number.isFinite(value) && value > 0 && value < 10000);
      return {
        mode,
        above: summarize(aboveModeRows),
        atOrBelow: summarize(belowModeRows),
        sharedDayCount: sharedDays.length,
        pairedAbove,
        pairedAtOrBelow,
        comparable: sharedDays.length >= minimumGroupDays && hasComparableMetric
      };
    }).filter(group => group.above.sampleCount || group.atOrBelow.sampleCount);
    return {
      threshold, sampleCount: samples.length,
      aboveThresholdCount: aboveRows.length,
      atOrBelowThresholdCount: atOrBelowRows.length,
      above: summarize(aboveRows),
      atOrBelow: summarize(atOrBelowRows),
      modes
    };
  });
  return {
    status: thresholds.length ? 'available' : 'no-comparable-data',
    minimumGroupSamples, minimumGroupDays,
    inputSampleCount: rows.length,
    eligibleSampleCount: eligible.length,
    missingOutdoorTemperatureCount: rows.filter(row =>
      Number.isFinite(row?.consTmaxRaw) && isPlausibleTemperature(row.consTmaxRaw) &&
      (!Number.isFinite(row?.tExt) || !isPlausibleTemperature(row.tExt))
    ).length,
    thresholds,
    limits: [
      'Cons TMax est interprété comme une consigne de température extérieure en °C, selon la confirmation de l’utilisateur.',
      'Un relevé au-dessus du seuil indique une condition où la réduction de ventilation peut s’appliquer ; il ne prouve pas à lui seul que la régulation a effectivement réduit le débit.',
      'Les médianes comparatives sont calculées par jour puis équilibrées sur les mêmes dates présentes au-dessus et au seuil ou en dessous, séparément par Mode manuel déclaré.',
      'La comparaison ne neutralise pas l’heure, la saison, les autres réglages ni les conditions d’installation.'
    ]
  };
}

/**
 * Analyse la différence d'humidité absolue salon - air entrant dans le temps.
 * Les durées sont estimées entre deux mesures successives par interpolation
 * du delta. Les intervalles supérieurs à maxGapHours ne sont jamais extrapolés.
 */
/**
 * analyzeHygrometricPeriods — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} data Historique des relevés hygrométriques.
 * @param {{threshold?: number, maxGapHours?: number}} options Seuils de regroupement temporel.
 * @returns {import('../types/vmi-types.js').HygrometricPeriodsResult} Périodes hygrométriques détectées.
 */
/**
 * Agrège des relevés déjà normalisés et triés chronologiquement.
 * Évite de recalculer les validations, les humidités absolues et l'index des
 * horodatages lorsque le diagnostic complet a déjà préparé ces relevés.
 * @param {Array<{t:number,delta:number}>} rows Relevés valides, uniques et triés.
 * @param {{threshold?:number,maxGapHours?:number}} options Seuils temporels.
 */
function summarizePreparedHygrometricPeriods(rows, { threshold = 1, maxGapHours = 2 } = {}) {
  if(!Number.isFinite(threshold)||threshold<=0){
    throw new RangeError('threshold doit être un nombre fini strictement positif.');
  }
  if(!Number.isFinite(maxGapHours)||maxGapHours<=0){
    throw new RangeError('maxGapHours doit être un nombre fini strictement positif.');
  }
  const result={sampleCount:rows.length,intervalCount:0,gapCount:0,medianDelta:median(rows.map(r=>r.delta)),
    threshold,maxGapHours,observedDurationMs:0,dryDurationMs:0,humidDurationMs:0,
    neutralDurationMs:0,longestDryMs:0,longestHumidMs:0};
  if(rows.length<2)return result;
  const maxGapMs=maxGapHours*3600000;
  let streak=null;
  const closeStreak=()=>{
    if(!streak)return;
    if(streak.category==='dry')result.longestDryMs=Math.max(result.longestDryMs,streak.duration);
    if(streak.category==='humid')result.longestHumidMs=Math.max(result.longestHumidMs,streak.duration);
    streak=null;
  };
  for(let i=1;i<rows.length;i++){
    const a=rows[i-1],b=rows[i],duration=b.t-a.t;
    if(!(duration>0))continue;
    if(duration>maxGapMs){result.gapCount++;closeStreak();continue}
    result.intervalCount++;result.observedDurationMs+=duration;
    const cuts=[0,1];
    for(const boundary of [threshold,-threshold]){
      if((a.delta<boundary&&b.delta>boundary)||(a.delta>boundary&&b.delta<boundary)){
        cuts.push((boundary-a.delta)/(b.delta-a.delta));
      }
    }
    cuts.sort((x,y)=>x-y);
    for(let j=1;j<cuts.length;j++){
      const from=cuts[j-1],to=cuts[j],part=(to-from)*duration;
      if(part<=0)continue;
      const midpoint=(from+to)/2;
      const delta=a.delta+(b.delta-a.delta)*midpoint;
      const category=delta>threshold?'dry':delta< -threshold?'humid':'neutral';
      if(category==='dry')result.dryDurationMs+=part;
      else if(category==='humid')result.humidDurationMs+=part;
      else result.neutralDurationMs+=part;
      const start=a.t+from*duration,end=a.t+to*duration;
      if(streak&&streak.category===category&&Math.abs(streak.end-start)<1){
        streak.duration+=part;streak.end=end;
      }else{
        closeStreak();streak={category,duration:part,end};
      }
    }
  }
  closeStreak();
  return result;
}

/**
 * Analyse autonome de la différence d'humidité absolue salon - air entrant.
 * Les durées sont estimées entre deux mesures successives par interpolation ;
 * les intervalles supérieurs à maxGapHours ne sont jamais extrapolés.
 */
/**
 * analyzeHygrometricPeriods — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} data Historique des relevés hygrométriques.
 * @param {{threshold?: number, maxGapHours?: number}} options Seuils de regroupement temporel.
 * @returns {import('../types/vmi-types.js').HygrometricPeriodsResult} Périodes hygrométriques détectées.
 */
export function analyzeHygrometricPeriods(data, options = {}) {
  const unique=new Map();
  for(const r of Array.isArray(data)?data:[]){
    if(isPlaceholderSensorRecord(r)||!Number.isFinite(r?.t)||!Number.isFinite(new Date(r.t).getTime())||
      !Number.isFinite(r.st)||!isPlausibleTemperature(r.st)||
      !Number.isFinite(r.sh)||!isPlausibleHumidity(r.sh)||
      !Number.isFinite(r.te)||!isPlausibleTemperature(r.te)||
      !Number.isFinite(r.he)||!isPlausibleHumidity(r.he))continue;
    const delta=absoluteHumidity(r.st,r.sh)-absoluteHumidity(r.te,r.he);
    if(Number.isFinite(delta))unique.set(r.t,{t:r.t,delta});
  }
  const rows=[...unique.values()].sort((a,b)=>a.t-b.t);
  return summarizePreparedHygrometricPeriods(rows,options);
}

function validHygroRow(r) {
  if (isPlaceholderSensorRecord(r) || !Number.isFinite(r?.t) || !Number.isFinite(r.st) || !isPlausibleTemperature(r.st) ||
      !Number.isFinite(r.sh) || !isPlausibleHumidity(r.sh)) return false;
  const ha = absoluteHumidity(r.st, r.sh);
  return Number.isFinite(ha);
}

/** Médianes journalières locales : aucune interpolation entre les jours. */
/**
 * summarizeDailyTrends — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} data Paramètre data.
 * @returns {import('../types/vmi-types.js').DailyTrendsResult} Médianes journalières et évolutions.
 */
export function summarizeDailyTrends(data) {
  const days = new Map();
  const uniqueRows = new Map();
  for (const r of Array.isArray(data) ? data : []) {
    if (!validHygroRow(r) || !Number.isFinite(new Date(r.t).getTime())) continue;
    uniqueRows.set(r.t, r);
  }
  for (const r of uniqueRows.values()) {
    const date = new Date(r.t);
    const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(r);
  }
  const daily = [...days.entries()].map(([date, rows]) => ({
    date,
    sampleCount: rows.length,
    medianRH: median(rows.map(r => r.sh)),
    medianTemperature: median(rows.map(r => r.st)),
    medianAbsoluteHumidity: median(rows.map(r => absoluteHumidity(r.st, r.sh)))
  })).sort((a,b) => a.date.localeCompare(b.date));
  const sufficientlySampled = daily.filter(d => d.sampleCount >= 3);
  const last = sufficientlySampled.at(-1) || null;
  const previous = sufficientlySampled.length > 1 ? sufficientlySampled.at(-2) : null;
  return {
    days: daily,
    sampledDays: sufficientlySampled.length,
    latest: last,
    previous,
    changeRH: last && previous ? last.medianRH - previous.medianRH : null,
    changeAbsoluteHumidity: last && previous ? last.medianAbsoluteHumidity - previous.medianAbsoluteHumidity : null
  };
}

/** Profils horaires locaux. Une tranche n'est interprétée qu'à partir de 3 relevés. */
/**
 * analyzeHourlyPatterns — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} data Paramètre data.
 * @param {number} minSamples Paramètre minSamples.
 * @returns {import('../types/vmi-types.js').HourlyPatternsResult} Répartition horaire des mesures.
 */
export function analyzeHourlyPatterns(data, minSamples = 3) {
  if (!Number.isInteger(minSamples) || minSamples <= 0) {
    throw new RangeError('minSamples doit être un entier strictement positif.');
  }

  const buckets = Array.from({length:4}, (_,i) => ({
    label: ['00–05 h','06–11 h','12–17 h','18–23 h'][i],
    startHour: i*6,
    sampleCount: 0,
    medianRH: null,
    medianDelta: null
  }));
  const values = buckets.map(() => ({rh:[], delta:[]}));
  const uniqueRows = new Map();
  for (const r of Array.isArray(data) ? data : []) {
    if (!validHygroRow(r) || !Number.isFinite(new Date(r.t).getTime()) ||
        !Number.isFinite(r.te) || !isPlausibleTemperature(r.te) ||
        !Number.isFinite(r.he) || !isPlausibleHumidity(r.he)) continue;
    uniqueRows.set(r.t, r);
  }
  for (const r of uniqueRows.values()) {
    const bucket = Math.floor(new Date(r.t).getHours()/6);
    values[bucket].rh.push(r.sh);
    values[bucket].delta.push(absoluteHumidity(r.st,r.sh)-absoluteHumidity(r.te,r.he));
  }
  for (let i=0;i<buckets.length;i++) {
    const v=values[i];
    buckets[i].sampleCount=v.rh.length;
    if(v.rh.length>=minSamples) {
      buckets[i].medianRH=median(v.rh);
      buckets[i].medianDelta=median(v.delta);
    }
  }
  return { buckets, minSamples };
}

/**
 * Repère des variations rapides à examiner, sans les qualifier de panne.
 * Seules les mesures successives espacées de 2 h maximum sont comparées.
 */
/**
 * detectRapidChanges — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} data Historique des relevés horodatés.
 * @param {{maxGapHours?: number, rhJump?: number, absoluteHumidityJump?: number}} options Seuils de détection des variations rapides.
 * @returns {Array<{start:number,end:number,gapMs:number,deltaRH:number,deltaAbsoluteHumidity:number,reasons:string[]}>} Événements de variation rapide.
 */
export function detectRapidChanges(data, { maxGapHours = 2, rhJump = 15, absoluteHumidityJump = 3 } = {}) {
  for (const [name, value] of Object.entries({ maxGapHours, rhJump, absoluteHumidityJump })) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} doit être un nombre fini strictement positif.`);
    }
  }

  // Une seule observation par horodatage : la dernière ligne valide prévaut.
  // Une ligne invalide est ignorée et ne remplace jamais une mesure exploitable.
  const uniqueRows=new Map();
  for(const row of Array.isArray(data)?data:[]){
    if(!validHygroRow(row)||!Number.isFinite(new Date(row.t).getTime()))continue;
    uniqueRows.set(row.t,{t:row.t,rh:row.sh,ha:absoluteHumidity(row.st,row.sh)});
  }
  const rows=[...uniqueRows.values()].sort((a,b)=>a.t-b.t);
  const events=[];
  const maxGap=maxGapHours*60*60*1000;
  for(let i=1;i<rows.length;i++){
    const a=rows[i-1],b=rows[i],gap=b.t-a.t;
    if(gap<=0||gap>maxGap)continue;
    const deltaRH=b.rh-a.rh,deltaHA=b.ha-a.ha;
    if(Math.abs(deltaRH)>=rhJump||Math.abs(deltaHA)>=absoluteHumidityJump){
      events.push({
        start:a.t,end:b.t,gapMs:gap,
        deltaRH,deltaAbsoluteHumidity:deltaHA,
        reasons:[
          ...(Math.abs(deltaRH)>=rhJump?['relative-humidity']:[]),
          ...(Math.abs(deltaHA)>=absoluteHumidityJump?['absolute-humidity']:[ ])
        ]
      });
    }
  }
  return events;
}


/**
 * Compare les créneaux horaires sur les mêmes dates et avec un poids égal par jour.
 * @param {Array<{label:string,startHour:number,sampleCount:number,dayCount:number,dayKeys:string[]}>} hourlyDetails Synthèse des quatre tranches horaires.
 * @param {Map<number, Map<string, VmiRecord[]>>} byBucketDay Index tranche de six heures -> jour local -> relevés.
 */
function compareHourlyWindows(hourlyDetails, byBucketDay) {
  const eligibleHours=hourlyDetails.filter(bucket=>bucket.sampleCount>=5&&bucket.dayCount>=2);
  const hourlyPairs=[];
  let candidatePairCount=0;
  let pairsWithTwoCommonDays=0;
  let pairsMeetingDailyMinimum=0;
  for(let i=0;i<eligibleHours.length;i++){
    for(let j=i+1;j<eligibleHours.length;j++){
      const left=eligibleHours[i],right=eligibleHours[j];
      const leftDays=byBucketDay.get(Math.floor(left.startHour/6))||new Map();
      const rightDays=byBucketDay.get(Math.floor(right.startHour/6))||new Map();
      candidatePairCount++;
      const rightDayKeys=new Set(rightDays.keys());
      const commonDayKeys=[...leftDays.keys()].filter(day=>rightDayKeys.has(day));
      if(commonDayKeys.length>=2)pairsWithTwoCommonDays++;
      // Une date ne contribue que si chaque créneau y compte au moins trois relevés.
      const hourlyMinimumDailySamples=3;
      const sharedDayKeys=commonDayKeys.filter(day=>
        (leftDays.get(day)?.length||0)>=hourlyMinimumDailySamples&&
        (rightDays.get(day)?.length||0)>=hourlyMinimumDailySamples
      );
      if(sharedDayKeys.length<2)continue;
      pairsMeetingDailyMinimum++;
      const pairedStats=[left,right].map(bucket=>{
        const bucketDays=byBucketDay.get(Math.floor(bucket.startHour/6))||new Map();
        const daily=sharedDayKeys.map(day=>{
          const daySamples=bucketDays.get(day)||[];
          return {
            day,
            sampleCount:daySamples.length,
            medianDelta:median(daySamples.map(r=>r.delta))
          };
        });
        return {
          ...bucket,
          // Chaque date pèse autant, même si le nombre de relevés diffère fortement.
          medianDelta:median(daily.map(item=>item.medianDelta)),
          sampleCount:daily.reduce((total,item)=>total+item.sampleCount,0),
          dayCount:sharedDayKeys.length
        };
      });
      if(pairedStats.some(item=>item.sampleCount<5||item.medianDelta==null))continue;
      const [a,b]=pairedStats;
      const winner=a.medianDelta>=b.medianDelta?a:b;
      const comparator=winner===a?b:a;
      hourlyPairs.push({
        ...winner,
        comparisonWindow:comparator.label,
        comparisonMedianDelta:comparator.medianDelta,
        comparisonSampleCount:comparator.sampleCount,
        sharedDayCount:sharedDayKeys.length,
        sharedDayKeys,
        aggregationMethod:'Médiane des médianes journalières, avec un poids égal par date',
        advantage:winner.medianDelta-comparator.medianDelta
      });
    }
  }
  const bestWindow=hourlyPairs.length
    ? [...hourlyPairs].sort((a,b)=>
        b.medianDelta-a.medianDelta||
        b.advantage-a.advantage||
        b.sharedDayCount-a.sharedDayCount
      )[0]
    :null;
  let reason=null;
  if(!bestWindow){
    if(eligibleHours.length<2){
      reason='Moins de deux tranches horaires disposent chacune d’au moins cinq relevés répartis sur deux jours.';
    }else if(candidatePairCount>0&&pairsWithTwoCommonDays===0){
      reason='Les tranches horaires candidates ne partagent pas au moins deux mêmes jours calendaires.';
    }else if(pairsWithTwoCommonDays>0&&pairsMeetingDailyMinimum===0){
      reason='Des jours sont communs, mais chaque paire échoue au minimum de trois relevés dans chaque tranche et pour chaque jour commun.';
    }else{
      reason='Aucune paire ne satisfait l’ensemble des critères de validité des mesures horaires.';
    }
  }
  return {
    bestWindow,
    diagnostics:{
      candidateWindowCount:eligibleHours.length,
      candidatePairCount,
      pairsWithTwoCommonDays,
      pairsMeetingDailyMinimum,
      minimumSamplesPerWindow:5,
      minimumDistinctDaysPerWindow:2,
      minimumSharedDays:2,
      minimumSamplesPerWindowAndDay:3,
      reason
    }
  };
}

/**
 * Diagnostic hygrométrique explicable.
 * Les constats reposent sur les mesures disponibles, sans inférer le débit réel,
 * la consommation électrique, une panne ou un lien de causalité.
 */
/**
 * buildHygrometricDiagnosis — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} data Historique des relevés hygrométriques.
 * @param {{dryDelta?: number, trendDelta?: number, minSamples?: number, maxGapHours?: number}} options Seuils et paramètres du diagnostic.
 * @returns {import('../types/vmi-types.js').HygrometricDiagnosisResult} Diagnostic hygrométrique explicable.
 */
/**
 * Évalue une tendance durable à partir de deux fenêtres de trois jours échantillonnés.
 * Les limites calendaires et les critères de persistance sont centralisés ici.
 * @param {Array<{date:string,sampleCount:number,medianAbsoluteHumidity:number|null}>} dailyDays Résumés journaliers triés chronologiquement.
 * @param {number} trendDelta Écart minimal entre les médianes des deux fenêtres, en g/m³.
 * @returns {object} Fenêtres retenues, indicateurs de couverture et métriques de tendance.
 */
function analyzeHygrometricTrend(dailyDays, trendDelta) {
  // La tendance est toujours calculée sur les 14 derniers jours calendaires
  // disponibles : les anciennes journées ne doivent jamais élargir la comparaison.
  const trendLookbackDays=14;
  const latestAvailableDate=dailyDays.at(-1)?.date??null;
  const lookbackStartDate=latestAvailableDate
    ?new Date(Date.parse(latestAvailableDate+'T00:00:00Z')-(trendLookbackDays-1)*86400000).toISOString().slice(0,10)
    :null;
  const allEligibleTrendDays=dailyDays.filter(day=>day.sampleCount>=3&&Number.isFinite(day.medianAbsoluteHumidity));
  const eligibleTrendDays=allEligibleTrendDays.filter(day=>
    lookbackStartDate&&day.date>=lookbackStartDate&&day.date<=latestAvailableDate
  );
  const trendWindowDays=3;
  const trendMinimumDays=trendWindowDays*2;
  const firstTrendWindow=eligibleTrendDays.slice(0,trendWindowDays);
  const lastTrendWindow=eligibleTrendDays.slice(-trendWindowDays);
  const trendWindowsAreDistinct=eligibleTrendDays.length>=trendMinimumDays&&
    firstTrendWindow.at(-1).date<lastTrendWindow[0].date;
  const trendDateSpanDays=(start,end)=>(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000;
  const trendWindowSpanDays=trendWindowsAreDistinct?[
    trendDateSpanDays(firstTrendWindow[0].date,firstTrendWindow.at(-1).date),
    trendDateSpanDays(lastTrendWindow[0].date,lastTrendWindow.at(-1).date)
  ]:null;
  const totalTrendSpanDays=trendWindowsAreDistinct
    ?trendDateSpanDays(firstTrendWindow[0].date,lastTrendWindow.at(-1).date):null;
  const maxTrendWindowSpanDays=4;
  const maxTrendComparisonSpanDays=14;
  const trendWindowsTemporallyCompact=trendWindowsAreDistinct&&
    trendWindowSpanDays.every(span=>span<=maxTrendWindowSpanDays)&&
    totalTrendSpanDays<=maxTrendComparisonSpanDays;
  const first=trendWindowsTemporallyCompact?firstTrendWindow[0]:null;
  const last=trendWindowsTemporallyCompact?lastTrendWindow.at(-1):null;
  const baselineTrendMedian=trendWindowsTemporallyCompact?median(firstTrendWindow.map(day=>day.medianAbsoluteHumidity)):null;
  const recentTrendMedian=trendWindowsTemporallyCompact?median(lastTrendWindow.map(day=>day.medianAbsoluteHumidity)):null;
  const trendChange=trendWindowsTemporallyCompact?recentTrendMedian-baselineTrendMedian:null;
  const trendDirectionalDays=trendWindowsTemporallyCompact?{
    rising:lastTrendWindow.filter(day=>day.medianAbsoluteHumidity>baselineTrendMedian).length,
    falling:lastTrendWindow.filter(day=>day.medianAbsoluteHumidity<baselineTrendMedian).length
  }:null;
  return {
    eligibleTrendDays,eligibleDaysBeforeLookback:allEligibleTrendDays.length-eligibleTrendDays.length,
    trendLookbackDays,lookbackStartDate,lookbackEndDate:latestAvailableDate,
    trendWindowDays,trendMinimumDays,
    firstTrendWindow,lastTrendWindow,trendWindowsAreDistinct,
    trendWindowSpanDays,totalTrendSpanDays,
    maxTrendWindowSpanDays,maxTrendComparisonSpanDays,
    trendWindowsTemporallyCompact,first,last,
    baselineTrendMedian,recentTrendMedian,trendChange,trendDirectionalDays
  };
}

/**
 * Évalue la robustesse de l'échantillonnage indépendamment des conclusions hygrométriques.
 * @param {{inputSampleCount:number,acceptedSampleCount:number,dailySampleCounts:number[],observedHours:number,observedCoverageRatio:number,minSamples:number}} metrics Mesures de couverture déjà calculées.
 * @returns {{dayCount:number,daysWithAtLeastThreeSamples:number,acceptedSampleShare:number,coverageLevel:string,sufficient:boolean}} Indicateurs de couverture et suffisance.
 */
function assessHygrometricCoverage({
  inputSampleCount,acceptedSampleCount,dailySampleCounts,
  observedHours,observedCoverageRatio,minSamples
}) {
  const dayCount=dailySampleCounts.length;
  const daysWithAtLeastThreeSamples=dailySampleCounts.filter(count=>count>=3).length;
  const acceptedSampleShare=inputSampleCount?acceptedSampleCount/inputSampleCount:0;
  const coverageRatio=observedCoverageRatio;
  // Le niveau décrit la robustesse de l'échantillonnage, pas l'état physique de la VMI.
  const coverageLevel=acceptedSampleCount>=60&&dayCount>=5&&daysWithAtLeastThreeSamples>=5&&
    observedHours>=24&&coverageRatio>=0.5&&acceptedSampleShare>=0.9?'élevée'
    :acceptedSampleCount>=24&&dayCount>=3&&daysWithAtLeastThreeSamples>=3&&
      observedHours>=12&&coverageRatio>=0.2&&acceptedSampleShare>=0.7?'modérée':'faible';
  const sufficient=acceptedSampleCount>=minSamples&&dayCount>=2&&observedHours>=3;
  return {
    dayCount,daysWithAtLeastThreeSamples,acceptedSampleShare,
    coverageLevel,sufficient
  };
}

export function buildHygrometricDiagnosis(data, {
  dryDelta = 1,
  trendDelta = 0.8,
  minSamples = 12,
  maxGapHours = 2
} = {}) {
  if (!Number.isFinite(trendDelta) || trendDelta <= 0) {
    throw new RangeError('trendDelta doit être un nombre fini strictement positif.');
  }
  if (!Number.isInteger(minSamples) || minSamples <= 0) {
    throw new RangeError('minSamples doit être un entier strictement positif.');
  }
/**
 * Prépare les relevés hygrométriques valides et mesure la qualité des entrées.
 * Les doublons valides gardent la dernière occurrence rencontrée, comme auparavant.
 * @param {VmiRecord[]} inputRows Historique brut à analyser.
 */
function prepareHygrometricRows(inputRows) {
  const unique = new Map();
  let missingTimestampCount = 0;
  let incompleteSensorRecordCount = 0;
  let implausibleSensorRecordCount = 0;
  let placeholderSensorRecordCount = 0;
  let transientSpikeRecordCount = 0;
  let duplicateTimestampCount = 0;
  const transientCoreTimestamps = new Set(detectTransientSensorSpikes(inputRows).candidates
    .filter(candidate => ['st', 'sh', 'te', 'he'].includes(candidate.key))
    .map(candidate => candidate.timestamp));
  for (const r of inputRows) {
    if (!Number.isFinite(r?.t) || !Number.isFinite(new Date(r.t).getTime())) {
      missingTimestampCount++;
      continue;
    }
    if (isPlaceholderSensorRecord(r)) {
      placeholderSensorRecordCount++;
      continue;
    }
    if (transientCoreTimestamps.has(r.t)) {
      transientSpikeRecordCount++;
      continue;
    }
    const missingSensor = !Number.isFinite(r.st) || !Number.isFinite(r.sh) ||
      !Number.isFinite(r.te) || !Number.isFinite(r.he);
    const implausibleSensor =
      (Number.isFinite(r.st) && !isPlausibleTemperature(r.st)) ||
      (Number.isFinite(r.sh) && !isPlausibleHumidity(r.sh)) ||
      (Number.isFinite(r.te) && !isPlausibleTemperature(r.te)) ||
      (Number.isFinite(r.he) && !isPlausibleHumidity(r.he));
    if (missingSensor) incompleteSensorRecordCount++;
    if (implausibleSensor) implausibleSensorRecordCount++;
    if (missingSensor || implausibleSensor) continue;
    const indoor = absoluteHumidity(r.st, r.sh);
    const incoming = absoluteHumidity(r.te, r.he);
    if (!Number.isFinite(indoor) || !Number.isFinite(incoming)) continue;
    if (unique.has(r.t)) duplicateTimestampCount++;
    unique.set(r.t, {
      t:r.t, st:r.st, sh:r.sh, te:r.te, he:r.he,
      indoorHA:indoor, incomingHA:incoming, delta:indoor-incoming,
      indoorDew:dewPoint(r.st,r.sh), incomingDew:dewPoint(r.te,r.he)
    });
  }
  const rows=[...unique.values()].sort((a,b)=>a.t-b.t);
  return {
    rows,
    missingTimestampCount,
    incompleteSensorRecordCount,
    implausibleSensorRecordCount,
    placeholderSensorRecordCount,
    transientSpikeRecordCount,
    duplicateTimestampCount
  };
}

  const inputRows = Array.isArray(data) ? data : [];
  const {
    rows,
    missingTimestampCount,
    incompleteSensorRecordCount,
    implausibleSensorRecordCount,
    placeholderSensorRecordCount,
    transientSpikeRecordCount,
    duplicateTimestampCount
  } = prepareHygrometricRows(inputRows);
  const dayKey=t=>{
    const d=new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const dailySampleCounts=new Map();
  for(const row of rows){
    const key=dayKey(row.t);
    dailySampleCounts.set(key,(dailySampleCounts.get(key)||0)+1);
  }
  const periods=summarizePreparedHygrometricPeriods(rows,{threshold:dryDelta,maxGapHours});
  const observedHours=periods.observedDurationMs/3600000;
  const maxGapMs=maxGapHours*3600000;
  const acceptedIntervals=[];
  let excludedGapCount=0,largestExcludedGapMs=0;
  for(let i=1;i<rows.length;i++){
    const gap=rows[i].t-rows[i-1].t;
    if(!(gap>0))continue;
    if(gap<=maxGapMs)acceptedIntervals.push(gap);
    else{
      excludedGapCount++;
      if(gap>largestExcludedGapMs)largestExcludedGapMs=gap;
    }
  }
  const medianAcceptedIntervalMs=median(acceptedIntervals);
  const medianSampleIntervalMinutes=medianAcceptedIntervalMs==null?null:medianAcceptedIntervalMs/60000;
  const largestExcludedGapHours=largestExcludedGapMs/3600000;
  const coverageSpanHours=rows.length>1?(rows.at(-1).t-rows[0].t)/3600000:0;
  // Part de la période premier→dernier relevé couverte par des intervalles exploitables.
  const observedCoveragePercent=coverageSpanHours>0
    ?Math.round((observedHours/coverageSpanHours)*1000)/10:null;
  const dryShare=periods.observedDurationMs?periods.dryDurationMs/periods.observedDurationMs:null;
  const humidShare=periods.observedDurationMs?periods.humidDurationMs/periods.observedDurationMs:null;
  const daily=summarizeDailyTrends(rows);
  const dailyAirContext=new Map();
  for(const row of rows){
    const date=dayKey(row.t);
    if(!dailyAirContext.has(date))dailyAirContext.set(date,{incoming:[],indoorMinusIncoming:[]});
    const context=dailyAirContext.get(date);
    context.incoming.push(absoluteHumidity(row.te,row.he));
    context.indoorMinusIncoming.push(row.indoorHA-row.incomingHA);
  }
  const dailyAirContextStats=new Map([...dailyAirContext.entries()].map(([date,values])=>[date,{
    incoming:median(values.incoming),
    indoorMinusIncoming:median(values.indoorMinusIncoming)
  }]));
  const {
    eligibleTrendDays,eligibleDaysBeforeLookback,trendLookbackDays,lookbackStartDate,lookbackEndDate,
    trendWindowDays,trendMinimumDays,
    firstTrendWindow,lastTrendWindow,trendWindowsAreDistinct,
    trendWindowSpanDays,totalTrendSpanDays,
    maxTrendWindowSpanDays,maxTrendComparisonSpanDays,
    trendWindowsTemporallyCompact,first,last,
    baselineTrendMedian,recentTrendMedian,trendChange,trendDirectionalDays
  }=analyzeHygrometricTrend(daily.days,trendDelta);

  const hourly=analyzeHourlyPatterns(rows,5);
  // Index unique : tranche de 6 h -> jour local -> relevés.
  // Toutes les comparaisons horaires réutilisent ces groupes au lieu de filtrer
  // l'historique complet pour chaque paire et chaque date.
  const byBucketDay=new Map(Array.from({length:4},(_,bucket)=>[bucket,new Map()]));
  for(const row of rows){
    const bucket=Math.floor(new Date(row.t).getHours()/6);
    const date=dayKey(row.t);
    const days=byBucketDay.get(bucket);
    if(!days.has(date))days.set(date,[]);
    days.get(date).push(row);
  }
  const hourlyDetails=hourly.buckets.map((bucket,index)=>{
    const days=byBucketDay.get(index);
    const dayKeys=[...days.keys()];
    const sampleCount=[...days.values()].reduce((total,samples)=>total+samples.length,0);
    return {...bucket,sampleCount,dayCount:dayKeys.length,dayKeys};
  });
  const {bestWindow,diagnostics:hourlyComparisonDiagnostics}=compareHourlyWindows(hourlyDetails,byBucketDay);

  const coverage=assessHygrometricCoverage({
    inputSampleCount:inputRows.length,
    acceptedSampleCount:rows.length,
    dailySampleCounts:[...dailySampleCounts.values()],
    observedHours,observedCoverageRatio:coverageSpanHours>0?observedHours/coverageSpanHours:0,minSamples
  });
  const {
    dayCount,daysWithAtLeastThreeSamples,acceptedSampleShare,
    coverageLevel,sufficient
  }=coverage;
  const observations=[];

  if(!sufficient){
    observations.push({
      code:'coverage-limited',level:'info',
      basis:{validSamples:rows.length,requiredSamples:minSamples,distinctDays:dayCount,requiredDays:2,observedHours,requiredObservedHours:3},
      title:'Historique encore trop limité',
      detail:`${rows.length} relevé(s) simultanés valides sur ${dayCount} jour(s), avec ${fmtHours(observedHours)} de périodes exploitables. Il faut davantage de mesures réparties sur plusieurs jours pour produire un diagnostic fiable.`,
      recommendation:'Importer un historique plus long et vérifier que les températures et humidités du salon et de l’air entrant sont présentes.'
    });
  } else if(periods.medianDelta!=null&&periods.medianDelta>dryDelta&&dryShare>=0.6){
    const lowCoverage=coverageLevel==='faible';
    observations.push({
      code:'air-drying-potential',level:lowCoverage?'info':'positive',
      basis:{medianIndoorMinusIncomingHA:periods.medianDelta,unit:'g/m³',threshold:dryDelta,durationShare:dryShare,requiredDurationShare:0.6,coverageLevel},
      title:lowCoverage?'Potentiel hygrométrique à confirmer':'Conditions souvent favorables à l’assèchement',
      detail:`L’air entrant est plus sec que l’air du logement pendant ${Math.round(dryShare*100)} % des durées observées. L’écart médian salon − air entrant est de ${periods.medianDelta.toFixed(1)} g/m³.${lowCoverage?' La couverture des mesures est faible : ce signal reste provisoire et doit être confirmé sur davantage de journées.' : ''}`,
      recommendation:lowCoverage
        ?'La couverture est faible. Importer davantage de journées représentatives avant de considérer ce potentiel comme récurrent ; cela ne mesure pas l’effet réel sans débit d’air validé.'
        :'Le renouvellement d’air dispose d’un potentiel hygrométrique favorable pendant ces périodes. Cela ne mesure pas l’effet réel sans débit d’air validé.'
    });
  } else if(periods.medianDelta!=null&&periods.medianDelta< -dryDelta&&humidShare>=0.6){
    const lowCoverage=coverageLevel==='faible';
    observations.push({
      code:'air-moisture-potential',level:'caution',
      basis:{medianIndoorMinusIncomingHA:periods.medianDelta,unit:'g/m³',threshold:-dryDelta,durationShare:humidShare,requiredDurationShare:0.6,coverageLevel},
      title:lowCoverage?'Signal d’air entrant plus humide à confirmer':'L’air entrant est souvent plus humide',
      detail:`L’air entrant est plus humide que l’air intérieur pendant ${Math.round(humidShare*100)} % des durées observées. L’écart médian salon − air entrant est de ${periods.medianDelta.toFixed(1)} g/m³.${lowCoverage?' La couverture des mesures est faible : ce signal reste provisoire.' : ''}`,
      recommendation:lowCoverage
        ?'La couverture est faible. Confirmer ce signal avec davantage de journées représentatives avant toute interprétation durable ou modification manuelle.'
        :'Une hausse de vitesse ne garantit pas un assèchement dans ces conditions. Comparer les périodes et suivre l’évolution intérieure avant toute modification manuelle.'
    });
  } else {
    observations.push({
      code:'mixed-air-conditions',level:'info',
      basis:{dryDurationShare:dryShare,humidDurationShare:humidShare,dominanceThreshold:0.6},
      title:'Conditions hygrométriques variables',
      detail:`Aucune situation dominante nette : air entrant plus sec ${Math.round((dryShare||0)*100)} % du temps observé, plus humide ${Math.round((humidShare||0)*100)} %.`,
      recommendation:'Privilégier l’analyse des périodes horaires et saisonnières plutôt qu’une conclusion basée sur un relevé isolé.'
    });
  }

  if(!bestWindow){
    observations.push({
      code:'hourly-comparison-limited',level:'info',
      basis:hourlyComparisonDiagnostics,
      title:'Comparaison horaire non concluante',
      detail:hourlyComparisonDiagnostics.reason+' Aucun créneau n’est désigné comme plus favorable lorsque ces conditions ne sont pas réunies.',
      recommendation:'Conserver l’historique et réévaluer après plusieurs journées comportant des relevés répartis dans les différentes tranches horaires.'
    });
  }

  if(!trendWindowsAreDistinct){
    observations.push({
      code:'trend-insufficient-data',level:'info',
      basis:{eligibleDays:eligibleTrendDays.length,eligibleDaysBeforeLookback,lookbackStartDate,lookbackEndDate,lookbackDays:trendLookbackDays,requiredDays:trendMinimumDays,minimumDailySamples:3,daysPerWindow:trendWindowDays},
      title:'Tendance hygrométrique à confirmer',
      detail:`Sur les ${trendLookbackDays} derniers jours (${lookbackStartDate} au ${lookbackEndDate}), ${eligibleTrendDays.length} jour(s) disposent d’au moins trois relevés valides. Il en faut au moins ${trendMinimumDays}, répartis en deux fenêtres distinctes de ${trendWindowDays} jours, pour distinguer une évolution durable d’une variation ponctuelle.`,
      recommendation:'L’analyse sélectionne automatiquement les journées disponibles dans les 14 derniers jours ; poursuivre la collecte pour compléter cet échantillon.'
    });
  } else if(!trendWindowsTemporallyCompact){
    observations.push({
      code:'trend-calendar-span-limited',level:'info',
      basis:{eligibleDays:eligibleTrendDays.length,eligibleDaysBeforeLookback,lookbackStartDate,lookbackEndDate,firstWindowSpanDays:trendWindowSpanDays[0],lastWindowSpanDays:trendWindowSpanDays[1],totalSpanDays:totalTrendSpanDays,maximumWindowSpanDays:maxTrendWindowSpanDays,maximumComparisonSpanDays:maxTrendComparisonSpanDays},
      title:'Jours de mesure trop espacés pour confirmer une tendance',
      detail:`Dans les 14 derniers jours (${lookbackStartDate} au ${lookbackEndDate}), les trois journées de l’une des fenêtres sont trop espacées : chaque fenêtre doit tenir en ${maxTrendWindowSpanDays} jours calendaires. Les journées plus anciennes sont automatiquement exclues.`,
      recommendation:'Attendre des journées de mesure plus rapprochées dans la fenêtre récente avant de conclure à une tendance durable.'
    });
  } else {
    const baselineAirContext=firstTrendWindow.map(day=>dailyAirContextStats.get(day.date));
    const recentAirContext=lastTrendWindow.map(day=>dailyAirContextStats.get(day.date));
    const baselineIncomingMedian=median(baselineAirContext.map(value=>value?.incoming));
    const recentIncomingMedian=median(recentAirContext.map(value=>value?.incoming));
    const baselineIndoorMinusIncoming=median(baselineAirContext.map(value=>value?.indoorMinusIncoming));
    const recentIndoorMinusIncoming=median(recentAirContext.map(value=>value?.indoorMinusIncoming));
    const trendContextSentence=`Contexte mesuré sur les mêmes fenêtres : humidité absolue de l’air entrant ${baselineIncomingMedian.toFixed(2)} → ${recentIncomingMedian.toFixed(2)} g/m³ ; écart salon − air entrant ${baselineIndoorMinusIncoming.toFixed(2)} → ${recentIndoorMinusIncoming.toFixed(2)} g/m³. Ces évolutions concomitantes ne démontrent aucun lien causal.`;
    const trendBasis={firstDate:first.date,lastDate:last.date,lookbackDays:trendLookbackDays,lookbackStartDate,lookbackEndDate,eligibleDaysBeforeLookback,baselineWindowStartDate:firstTrendWindow[0].date,baselineWindowEndDate:firstTrendWindow.at(-1).date,recentWindowStartDate:lastTrendWindow[0].date,recentWindowEndDate:lastTrendWindow.at(-1).date,baselineWindowSpanDays:trendWindowSpanDays[0],recentWindowSpanDays:trendWindowSpanDays[1],totalComparisonSpanDays:totalTrendSpanDays,baselineDailyValues:firstTrendWindow.map(day=>`${day.date} : ${day.medianAbsoluteHumidity.toFixed(2)} g/m³ (${day.sampleCount} relevés)`).join(' · '),recentDailyValues:lastTrendWindow.map(day=>`${day.date} : ${day.medianAbsoluteHumidity.toFixed(2)} g/m³ (${day.sampleCount} relevés)`).join(' · '),baselineMedianAbsoluteHumidity:baselineTrendMedian,recentMedianAbsoluteHumidity:recentTrendMedian,baselineMedianRelativeHumidity:median(firstTrendWindow.map(day=>day.medianRH)),recentMedianRelativeHumidity:median(lastTrendWindow.map(day=>day.medianRH)),baselineMedianTemperature:median(firstTrendWindow.map(day=>day.medianTemperature)),recentMedianTemperature:median(lastTrendWindow.map(day=>day.medianTemperature)),baselineIncomingMedianAbsoluteHumidity:median(baselineAirContext.map(value=>value?.incoming)),recentIncomingMedianAbsoluteHumidity:median(recentAirContext.map(value=>value?.incoming)),incomingAbsoluteHumidityChange:median(recentAirContext.map(value=>value?.incoming))-median(baselineAirContext.map(value=>value?.incoming)),baselineIndoorMinusIncomingMedian:median(baselineAirContext.map(value=>value?.indoorMinusIncoming)),recentIndoorMinusIncomingMedian:median(recentAirContext.map(value=>value?.indoorMinusIncoming)),indoorMinusIncomingChange:median(recentAirContext.map(value=>value?.indoorMinusIncoming))-median(baselineAirContext.map(value=>value?.indoorMinusIncoming)),change:trendChange,threshold:trendDelta,eligibleDays:eligibleTrendDays.length,daysPerWindow:trendWindowDays,risingDays:trendDirectionalDays.rising,fallingDays:trendDirectionalDays.falling,minimumDirectionalDays:2,unit:'g/m³'};
    if(trendChange>=trendDelta&&trendDirectionalDays.rising>=2){
      observations.push({
        code:'indoor-moisture-rising',level:'caution',
        basis:trendBasis,
        title:'Tendance durable à la hausse de l’humidité absolue',
        detail:`La médiane des ${trendWindowDays} derniers jours échantillonnés dépasse de ${trendChange.toFixed(1)} g/m³ celle des ${trendWindowDays} premiers jours. Le signal est retrouvé sur ${trendDirectionalDays.rising} des ${trendWindowDays} derniers jours. `+trendContextSentence,
        recommendation:'Examiner les apports de vapeur d’eau, les extractions et les conditions extérieures. Cette évolution ne suffit pas à identifier une cause.'
      });
    } else if(trendChange<=-trendDelta&&trendDirectionalDays.falling>=2){
      observations.push({
        code:'indoor-moisture-falling',level:'positive',
        basis:trendBasis,
        title:'Tendance durable à la baisse de l’humidité absolue',
        detail:`La médiane des ${trendWindowDays} derniers jours échantillonnés est inférieure de ${Math.abs(trendChange).toFixed(1)} g/m³ à celle des ${trendWindowDays} premiers jours. Le signal est retrouvé sur ${trendDirectionalDays.falling} des ${trendWindowDays} derniers jours. `+trendContextSentence,
        recommendation:'Poursuivre l’observation pour vérifier que cette baisse se maintient sur les prochains jours.'
      });
    } else {
      observations.push({
        code:'trend-not-sustained',level:'info',
        basis:trendBasis,
        title:'Pas de tendance durable confirmée',
        detail:`L’écart entre les deux fenêtres de ${trendWindowDays} jours est de ${trendChange>=0?'+':''}${trendChange.toFixed(1)} g/m³, mais les critères de persistance ne sont pas réunis. Une variation ponctuelle n’est donc pas interprétée comme une tendance.`,
        recommendation:'Continuer à suivre les médianes journalières ; réévaluer lorsque davantage de jours seront disponibles.'
      });
    }
  }

  if(bestWindow&&bestWindow.medianDelta>dryDelta){
    observations.push({
      code:'favorable-time-window',level:'positive',
      basis:{timeWindow:bestWindow.label,comparisonWindow:bestWindow.comparisonWindow,medianDelta:bestWindow.medianDelta,comparisonMedianDelta:bestWindow.comparisonMedianDelta,advantage:bestWindow.advantage,unit:'g/m³',sampleCount:bestWindow.sampleCount,comparisonSampleCount:bestWindow.comparisonSampleCount,dayCount:bestWindow.dayCount,sharedDayCount:bestWindow.sharedDayCount,sharedDayKeys:bestWindow.sharedDayKeys,aggregationMethod:bestWindow.aggregationMethod},
      title:'Période horaire plus favorable repérée',
      detail:`Sur les deux créneaux comparés, ${bestWindow.label} présente un écart médian plus favorable (${bestWindow.medianDelta.toFixed(1)} g/m³) que ${bestWindow.comparisonWindow} (${bestWindow.comparisonMedianDelta.toFixed(1)} g/m³). Comparaison limitée aux mêmes ${bestWindow.sharedDayCount} jours calendaires, chaque jour ayant le même poids dans les médianes, avec ${bestWindow.sampleCount} et ${bestWindow.comparisonSampleCount} relevés respectivement.`,
      recommendation:'Vérifier si ce créneau se retrouve sur d’autres semaines et saisons avant d’en tirer une règle de réglage.'
    });
  }

  return {
    methodology:{version:'hygrometric-diagnostic-v8',dryDeltaThreshold:dryDelta,dryDeltaThresholdKind:'heuristic',dominantDurationShareKind:'heuristic',trendDeltaThreshold:trendDelta,trendMinimumDailySamples:3,trendMinimumDays:6,trendWindowDays:3,trendLookbackDays:14,trendMinimumDirectionalDays:2,trendMaximumWindowSpanDays:4,trendMaximumComparisonSpanDays:14,minimumSamples:minSamples,minimumDistinctDays:2,minimumObservedHours:3,dominantDurationShare:0.6,maximumGapHours:maxGapHours,hourlyBucketHours:6,hourlyMinimumSamples:5,hourlyMinimumDistinctDays:2,hourlyMinimumSharedDays:2,hourlyMinimumDailySamples:3,minimumDailySamplesForConfidence:3,moderateCoveragePercent:20,highCoveragePercent:50,moderateAcceptedShare:0.7,highAcceptedShare:0.9},
    status:sufficient?'analysis-available':'insufficient-data',
    inputQuality:{
      inputSampleCount:inputRows.length,
      acceptedSampleCount:rows.length,
      missingTimestampCount,
      incompleteSensorRecordCount,
      implausibleSensorRecordCount,
      placeholderSensorRecordCount,
      transientSpikeRecordCount,
      duplicateTimestampCount,
      excludedSampleCount:inputRows.length-rows.length
    },
    coverageLevel,
    confidenceBasis:{
      observedCoveragePercent,
      acceptedSampleShare,
      daysWithAtLeastThreeSamples,
      minimumDailySamples:3
    },
    sampleCount:rows.length,
    dayCount,
    observedHours,
    coverageSpanHours,
    observedCoveragePercent,
    medianSampleIntervalMinutes:Number.isFinite(medianSampleIntervalMinutes)?medianSampleIntervalMinutes:null,
    excludedGapCount,
    largestExcludedGapHours,
    maxGapHours,
    medianIndoorRH:median(rows.map(r=>r.sh)),
    medianIndoorHA:median(rows.map(r=>r.indoorHA)),
    medianIncomingHA:median(rows.map(r=>r.incomingHA)),
    medianIndoorDewPoint:median(rows.map(r=>r.indoorDew)),
    medianIncomingDewPoint:median(rows.map(r=>r.incomingDew)),
    dryShare,humidShare,trendChange,bestWindow,hourlyComparisonDiagnostics,
    observations,
    limits:[
      `Les durées sont estimées entre deux relevés, sans extrapolation au-delà de ${maxGapHours} heure(s).`,
      `Le seuil de ${dryDelta} g/m³ est un critère heuristique configurable, pas une norme ni une limite physique validée pour ces capteurs.`,
      'La dominance à 60 % est une règle de classement heuristique, pas une preuve d’efficacité d’assèchement.',
      'L’humidité absolue décrit la teneur en vapeur d’eau, pas le débit ni le renouvellement d’air réel.',
      'Le point de rosée calculé n’est pas une mesure de température de paroi : aucun risque de condensation n’est déduit.',
      'Les observations ne prouvent ni une panne, ni la cause d’une variation, ni une vitesse optimale.'
    ]
  };
}

/**
 * Décrit le débit Debit (m³/h) selon le code Vitesse brut exporté par VMI+.
 * Aucun code Vitesse n'est converti en niveau manuel ; l'unité du débit est confirmée en m³/h.
 */
/** Regroupe le débit d'air Debit (m³/h) par mode VMI+ ; Mode et Vitesse restent distincts. */
/**
 * Référence descriptive du fonctionnement par mode VMI+.
 * Mode et code Vitesse brut restent distincts ; les unités non confirmées restent brutes.
 */
/**
 * summarizeOperatingReference — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} data Historique des relevés VMI.
 * @param {{minSamples?: number}} options Effectif minimal par groupe.
 * @returns {import('../types/vmi-types.js').OperatingReferenceResult} Référence descriptive de fonctionnement.
 */
export function summarizeOperatingReference(data, { minSamples = 10 } = {}) {
  if (!Number.isInteger(minSamples) || minSamples <= 0) {
    throw new RangeError('minSamples doit être un entier strictement positif.');
  }

  const uniqueTimedRows = new Map();
  const untimedRows = [];
  for (const row of Array.isArray(data) ? data : []) {
    if (!Number.isFinite(row?.vmiModeRaw)) continue;
    if (Number.isFinite(row.t) && Number.isFinite(new Date(row.t).getTime())) {
      uniqueTimedRows.set(`${row.vmiModeRaw}:${row.t}`, row);
    } else {
      untimedRows.push(row);
    }
  }
  const rows = [...untimedRows, ...uniqueTimedRows.values()];
  const modes = new Map();
  for (const row of rows) {
    if (!modes.has(row.vmiModeRaw)) modes.set(row.vmiModeRaw, []);
    modes.get(row.vmiModeRaw).push(row);
  }
  const metrics = [
    { key: 'debit', label: 'Débit', unit: 'm³/h', verified: true },
    { key: 'rpm', label: 'Régime moteur', unit: 'tr/min confirmé', verified: true },
    { key: 'vmiPwmRaw', label: 'PWM', unit: 'valeur brute', verified: false },
    { key: 'motorPressureRaw', label: 'Pression moteur', unit: 'unité à confirmer', verified: false },
    { key: 'consDpRaw', label: 'Cons DP', unit: 'sens et unité à confirmer', verified: false }
  ];
  const groups = [...modes.entries()].sort((a, b) => a[0] - b[0]).map(([mode, samples]) => {
    const fields = metrics.map(metric => {
      const values = samples.map(row => row?.[metric.key]).filter((value) =>
        typeof value === 'number' && Number.isFinite(value) &&
        (metric.key === 'debit' ? value >= 0 : metric.key === 'rpm' ? value > 0 && value < 10000 : true)
      );
      const center = median(values);
      const min = values.length ? values.reduce((minimum, value) => Math.min(minimum, value), Infinity) : null;
      const max = values.length ? values.reduce((maximum, value) => Math.max(maximum, value), -Infinity) : null;
      return {
        ...metric, count: values.length, median: center,
        min, max,
        medianAbsoluteDeviation: center == null ? null : median(values.map(value => Math.abs(value - center)))
      };
    });
    const timestamps = samples.map(row => row?.t).filter(timestamp => Number.isFinite(timestamp) && Number.isFinite(new Date(timestamp).getTime()));
    const firstAt = timestamps.length ? timestamps.reduce((minimum, timestamp) => Math.min(minimum, timestamp), Infinity) : null;
    const lastAt = timestamps.length ? timestamps.reduce((maximum, timestamp) => Math.max(maximum, timestamp), -Infinity) : null;
    const days = new Set(timestamps.map(timestamp => {
      const date = new Date(timestamp);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }));
    const hasMetrics = fields.some(field => field.count >= minSamples);
    return {
      mode, sampleCount: samples.length, dayCount: days.size,
      firstAt,
      lastAt,
      ready: samples.length >= minSamples && days.size >= 2 && hasMetrics,
      fields
    };
  });
  return {
    status: groups.some(group => group.ready) ? 'reference-available' : groups.length ? 'provisional' : 'no-mode-data',
    minSamples, groups,
    limits: [
      'Référence descriptive calculée sur les données importées actuellement, séparément pour chaque mode VMI+.',
      'Le champ Mode est distinct du champ Vitesse brut ; aucun code brut n’est converti en niveau manuel.',
      'Les médianes et plages ne prouvent ni un fonctionnement normal, ni une panne, ni une cause.',
      'PWM, Pression moteur et Cons DP restent des valeurs brutes : aucune unité physique ni consommation n’est déduite.',
      'Une comparaison temporelle fiable nécessitera plusieurs exports couvrant des périodes distinctes et comparables.'
    ]
  };
}

/**
 * summarizeRawVmiMode — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} data Paramètre data.
 * @returns {Array<{mode:number,sampleCount:number,medianDebit:number|null,minDebit:number|null,maxDebit:number|null,medianRenewalRate:number|null,referenceDebit:number|null,referenceRenewalRate:number|null}>} Résumé des codes Mode bruts.
 */
export function summarizeRawVmiMode(data) {
  const groups = new Map();
  const uniqueTimedSamples = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    if (!Number.isFinite(row?.vmiModeRaw)) continue;
    const mode = row.vmiModeRaw;
    if (!groups.has(mode)) groups.set(mode, []);
    if (!Number.isFinite(row.debit) || row.debit < 0) continue;
    const volume = Number.isFinite(row.volumeRaw) && row.volumeRaw > 0 ? row.volumeRaw : null;
    const sample = { debit: row.debit, renewalRate: volume ? row.debit / volume : null };
    if (Number.isFinite(row.t) && Number.isFinite(new Date(row.t).getTime())) {
      uniqueTimedSamples.set(`${mode}:${row.t}`, { mode, sample });
    } else {
      groups.get(mode).push(sample);
    }
  }
  for (const { mode, sample } of uniqueTimedSamples.values()) groups.get(mode).push(sample);
  // Référence communiquée par l'utilisateur : mode 3 = 184 m³/h.
  // Elle reste distincte des débits Debit (m³/h) réellement présents dans l'historique.
  if (!groups.has(3)) groups.set(3, []);
  return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([mode, rows]) => ({
    mode, sampleCount: rows.length,
    medianDebit: median(rows.map(r=>r.debit)),
    minDebit: rows.length ? rows.reduce((minimum, row) => Math.min(minimum, row.debit), Infinity) : null,
    maxDebit: rows.length ? rows.reduce((maximum, row) => Math.max(maximum, row.debit), -Infinity) : null,
    medianRenewalRate: median(rows.map(r=>r.renewalRate).filter(Number.isFinite)),
    referenceDebit: mode === 3 ? 184 : null,
    referenceRenewalRate: mode === 3 ? 184 / 337 : null
  }));
}

/**
 * summarizeRawVmiSpeed — contrat d'entrée/sortie documenté pour l'analyse statique de l'IDE.
 * @param {VmiRecord[]} data Paramètre data.
 * @returns {Array<{code:number,sampleCount:number,medianDebit:number|null,minDebit:number|null,maxDebit:number|null}>} Résumé des codes Vitesse bruts.
 */
export function summarizeRawVmiSpeed(data) {
  const groups = new Map();
  const uniqueTimedValues = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    if (!Number.isFinite(row?.vmiSpeedRaw)) continue;
    const code = row.vmiSpeedRaw;
    if (!groups.has(code)) groups.set(code, []);
    if (!Number.isFinite(row.debit) || row.debit < 0) continue;
    if (Number.isFinite(row.t) && Number.isFinite(new Date(row.t).getTime())) {
      uniqueTimedValues.set(`${code}:${row.t}`, { code, debit: row.debit });
    } else {
      groups.get(code).push(row.debit);
    }
  }
  for (const { code, debit } of uniqueTimedValues.values()) groups.get(code).push(debit);
  return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([code, values]) => ({
    code,
    sampleCount: values.length,
    medianDebit: median(values),
    minDebit: values.length ? values.reduce((minimum, value) => Math.min(minimum, value), Infinity) : null,
    maxDebit: values.length ? values.reduce((maximum, value) => Math.max(maximum, value), -Infinity) : null
  }));
}

function fmtHours(hours) {
  if (!Number.isFinite(hours)) return '0 h';
  if (hours < 1) return `${Math.round(hours*60)} min`;
  return `${hours.toFixed(1)} h`;
}
