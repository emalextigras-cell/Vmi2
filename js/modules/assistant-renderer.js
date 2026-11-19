/** @typedef {import('../types/vmi-types.js').VmiRecord} VmiRecord */
/** @typedef {import('../types/vmi-types.js').EnergyReading} EnergyReading */
/** @typedef {import('../types/vmi-types.js').AssistantSummary} AssistantSummary */

import { buildVmiAssistantSummary } from './assistant-summary.js';
import { renderVmiAssistantView } from './assistant-view.js';

/**
 * Adaptateur de compatibilité conservant l'API appelée actuellement par app.js.
 * Le calcul est réalisé ici ; assistant-view.js ne reçoit que le résultat métier
 * et se limite à sa projection DOM. Cet adaptateur pourra disparaître lorsque
 * app.js appellera séparément le calcul et le renderer.
 * @param {VmiRecord[]} data Historique utilisé par l'assistant.
 * @param {{documentRef?: Document, targetRH?: number, minSamples?: number, energyReadings?: EnergyReading[], meterHistory?: VmiRecord[], onError?: Function}} options Dépendances et paramètres d'analyse.
 * @returns {void}
 */
export function renderVmiAssistant(data, {
  documentRef = globalThis.document,
  targetRH = 50,
  minSamples = 10,
  energyReadings = [],
  meterHistory = [],
  onError = () => {}
} = {}) {
  try {
    const result = buildVmiAssistantSummary(data, {
      targetRH,
      minSamples,
      energyReadings,
      meterHistory
    });
    renderVmiAssistantView(result, { documentRef });
  } catch (error) {
    /** @type {Omit<AssistantSummary, 'status'> & {status:string}} */
    const failure = {
      status: 'error',
      title: 'L’assistant n’a pas pu terminer la synthèse. Les autres analyses de l’application restent disponibles.',
      overview: 'Erreur de synthèse : ' + String(error?.message || error),
      confidence: '',
      recommendations: [],
      sections: [],
      limits: []
    };
    renderVmiAssistantView(failure, { documentRef });
    onError('Assistant VMI : ' + String(error?.message || error));
  }
}
