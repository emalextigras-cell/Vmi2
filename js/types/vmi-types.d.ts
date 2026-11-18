/**
 * Types partagés de l'application VMI.
 * Fichier de déclaration uniquement : aucun JavaScript généré ni effet à l'exécution.
 */

/** Relevé normalisé issu de l'historique VMI/VMI+. Les champs bruts non confirmés restent distincts. */
export interface VmiRecord {
  t?: number;
  st?: number;
  sh?: number;
  te?: number;
  he?: number;
  tExt?: number;
  t1?: number;
  h1?: number;
  rpm?: number;
  debit?: number;
  vmiModeRaw?: number;
  vmiSpeedRaw?: number;
  vmiPwmRaw?: number;
  motorPressureRaw?: number;
  offsetPressureRaw?: number;
  consDpRaw?: number;
  consResRaw?: number;
  consHydroRRaw?: number;
  consTmaxRaw?: number;
  kmoteurRaw?: number;
  jmoteurRaw?: number;
  kreseauRaw?: number;
  jreseauRaw?: number;
  operatingPctRaw?: number;
  operatingPct2Raw?: number;
  dcintRaw?: number;
  volumeRaw?: number;
  filterIndexPct?: number;
  fil?: number;
  d?: number;
  vmiAbsP0?: number;
  vmiAbsP1?: number;
  systemStateRaw?: number;
  failureRaw?: number;
  vit?: number | null;
  boost?: number | null;
  hol?: number | null;
  [key: string]: unknown;
  seasonRaw?: number;
  rk?: string;
  fixed?: boolean;
  syncPartial?: boolean;
  id?: string | number;
}

/** Relevé prêt pour l'affichage : horodatage numérique valide obligatoire à l'exécution. */
export interface DisplayVmiRecord extends VmiRecord {
  t: number;
}

/** Snapshot des conteneurs persistés. Les éléments restent bruts à cette frontière ; leur validation appartient aux modules dédiés. */
export interface StoreSnapshot {
  history: unknown[];
  live: unknown[];
  energyReadings: unknown[];
  meta: UnknownRecord;
}

/** Entrée validée du moteur graphique ; les relevés restent inchangés et chronologiques. */
export interface ChartViewModel {
  records: DisplayVmiRecord[];
  selectedDate: string | null;
}

export type NullableNumber = number | null;
export type UnknownRecord = Record<string, unknown>;

export interface AnalysisOptions {
  minSamples?: number;
  minDays?: number;
  maxGapMinutes?: number;
  maxGapHours?: number;
  periodDays?: number;
  targetRH?: number;
  temperatureMargin?: number;
  minSamplesPerDay?: number;
  minDaysPerWindow?: number;
  minEnergyDays?: number;
  changeThreshold?: number;
  dryDelta?: number;
  trendDelta?: number;
  threshold?: number;
}

export type EnergyMeterType = 'ventilation' | 'preheating' | 'total';
export interface EnergyReading {
  id: string;
  meterType: EnergyMeterType;
  t: number;
  kwh: number;
  note?: string;
}

export interface PsychrometricResult {
  haIn: NullableNumber;
  haOut: NullableNumber;
  dewIn: NullableNumber;
  dewOut: NullableNumber;
}

export interface SeasonalVentilationSummary {
  status: 'available' | 'insufficient-data';
  currentSeason: 'hiver' | 'été' | 'intersaison' | null;
  latestAt: number | null;
  seasons: Array<{
    season: 'été' | 'hiver' | 'intersaison';
    sampleCount: number;
    dayCount: number;
    thermalSampleCount: number;
    medianOutdoorMinusIndoor: NullableNumber;
    medianHumidityDelta: NullableNumber;
    opportunityDayCount: number;
    opportunityDays: string[];
    enough: boolean;
    codeCounts: Record<string, number>;
  }>;
  advice: string;
  minSamples: number;
  minDays: number;
  temperatureMargin: number;
  limits: string[];
}

export interface EnergySummary {
  readingCount: number;
  meters: Array<{
    meterType: EnergyMeterType;
    label: string;
    readingCount: number;
    firstAt: number | null;
    lastAt: number | null;
    measuredIntervalCount: number;
    totalKwh: number;
    intervals: Array<{
      from: number;
      to: number;
      elapsedHours: number;
      previousKwh: number;
      currentKwh: number;
      deltaKwh: NullableNumber;
      averagePowerW: NullableNumber;
      status: 'measured' | 'counter-decreased';
    }>;
  }>;
  limits: string[];
}

export interface MonthlyEnergySummary {
  meterType: EnergyMeterType;
  label: string;
  months: Array<{
    month: string;
    energyKwh: number;
    intervalCount: number;
    firstAt: number;
    lastAt: number;
  }>;
  crossMonthIntervalCount: number;
  crossMonthKwh: number;
}

