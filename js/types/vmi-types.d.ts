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
