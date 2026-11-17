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