export interface TransientSpikeSummary {
  count: number;
  candidates: Array<{
    key: string; label: string; timestamp: number; value: number;
    previousValue: number; nextValue: number; unit: '%' | '°C';
    deviation: number; gapBeforeMinutes: number; gapAfterMinutes: number;
  }>;
  maxGapMinutes: number;
  thresholds: {
    temperatureSpike: number; temperatureNeighborDifference: number;
    humiditySpike: number; humidityNeighborDifference: number;
  };
}
export interface DataQualitySummary {
  total: number;
  affectedRecords: number;
  invalidRecords: number;
  placeholderRecords: number;
  fields: Array<Record<string, unknown>>;
  fieldCoverage: Array<Record<string, unknown>>;
  coreSensorKeys: string[];
  completeHygrometricRecords: number;
  incompleteHygrometricRecords: number;
  hygrometricCoveragePercent: number;
  hasAnomalies: boolean;
  transientSpikes: TransientSpikeSummary;
}
export interface VmiBluetoothDevice {
  id: string;
  name?: string | null;
  gatt?: { connected?: boolean } | null;
}

export interface HygrometricPeriodsResult {
  sampleCount:number; intervalCount:number; gapCount:number; medianDelta:number|null;
  threshold:number; maxGapHours:number; observedDurationMs:number;
  dryDurationMs:number; humidDurationMs:number; neutralDurationMs:number;
  longestDryMs:number; longestHumidMs:number;
}
export interface DailyTrendDay {
  date:string; sampleCount:number; medianRH:number|null;
  medianTemperature:number|null; medianAbsoluteHumidity:number|null;
}
export interface DailyTrendsResult {
  days:DailyTrendDay[]; sampledDays:number; latest:DailyTrendDay|null;
  previous:DailyTrendDay|null; changeRH:number|null; changeAbsoluteHumidity:number|null;
}
export interface HourlyPatternBucket {
  label:string; startHour:number; sampleCount:number;
  medianRH:number|null; medianDelta:number|null;
}
export interface HourlyPatternsResult { buckets:HourlyPatternBucket[]; minSamples:number; }
export interface RapidChangeEvent {
  start:number; end:number; gapMs:number; deltaRH:number;
  deltaAbsoluteHumidity:number; reasons:string[];
}
export interface HygrometricDiagnosisResult {
  [key:string]: unknown;
  status:string; sampleCount:number; dayCount:number; observedHours:number;
  coverageLevel:string; excludedGapCount:number; largestExcludedGapHours:number;
  maxGapHours:number;
  observations:Array<{code:string;level:string;basis:Record<string,unknown>;title:string;detail:string;recommendation:string}>;
  confidenceBasis:{observedCoveragePercent:number|null;acceptedSampleShare:number;daysWithAtLeastThreeSamples:number;minimumDailySamples:number};
}

export interface SpeedLevelGroup {
  v:number;n:number;daysCovered:number;rh:number|null;ha:number|null;delta:number|null;
  dryingShare:number|null;rpm:number|null;rpmSamples:number;deltaSamples:number;
  firstAt:number|null;lastAt:number|null;spanHours:number;sharedDays:number;
}
export interface SpeedLevelResult {
  groups:SpeedLevelGroup[];status:string;bestSpeed:null;minSamples:number;targetRH:number;
  sampleCount:number;comparableGroups:number;
}
export interface DailySpeedStats {
  medianRH:number|null;medianIndoorHA:number|null;medianIncomingHA:number|null;
  medianDeltaHA:number|null;deltaSamples:number;medianRPM:number|null;rpmSamples:number;
  dayCount:number;daily:Array<{sampleCount:number;medianRH:number|null;medianIndoorHA:number|null;medianIncomingHA:number|null;medianDeltaHA:number|null;deltaSamples:number;medianRPM:number|null;rpmSamples:number}>;
}
export interface SpeedTimeComparison {
  bucket:number;label:string;speeds:[number,number];sharedDayCount:number;
  sampleCountFirst:number;sampleCountSecond:number;ready:boolean;reason:string|null;
  first:DailySpeedStats|null;second:DailySpeedStats|null;
  medianIncomingHADifference:number|null;medianDeltaHADifference:number|null;sharedDayKeys:string[];
}
export interface SpeedTimeContextResult {
  groups:Array<Record<string,unknown>>;comparisons:SpeedTimeComparison[];
  minSamples:number;minDays:number;comparableBuckets:number[];
}
export interface EnergyReadinessField {
  key:string;label:string;unit:string;verified:boolean;count:number;zeroCount:number;
  nonZeroCount:number;missingCount:number;min:number|null;max:number;distinct:number[];
}
export interface EnergyReadinessResult {
  total:number;fields:EnergyReadinessField[];hasVerifiedElectricalEnergy:false;message:string;
}
export interface OperatingReferenceResult {
  status:string;minSamples:number;
  groups:Array<{mode:number;sampleCount:number;dayCount:number;firstAt:number|null;lastAt:number|null;ready:boolean;
    fields:Array<{key:string;label:string;unit:string;verified:boolean;count:number;median:number|null;min:number|null;max:number|null;medianAbsoluteDeviation:number|null}>}>;
  limits:string[];
}
export interface TemperatureLimitResult {
  status:string;minimumGroupSamples:number;minimumGroupDays:number;inputSampleCount:number;
  eligibleSampleCount:number;missingOutdoorTemperatureCount:number;
  thresholds:Array<{threshold:number;sampleCount:number;aboveThresholdCount:number;atOrBelowThresholdCount:number;
    modes:Array<{mode:number;above:{sampleCount:number;dayCount:number;medianOutdoorTemp:number|null};
      atOrBelow:{sampleCount:number;dayCount:number;medianOutdoorTemp:number|null};sharedDayCount:number;
      pairedAbove:{sampleCount:number;dayCount:number;medianDebit:number|null;medianRPM:number|null};
      pairedAtOrBelow:{sampleCount:number;dayCount:number;medianDebit:number|null;medianRPM:number|null};comparable:boolean}>}>;
  limits:string[];
}
export interface AssistantSummary {
  status:'no-data'|'available'|'limited';title:string;overview:string;confidence:string;
  sampleCount?:number;acceptedSampleCount?:number;period?:string;targetRH?:number;minSamples?:number;
  sections:Array<{id:string;title:string;status:string;summary:string;details:string[]}>;
  recommendations:Array<{priority:string;title:string;text:string;reason:string}>;
  limits:string[];
}

