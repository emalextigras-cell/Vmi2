/** @typedef {import('../types/vmi-types.js').UnknownRecord} UnknownRecord */
/** @typedef {import('../types/vmi-types.js').VmiRecord} VmiRecord */

/**
 * Validation structurelle minimale d'une ligne d'historique Bluetooth VMI+.
 * On ne fixe pas un nombre total de colonnes : les champs optionnels peuvent varier.
 * La date et le compteur de jours (colonne 12, index 11) sont indispensables
 * au rapprochement/dédoublonnage et à la correction d'horloge.
 */
/** Valide et décode une ligne d'historique Bluetooth.
 * @param {string} line Ligne brute reçue.
 * @returns {{valid: true, fields: string[]}|{valid: false, reason: string}} Résultat de validation.
 */
export function validateBluetoothHistoryRow(line) {
  if (typeof line !== 'string' || !line.trim()) return { valid: false, reason: 'empty' };
  const fields = line.split(';');
  if (fields.length < 12) return { valid: false, reason: 'truncated' };

  const match = fields[0].match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) return { valid: false, reason: 'date-format' };
  const [, dd, mm, yyyy, hh, min, ss] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
  if (date.getFullYear() !== Number(yyyy) || date.getMonth() !== Number(mm) - 1 ||
      date.getDate() !== Number(dd) || date.getHours() !== Number(hh) ||
      date.getMinutes() !== Number(min) || date.getSeconds() !== Number(ss)) {
    return { valid: false, reason: 'date-invalid' };
  }

  const duration = fields[11].trim().replace(',', '.');
  if (!duration || !Number.isFinite(Number(duration)) || Number(duration) < 0) {
    return { valid: false, reason: 'duration-invalid' };
  }
  return { valid: true, fields };
}
