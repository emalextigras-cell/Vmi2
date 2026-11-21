/** @typedef {import('../types/vmi-types.js').VmiRecord} VmiRecord */

/** Moteur d'analyse hygrométrique : calculs et constats explicables, sans commande VMI. */
import { absoluteHumidity, dewPoint } from './psychrometry.js';
import { median } from './statistics.js';
import { detectTransientSensorSpikes, isPlaceholderSensorRecord, isPlausibleHumidity, isPlausibleTemperature } from './data-quality.js';

function fmtHours(hours) {
  if (!Number.isFinite(hours)) return '0 h';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours.toFixed(1)} h`;
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
  const byTimestamp = new Map();
  let missingTimestampCount = 0;
  let incompleteSensorRecordCount = 0;
  let implausibleSensorRecordCount = 0;
  let placeholderSensorRecordCount = 0;
  let transientSpikeRecordCount = 0;
  let duplicateTimestampCount = 0;
  let conflictingTimestampCount = 0;
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
    const group = byTimestamp.get(r.t) || [];
    group.push(r);
    byTimestamp.set(r.t, group);
  }
  const unique = new Map();
  for (const [timestamp, group] of byTimestamp) {
    duplicateTimestampCount += Math.max(0, group.length - 1);
    // Deux relevés valides au même instant mais avec des mesures différentes
    // sont ambigus : ne pas choisir arbitrairement la première ou la dernière ligne.
    const fingerprints = new Set(group.map(row =>
      JSON.stringify([row.st, row.sh, row.te, row.he])
    ));
    if (fingerprints.size > 1) {
      conflictingTimestampCount++;
      continue;
    }
    const r = group[0];
    const indoor = absoluteHumidity(r.st, r.sh);
    const incoming = absoluteHumidity(r.te, r.he);
    if (!Number.isFinite(indoor) || !Number.isFinite(incoming)) continue;
    unique.set(timestamp, {
      t:timestamp, st:r.st, sh:r.sh, te:r.te, he:r.he,
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
    duplicateTimestampCount,
    conflictingTimestampCount
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
    duplicateTimestampCount,
    conflictingTimestampCount
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
      conflictingTimestampCount,
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
