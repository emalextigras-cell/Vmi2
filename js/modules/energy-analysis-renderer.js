/**
 * Renderers des analyses énergétiques et temporelles.
 * Les calculs métier et les éléments DOM sont injectés par l'orchestrateur.
 */

export function renderFanEnergyEstimate(data,{fanEnergyEstimate,fanEnergyByMode,summarizeFanEnergyEstimate,summarizeFanEnergyByManualMode,format,formatShort}){
 const box=fanEnergyEstimate;
 if(!box)return;
 const result=summarizeFanEnergyEstimate(data);
 const duplicateNotice=(result.duplicateTimestampCount||result.conflictingTimestampCount)
  ? 'Horodatages : '+result.duplicateTimestampCount+' groupe(s) avec doublons, dont '+result.conflictingTimestampCount+' contradictoire(s) écarté(s). Les doublons identiques sont comptés une seule fois.'
  : 'Aucun doublon d’horodatage détecté.';
 box.className='advice';
 if(result.status!=='estimated'){
  box.textContent=(result.sampleCount<2
   ?'Il faut au moins deux relevés historiques avec un débit VMI+ exploitable pour établir une estimation.'
   :'Aucun intervalle exploitable : vérifie que le débit est compris entre 50 et 350 m³/h et que deux relevés successifs sont espacés de 2 h maximum.')+' '+duplicateNotice;
  const modeBox=fanEnergyByMode;
  if(modeBox){
   const byMode=summarizeFanEnergyByManualMode(data);
   const modeStatus=byMode.hasManualModeData
    ? 'Comparaison par mode non affichée car aucune estimation ventilateur globale exploitable.'
    : 'Pas de champ « Mode » manuel identifié dans cet historique.';
   modeBox.textContent=modeStatus+' Horodatages : '+byMode.duplicateTimestampCount+' groupe(s) avec doublons, dont '+byMode.conflictingTimestampCount+' contradictoire(s) écarté(s).';
  }
  return;
 }
 const coverage=result.coveragePercent;
 const coverageLabel=coverage>=80?'couverture correcte':coverage>=50?'couverture partielle':'couverture faible';
 box.innerHTML='<div class="grid cols3">'+
  '<div class="metric"><b>'+format(result.estimatedKwh)+' kWh</b><span>Énergie estimée du ventilateur</span></div>'+
  '<div class="metric"><b>'+format(result.averagePowerW)+' W</b><span>Puissance moyenne estimée</span></div>'+
  '<div class="metric"><b>'+format(coverage)+' %</b><span>Couverture ('+coverageLabel+')</span></div></div>'+
  '<p class="note">Période : '+formatShort(result.firstAt)+' → '+formatShort(result.lastAt)+' · '+format(result.coveredHours)+' h intégrées sur '+format(result.observedHours)+' h · '+result.acceptedIntervalCount+' intervalle(s) retenu(s).</p>'+
  '<p class="note">'+duplicateNotice+'</p>'+
  '<p class="note">Il s’agit d’une estimation du ventilateur, pas d’une mesure électrique directe. La pression réelle du réseau, l’état du filtre et les conditions d’installation peuvent modifier la puissance absorbée.</p>'+
  '<p class="note"><strong>Préchauffage et total VMI : non estimables avec les champs actuellement validés.</strong> Le champ « Cons Res » n’est pas converti en watts ou en kWh.</p>'+
  '<details><summary>Méthode et limites</summary><ul>'+result.limits.map(item=>'<li>'+item+'</li>').join('')+'</ul><p class="note">Référence : notice officielle PUREVENT, valeurs de puissance mesurées par TÜV SÜD à 50, 125, 200, 245 et 350 m³/h.</p></details>';
  const modeBox=fanEnergyByMode;
  if(modeBox){
   const byMode=summarizeFanEnergyByManualMode(data);
   const modeNotice=(byMode.duplicateTimestampCount||byMode.conflictingTimestampCount)
    ? 'Horodatages : '+byMode.duplicateTimestampCount+' groupe(s) avec doublons, dont '+byMode.conflictingTimestampCount+' contradictoire(s) écarté(s). Les doublons identiques sont comptés une seule fois.'
    : 'Aucun doublon d’horodatage détecté.';
   if(!byMode.hasManualModeData){
    modeBox.textContent='Pas de champ « Mode » manuel identifié dans cet historique. Les codes bruts VMI+ ne sont pas utilisés pour inventer les niveaux 1/2/3. '+modeNotice;
   }else{
    let table='<div class="table-wrap"><table><thead><tr><th>Mode manuel</th><th>Énergie estimée</th><th>Puissance moyenne quotidienne médiane</th><th>Heures intégrées</th><th>Jours</th><th>Couverture</th><th>Conditions moyennes</th></tr></thead><tbody>';
    for(const group of byMode.groups){
     table+='<tr><td>'+group.mode+'</td><td>'+(group.estimatedKwh==null?'–':format(group.estimatedKwh)+' kWh')+'</td><td>'+(group.medianDailyAveragePowerW==null?'–':format(group.medianDailyAveragePowerW)+' W')+'</td><td>'+format(group.coveredHours)+' h</td><td>'+group.dayCount+'</td><td>'+format(group.coveragePercent)+' %</td><td>'+((group.climate.deltaAbsHumidity==null)?'Non disponible':'Intérieur '+format(group.climate.indoorTemp)+' °C · extérieur '+format(group.climate.outdoorTemp)+' °C · écart humidité absolue '+format(group.climate.deltaAbsHumidity)+' g/m³')+'</td></tr>';
    }
    table+='</tbody></table></div>';
    modeBox.innerHTML=table+'<p class="note">'+modeNotice+'</p><p class="note">Les changements de mode, les trous de plus de '+byMode.maxGapHours+' h et les débits hors plage sont exclus. '+byMode.transitionIntervalCount+' intervalle(s) traversant un changement de mode ignoré(s).</p><p class="note">La puissance moyenne est la médiane des moyennes journalières afin que les journées aient le même poids. Une comparaison nécessite au moins '+byMode.minDays+' jours par mode ; les lignes avec moins de jours restent descriptives.</p>';
   }
  }
}

