/** Met à jour les graphiques de l'historique sélectionné.
 * @param {VmiRecord[]} data Relevés disponibles.
 * @param {string|null} selectedDate Jour affiché au format YYYY-MM-DD, ou null pour toute la période.
 * @param {(id:string)=>HTMLElement|null} $ Fonction de résolution des éléments DOM.
 * @returns {void}
 */
export function renderCharts(data,selectedDate,$){
 drawChart('chartRH','Humidité relative',[
  seriesFor(data,'sh','Salon',COLORS[0],r=>isPlausibleHumidity(r.sh)?r.sh:null,r=>Number.isFinite(r.sh)&&!isPlausibleHumidity(r.sh)),seriesFor(data,'h1','Sonde résistances',COLORS[1],r=>isPlausibleHumidity(r.h1)?r.h1:null,r=>Number.isFinite(r.h1)&&!isPlausibleHumidity(r.h1)),seriesFor(data,'he','Air entrant',COLORS[2],r=>isPlausibleHumidity(r.he)?r.he:null,r=>Number.isFinite(r.he)&&!isPlausibleHumidity(r.he))],selectedDate,$);
 drawChart('chartVmiAbs','Humidité absolue exportée par VMI+ (valeurs brutes, unité à confirmer)',[
  seriesFor(data,'vmiAbsP0','P0 sortie résistance',COLORS[1]),
  seriesFor(data,'vmiAbsP1','P1 entrée air',COLORS[2])],selectedDate,$);
 drawChart('chartHA','Humidité absolue calculée (g/m³)',[
  // Même comparaison que la V13 d'origine : salon contre air entrant.
  // La sonde P0 reste visible dans les graphiques de température et d'humidité relative,
  // mais n'est pas mélangée à cette comparaison psychrométrique.
  seriesFor(data,'sh','Salon',COLORS[0],r=>isPlausibleTemperature(r.st)&&isPlausibleHumidity(r.sh)?absoluteHumidity(r.st,r.sh):null,r=>(Number.isFinite(r.st)&&!isPlausibleTemperature(r.st))||(Number.isFinite(r.sh)&&!isPlausibleHumidity(r.sh))),
  seriesFor(data,'he','Air entrant',COLORS[2],r=>isPlausibleTemperature(r.te)&&isPlausibleHumidity(r.he)?absoluteHumidity(r.te,r.he):null,r=>(Number.isFinite(r.te)&&!isPlausibleTemperature(r.te))||(Number.isFinite(r.he)&&!isPlausibleHumidity(r.he)))],selectedDate,$);
 drawChart('chartTemp','Températures',[
  // Composition historique V13 : salon, P0 et P1. La température extérieure
  // reste conservée dans les données mais n'élargit pas l'échelle de ce graphique.
  seriesFor(data,'st','Salon',COLORS[0],r=>isPlausibleTemperature(r.st)?r.st:null,r=>Number.isFinite(r.st)&&!isPlausibleTemperature(r.st)),
  seriesFor(data,'t1','P0 sortie résistance',COLORS[1],r=>isPlausibleTemperature(r.t1)?r.t1:null,r=>Number.isFinite(r.t1)&&!isPlausibleTemperature(r.t1)),
  seriesFor(data,'te','P1 entrée air',COLORS[2],r=>isPlausibleTemperature(r.te)?r.te:null,r=>Number.isFinite(r.te)&&!isPlausibleTemperature(r.te))],selectedDate,$);
 drawChart('chartRPM','Régime ventilateur',[seriesFor(data,'rpm','Régime',COLORS[0])],selectedDate,$);
 drawChart('chartDebit','Débit VMI+ (m³/h)',[seriesFor(data,'debit','Débit exporté',COLORS[1])],selectedDate,$);
}
