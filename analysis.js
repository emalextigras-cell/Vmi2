/* Comparaison prudente par vitesse (médianes) */
function median(a){const x=a.filter(Number.isFinite).sort((p,q)=>p-q);if(!x.length)return null;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2}
function analyzeSpeeds(data){
 const min=Number($('minSamples').value),target=Number($('targetRH').value);
 const rows=data.filter(r=>Number.isFinite(r.vit)&&r.vit>=1&&r.vit<=3&&Number.isFinite(r.sh)&&Number.isFinite(r.st));
 const groups=[1,2,3].map(v=>{
  const a=rows.filter(r=>r.vit===v);
  return {v,n:a.length,rh:median(a.map(r=>r.sh)),ha:median(a.map(r=>absoluteHumidity(r.st,r.sh))),delta:median(a.map(r=>{const x=absoluteHumidity(r.st,r.sh),y=absoluteHumidity(r.te,r.he);return x!=null&&y!=null?x-y:null}))};
 });
 let html='<table><thead><tr><th>Vitesse</th><th>Relevés</th><th>HR médiane</th><th>HA salon</th><th>Écart HA</th></tr></thead><tbody>';
 for(const g of groups)html+=`<tr><td>${g.v}</td><td>${g.n}</td><td>${g.rh==null?'–':fmt(g.rh)+' %'}</td><td>${g.ha==null?'–':fmt(g.ha)+' g/m³'}</td><td>${g.delta==null?'–':fmt(g.delta)+' g/m³'}</td></tr>`;
 html+='</tbody></table>';
 const sufficient=groups.filter(g=>g.n>=min);
 const comparable=sufficient.length>=2;
 let advice='';
 if(!rows.length)advice='Aucun relevé de la période ne contient la vitesse : seuls les relevés de l\'enregistrement en direct l\'enregistrent. Choisis la source « En direct » une fois que quelques relevés ont été pris.';
 else if(!comparable)advice=`Il faut au moins ${min} relevés pour au moins deux vitesses différentes afin de comparer les résultats. Continue l'enregistrement en direct.`;
 else{
  const best=sufficient.filter(g=>g.rh!=null&&g.rh<=target).sort((a,b)=>a.v-b.v)[0];
  if(best)advice=`Parmi les vitesses disposant d'au moins ${min} relevés, la vitesse ${best.v} est la plus basse dont l'humidité relative médiane observée est inférieure ou égale à ${target} %. C'est une piste à vérifier sur des périodes comparables, pas une preuve d'optimum.`;
  else advice=`Aucune vitesse suffisamment documentée ne présente une humidité relative médiane inférieure ou égale à ${target} %. Vérifie aussi les sources d'humidité et la représentativité des périodes.`;
 }
 $('speedAnalysis').innerHTML=html+`<div class="advice">${advice}</div>`;
}
function renderRecommendation(data){
 const box=$('recommendation');
 const valid=data.filter(r=>Number.isFinite(r.st)&&Number.isFinite(r.sh)&&Number.isFinite(r.te)&&Number.isFinite(r.he));
 box.className='advice';
 if(!valid.length){box.textContent='Pas assez de données valides. Connecte la VMI et laisse-la enregistrer plusieurs relevés, ou importe un historique.';return}
 const recent=valid.slice(-Math.min(24,valid.length));
 const rh=median(recent.map(r=>r.sh)),ha=median(recent.map(r=>absoluteHumidity(r.st,r.sh))),haIn=median(recent.map(r=>absoluteHumidity(r.te,r.he)));
 const target=Number($('targetRH').value),delta=ha-haIn;
 let msg=`Sur les ${recent.length} derniers relevés exploitables : humidité relative médiane du salon ${fmt(rh)} %, humidité absolue du salon ${fmt(ha)} g/m³. `;
 if(rh>target+5)msg+=`L'humidité est au-dessus de ton objectif de ${target} %. Vérifie d'abord les sources de vapeur d'eau, les entrées d'air, les bouches d'extraction et l'état du filtre. `;
 else if(rh<target-5)msg+=`L'humidité est sous ton objectif de ${target} %. Il n'y a pas d'indice hygrométrique justifiant à lui seul d'augmenter la ventilation. `;
 else msg+=`L'humidité est proche de ton objectif de ${target} %. `;
 if(Number.isFinite(delta)){
  if(delta>1)msg+=`L'air entrant est actuellement plus sec en humidité absolue d'environ ${fmt(delta)} g/m³ : le renouvellement d'air a un potentiel d'assèchement.`;
  else if(delta< -1)msg+=`L'air entrant est actuellement plus humide en valeur absolue d'environ ${fmt(Math.abs(delta))} g/m³ : augmenter la vitesse ne garantit pas d'assécher le logement.`;
  else msg+="L'air entrant et l'air intérieur ont des humidités absolues proches.";
 }
 box.textContent=msg;
}
function render(){
 const data=selectedData();
 $('liveCount').textContent=live.length;
 $('historyStatus').textContent=`${data.length} relevés affichés · ${source==='live'?'enregistrement local en direct':'historique importé / VMI'} · ${selectedDate?'jour '+selectedDate:(daysSetting?daysSetting+' derniers jours':'toute la période')}`;
 renderHistoryDiagnostics(data);
 const lastRpm=[...hist].reverse().find(r=>Number.isFinite(r.rpm));
 $('rpm').textContent=lastRpm?lastRpm.rpm:'–';
 renderCharts(data);renderRecommendation(data);analyzeSpeeds(data);
}
$('targetRH').onchange=render;$('minSamples').onchange=render;
$('interpolateToggle').onchange=render;