export interface FanEnergyEstimateResult {
  status:string;sampleCount:number;firstAt:number|null;lastAt:number|null;observedHours:number;
  coveredHours:number;coveragePercent:number;acceptedIntervalCount:number;longGapCount:number;
  invalidFlowIntervalCount:number;duplicateTimestampCount:number;conflictingTimestampCount:number;
  estimatedWh:number|null;estimatedKwh:number|null;averagePowerW:number|null;maxGapHours:number;limits:string[];
}
export interface FanEnergyByModeResult {
  groups:Array<{mode:number;status:string;estimatedKwh:number|null;coveredHours:number;candidateHours:number;
    coveragePercent:number;weightedAveragePowerW:number|null;medianDailyAveragePowerW:number|null;
    climate:Record<string,number|null>;climateCoverageHours:Record<string,number>;
    dayCount:number;intervalCount:number;longGapCount:number;invalidFlowIntervalCount:number}>;
  hasManualModeData:boolean;transitionIntervalCount:number;duplicateTimestampCount:number;
  conflictingTimestampCount:number;maxGapHours:number;minDays:number;limits:string[];
}
export interface WeeklyDiagnosticResult {
  status:string;periods:Array<{id:string;start:string;end:string;dayCount:number;sampleCount:number;
    medianIndoorHA:number|null;medianIncomingHA:number|null;medianDeltaHA:number|null;
    medianRH:number|null;medianTemperature:number|null;energyCoveredDays:number;
    estimatedFanKwh:number|null;fanHours:number|null}>;
  comparison:{indoorHA:number|null;incomingHA:number|null;deltaHA:number|null;relativeHumidity:number|null;temperature:number|null}|null;
  findings?:Array<{type:string;title:string;text:string}>;
  windowDays:number;minSamplesPerDay:number;minDaysPerWindow:number;minEnergyDays?:number;
  maxGapHours?:number;changeThreshold?:number;duplicateTimestampCount:number;conflictingTimestampCount:number;limits?:string[];
}
export interface EnergyClimateMeterContextResult {
  meters:Array<{meterType:EnergyMeterType;label:string;intervals:Array<{
    from:number;to:number;elapsedHours:number;previousKwh:number;currentKwh:number;
    deltaKwh:number|null;averagePowerW:number|null;status:'measured'|'counter-decreased';context:{
      indoorTemp?:number|null;outdoorTemp?:number|null;indoorRH?:number|null;incomingTemp?:number|null;
      incomingRH?:number|null;indoorAbsHumidity?:number|null;incomingAbsHumidity?:number|null;
      deltaAbsHumidity?:number|null;coverageHours:number;coveragePercent:number;coveredMs:number;
      ready:boolean;metricCoverageHours:Record<string,number>
    }
  }>}>;
  historySampleCount:number;maxGapHours:number;minCoveredHours:number;minCoveragePercent:number;
  matchedIntervalCount:number;measuredIntervalCount:number;limits:string[];
}
