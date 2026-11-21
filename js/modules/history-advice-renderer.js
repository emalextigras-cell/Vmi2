/**
 * Rendu des conseils et de la fraîcheur de l'historique.
 * Ce module ne possède aucun état applicatif : les données et fonctions métier
 * lui sont fournies par l'orchestrateur.
 */

/** @param {{container:HTMLElement|null,history:Array<Object>,metadata:Object,now?:number,dayMs:number,minValid:number,formatShort:Function}} input */
export function renderHistoryFreshness({ container, history, metadata, now = Date.now(), dayMs, minValid, formatShort }){
 if(!container)return;
 const box=container;
 const rows=history.filter(r=>r.t>=minValid&&r.t<=now);
 if(!rows.length){box.className='advice';box.textContent='Aucun historique mémorisé. Connecte la VMI pour le télécharger : elle ne garde que ses 800 derniers relevés (environ 4 semaines).';return}
 const newest=rows[rows.length-1].t,age=(now-newest)/dayMs;
 const spanDays=Math.max(1,Math.min(14,(newest-rows[0].t)/dayMs));
 const perDay=rows.filter(r=>r.t>=newest-14*dayMs).length/spanDays;
 const cap=perDay>0?Math.min(60,Math.max(7,800/perDay)):28;
 const left=cap-age;
 let cls='advice good';
 let msg=`Historique à jour jusqu’au ${formatShort(newest)} (il y a ${age<1?Math.max(0,Math.round(age*24))+' h':age.toFixed(1)+' j'}). La VMI garde environ ${Math.round(cap)} jours de relevés : télécharge avant le ${formatShort(newest+cap*dayMs)}.`;
 if(left<=1){cls='advice warn';msg+=' ⚠ Des relevés ont peut-être déjà été écrasés : connecte-toi maintenant.'}
 else if(age>=14||left<7){cls='advice warn';msg+=' Pense à te connecter bientôt.'}
 if(metadata.lastSync)msg+=` Dernière synchronisation : ${formatShort(metadata.lastSync)}.`;
 box.className=cls;box.textContent=msg;
}

/** @param {Array<Object>} data @param {{container:HTMLElement|null,analyzeSeasonalVentilation:Function,format:Function,formatShort:Function}} dependencies */
export function renderSeasonalAdvice(data, { container, analyzeSeasonalVentilation, format, formatShort }){
 const box=container;
 if(!box)return;
 const result=analyzeSeasonalVentilation(data);
 box.className='advice';
 if(result.status!=='available'){
  box.textContent=result.advice;
  return;
 }
 const seasonLabel=result.currentSeason||'non déterminée';
 let html='<p><strong>Saison actuelle de l’historique : '+seasonLabel+'</strong>';
 if(result.latestAt)html+=' · dernier relevé : '+formatShort(result.latestAt);
 html+='</p><p>'+result.advice+'</p>';
 html+='<div class="table-wrap"><table><thead><tr><th>Saison calendrier</th><th>Relevés / jours</th><th>Écart extérieur − intérieur</th><th>Écart HA intérieur − entrant</th><th>Jours avec conditions favorables</th><th>Codes Saison CSV (bruts)</th></tr></thead><tbody>';
 for(const item of result.seasons){
  const codes=Object.entries(item.codeCounts).map(([code,count])=>code+' ('+count+')').join(', ')||'non renseigné';
  const margin=item.medianOutdoorMinusIndoor==null?'–':(item.medianOutdoorMinusIndoor>0?'+':'')+format(item.medianOutdoorMinusIndoor)+' °C';
  const humidity=item.medianHumidityDelta==null?'–':(item.medianHumidityDelta>0?'+':'')+format(item.medianHumidityDelta)+' g/m³';
  html+='<tr><td>'+item.season+'</td><td>'+item.sampleCount+' / '+item.dayCount+'</td><td>'+margin+'</td><td>'+humidity+'</td><td>'+item.opportunityDayCount+'</td><td>'+codes+'</td></tr>';
 }
 html+='</tbody></table></div><details><summary>Comment interpréter ces conseils ?</summary><ul>'+result.limits.map(item=>'<li>'+item+'</li>').join('')+'</ul></details>';
 box.innerHTML=html;
}

/** @param {Array<Object>} data @param {{container:HTMLElement|null,targetRH:number,median:Function,absoluteHumidity:Function,isPlausibleTemperature:Function,isPlausibleHumidity:Function,format:Function}} dependencies */
export function renderRecommendation(data, { container, targetRH, median, absoluteHumidity, isPlausibleTemperature, isPlausibleHumidity, format }){
 const box=container;
 const valid=data.filter(r=>Number.isFinite(r.st)&&isPlausibleTemperature(r.st)&&Number.isFinite(r.sh)&&isPlausibleHumidity(r.sh)&&Number.isFinite(r.te)&&isPlausibleTemperature(r.te)&&Number.isFinite(r.he)&&isPlausibleHumidity(r.he));
 box.className='advice';
 if(!valid.length){box.textContent='Pas assez de données historiques valides. Importe un export VMI+ ou télécharge l’historique depuis la VMI. Le Bluetooth en direct ne sert pas à produire ce diagnostic.';return}
 const recent=valid.slice(-Math.min(24,valid.length));
 const rh=median(recent.map(r=>r.sh)),ha=median(recent.map(r=>absoluteHumidity(r.st,r.sh))),haIn=median(recent.map(r=>absoluteHumidity(r.te,r.he)));
 const target=Number(targetRH),delta=ha-haIn;
 let msg=`Sur les ${recent.length} derniers relevés exploitables : humidité relative médiane du salon ${format(rh)} %, humidité absolue du salon ${format(ha)} g/m³. `;
 if(rh>target+5)msg+=`L'humidité est au-dessus de ton objectif de ${target} %. Vérifie d'abord les sources de vapeur d'eau, les entrées d'air, les bouches d'extraction et l'état du filtre. `;
 else if(rh<target-5)msg+=`L'humidité est sous ton objectif de ${target} %. Il n'y a pas d'indice hygrométrique justifiant à lui seul d'augmenter la ventilation. `;
 else msg+=`L'humidité est proche de ton objectif de ${target} %. `;
 if(Number.isFinite(delta)){
  if(delta>1)msg+=`L'air entrant est actuellement plus sec en humidité absolue d'environ ${format(delta)} g/m³ : le renouvellement d'air a un potentiel d'assèchement.`;
  else if(delta< -1)msg+=`L'air entrant est actuellement plus humide en valeur absolue d'environ ${format(Math.abs(delta))} g/m³ : augmenter la vitesse ne garantit pas d'assécher le logement.`;
  else msg+="L'air entrant et l'air intérieur ont des humidités absolues proches.";
 }
 box.textContent=msg;
}