export function renderDailyEnergyClimateContext(data,{dailyEnergyClimateContext,summarizeDailyEnergyClimateContext,format}){
 const box=dailyEnergyClimateContext;
 if(!box)return;
 const result=summarizeDailyEnergyClimateContext(data);
 const duplicateNotice=(result.duplicateTimestampCount||result.conflictingTimestampCount)
  ? 'Contrôle des horodatages : '+result.duplicateTimestampCount+' groupe(s) avec doublons détecté(s), dont '+result.conflictingTimestampCount+' groupe(s) contradictoire(s) écarté(s). Les doublons identiques sont comptés une seule fois.'
  : 'Aucun doublon d’horodatage détecté dans les données analysées.';
 if(result.status!=='available'){
  box.className='advice';
  box.textContent='Rapprochement encore insuffisant : '+result.matchedDayCount+' jour(s) disposent à la fois d’au moins '+result.minFanHours+' h de puissance ventilateur estimée et de '+result.minClimateSamples+' relevés hygrométriques valides. Il en faut '+result.minDays+' pour afficher une comparaison journalière. '+duplicateNotice;
  return;
 }
 const rows=result.matchedDays.slice(-7);
 let html='<p class="note">'+result.matchedDayCount+' jour(s) apparié(s) · seuils : '+result.minFanHours+' h d’estimation ventilateur et '+result.minClimateSamples+' relevés hygrométriques par jour. Derniers jours disponibles :</p>';
 html+='<p class="note">'+duplicateNotice+'</p>';
 html+='<div class="table-wrap"><table><thead><tr><th>Jour</th><th>Ventilateur estimé</th><th>Puissance moyenne estimée</th><th>HA intérieure médiane</th><th>HA air entrant médiane</th><th>Écart intérieur − entrant</th></tr></thead><tbody>';
 for(const item of rows){
  const dateParts=item.date.split('-').map(Number);
  const label=new Date(dateParts[0],dateParts[1]-1,dateParts[2]).toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit',month:'2-digit'});
  const value=(number,unit)=>number==null?'–':format(number)+' '+unit;
  html+='<tr><td>'+label+'</td><td>'+value(item.estimatedKwh,'kWh')+'<br><small>'+format(item.fanHours)+' h intégrées</small></td><td>'+value(item.averagePowerW,'W')+'</td><td>'+value(item.medianIndoorAbsHumidity,'g/m³')+'</td><td>'+value(item.medianIncomingAbsHumidity,'g/m³')+'</td><td>'+value(item.medianDeltaAbsHumidity,'g/m³')+'</td></tr>';
 }
 html+='</tbody></table></div><p class="note">Lecture : ce tableau met côte à côte des observations des mêmes journées. Il ne démontre pas qu’une puissance plus élevée assèche davantage le logement et ne calcule pas de rendement. L’énergie est estimée à partir du débit et de la courbe constructeur, pas mesurée directement.</p>';
 html+='<details><summary>Critères et limites</summary><ul>'+result.limits.map(item=>'<li>'+item+'</li>').join('')+'</ul></details>';
 box.className='advice';
 box.innerHTML=html;
}

