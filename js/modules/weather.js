/** Compatibilité avec une ancienne version en cache : la météo a été retirée de l’interface. */
export function setupWeather({ button, status, output } = {}) {
  // Les anciennes pages peuvent encore importer ce module après le retrait du panneau.
  // Ne rien faire si les éléments météo n’existent plus dans la page actuelle.
  if (!button || !status || !output) return;
}
