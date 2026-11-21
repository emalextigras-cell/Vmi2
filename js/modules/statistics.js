/** Statistiques numériques communes aux analyses VMI. */
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