export function renderWeeklyDiagnostic(data,{weeklyDiagnostic,summarizeWeeklyDiagnostic,format}){
 const box=weeklyDiagnostic;
 if(!box)return;
 const result=summarizeWeeklyDiagnostic(data);
 const duplicateSummary=(result.duplicateTimestampCount||result.conflictingTimestampCount)
  ? '<p class="note">Contrôle des horodatages : '+(result.duplicateTimestampCount||0)+' horodatage(s) répété(s), dont '+(result.conflictingTimestampCount||0)+' avec des valeurs contradictoires. Les doublons identiques ne sont comptés qu’une fois ; les horodatages contradictoires sont exclus des calculs.</p>'
  : '';
 if(result.status==='no-data'){
  box.className='advice';
  box.innerHTML='<p>Aucun historique horodaté exploitable pour établir un bilan hebdomadaire.</p>'+duplicateSummary;
  return;
 }
 const formatValue=(number,unit)=>number==null?'–':format(number)+' '+unit;
 const periodLabel=period=>{
  const start=new Date(period.start+'T12:00:00');
  const end=new Date(period.end+'T12:00:00');
  return start.toLocaleDateString('fr-FR')+' au '+end.toLocaleDateString('fr-FR');
 };
 if(result.status!=='available'){
  box.className='advice';
  box.innerHTML='<p>Comparaison hebdomadaire non disponible : il faut au moins '+result.minDaysPerWindow+' journées exploitables dans chacune des deux fenêtres de '+result.windowDays+' jours.</p>'+
   '<ul>'+result.periods.map(period=>'<li><b>'+(period.id==='previous'?'Semaine précédente':'Semaine récente')+'</b> · '+periodLabel(period)+' : '+period.dayCount+' / '+result.minDaysPerWindow+' jours exploitables, '+period.sampleCount+' relevés complets.</li>').join('')+'</ul>'+
   '<p class="note">Les périodes ne sont pas rapprochées lorsqu’une couverture minimale manque. Les trous de plusieurs jours ne sont pas comblés.</p>'+duplicateSummary;
  return;
 }
 let html='<p class="note">Comparaison des deux fenêtres calendaires de '+result.windowDays+' jours, ancrées sur la date du dernier relevé. Chaque journée a le même poids dans les médianes.</p>'+duplicateSummary;
 html+='<div class="table-wrap"><table><thead><tr><th>Période</th><th>Jours / relevés</th><th>HA intérieure</th><th>HA air entrant</th><th>Écart intérieur − entrant</th><th>HR intérieure</th><th>Température</th><th>Ventilateur estimé</th></tr></thead><tbody>';
 for(const period of result.periods){
  const energy=period.estimatedFanKwh==null?'–':format(period.estimatedFanKwh)+' kWh ('+period.energyCoveredDays+' j)';
  html+='<tr><td>'+(period.id==='previous'?'Précédente':'Récente')+'<br><small>'+periodLabel(period)+'</small></td>'+
   '<td>'+period.dayCount+' j · '+period.sampleCount+'</td>'+
   '<td>'+formatValue(period.medianIndoorHA,'g/m³')+'</td>'+
   '<td>'+formatValue(period.medianIncomingHA,'g/m³')+'</td>'+
   '<td>'+formatValue(period.medianDeltaHA,'g/m³')+'</td>'+
   '<td>'+formatValue(period.medianRH,'%')+'</td>'+
   '<td>'+formatValue(period.medianTemperature,'°C')+'</td>'+
   '<td>'+energy+'</td></tr>';
 }
 html+='</tbody></table></div>';
 const change=result.comparison;
 html+='<h4>Constats entre les deux périodes</h4><ul>'+result.findings.map(item=>'<li><b>'+item.title+'</b> : '+item.text+'</li>').join('')+'</ul>';
 html+='<p class="note">Évolution des médianes : HA intérieure '+formatValue(change.indoorHA,'g/m³')+' · air entrant '+formatValue(change.incomingHA,'g/m³')+' · écart intérieur − entrant '+formatValue(change.deltaHA,'g/m³')+'.</p>';
 html+='<details><summary>Critères et limites de lecture</summary><ul>'+result.limits.map(item=>'<li>'+item+'</li>').join('')+'</ul></details>';
 box.className='advice';
 box.innerHTML=html;
}
