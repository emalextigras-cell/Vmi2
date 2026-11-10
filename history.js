/* ---------- Dates ----------
   - l'export tableur inverse jour et mois dans les cellules de type date (jour ≤ 12) ;
   - la VMI peut avoir une horloge fausse : le compteur de jours sert à corriger les anciennes dates.
   - les fonctions de diagnostic distinguent les données réellement stockées des données affichées. */
function parseCell(v){
 if(typeof v==='number'&&v>30000&&window.XLSX){
  const c=XLSX.SSF.parse_date_code(v);if(!c)return null;
  const sw=c.d<=12,Y=c.y,Mo=sw?c.d:c.m,Da=sw?c.m:c.d,S=Math.round(c.S);
  return {t:new Date(Y,Mo-1,Da,c.H,c.M,S).getTime(),rk:`${pad(Da)}/${pad(Mo)}/${Y} ${pad(c.H)}:${pad(c.M)}:${pad(S)}`};
 }
 if(typeof v==='string'){
  const m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if(m)return {t:new Date(+m[3],+m[2]-1,+m[1],+m[4],+m[5],+(m[6]||0)).getTime(),rk:`${pad(+m[1])}/${pad(+m[2])}/${m[3]} ${pad(+m[4])}:${m[5]}:${pad(+(m[6]||0))}`};
 }
 return null;
}
function recFrom(r){
 const p=parseCell(r[0]);if(!p)return null;
 const rec={t:p.t,rk:p.rk,d:num(r[11]),st:num(r[117]),sh:num(r[118]),t1:num(r[40]),h1:num(r[41]),te:num(r[43]),he:num(r[44]),rpm:num(r[25]),fil:num(r[20]),vit:null,boost:null,hol:null};
 return ['st','sh','t1','h1','te','he','rpm','fil'].some(k=>rec[k]!=null)?rec:null;
}
const dayNo=t=>{const d=new Date(t);return Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/DAY)};
const modeOf=a=>{const m=new Map();let best,bc=0;for(const x of a){const c=(m.get(x)||0)+1;m.set(x,c);if(c>bc){bc=c;best=x}}return best};
function fixClock(recs){
 const known=hist.concat(recs).filter(r=>r.t>=MIN_VALID&&Number.isFinite(r.d)&&new Date(r.t).getHours()>=10);
 const E0=modeOf(known.map(r=>dayNo(r.t)-r.d));
 const bad=recs.filter(r=>r.t<MIN_VALID).sort((a,b)=>a.t-b.t);
 let fixed=0;
 if(E0!==undefined&&bad.length){
  const eps=[];let cur=[];
  for(const r of bad){if(cur.length&&r.t-cur[cur.length-1].t>3*DAY){eps.push(cur);cur=[]}cur.push(r)}
  if(cur.length)eps.push(cur);
  for(const ep of eps){
   const k=modeOf(ep.filter(r=>Number.isFinite(r.d)&&new Date(r.t).getHours()>=10).map(r=>E0+r.d-dayNo(r.t)));
   if(k===undefined)continue;
   for(const r of ep){const x=new Date(r.t);r.t=new Date(x.getFullYear(),x.getMonth(),x.getDate()+k,x.getHours(),x.getMinutes(),x.getSeconds()).getTime();r.fixed=true;fixed++}
  }
 }
 return {fixed,kept:recs.filter(r=>r.t>=MIN_VALID)};
}
function plural(n,one,many=one+'s'){return n===1?one:many}
function formatDateTime(t){return new Date(t).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})}
function datasetStats(rows){
 const valid=rows.filter(r=>r&&Number.isFinite(r.t)&&r.t>=MIN_VALID).sort((a,b)=>a.t-b.t);
 if(!valid.length)return {count:0,first:null,last:null,days:0,gaps:0};
 let gaps=0;
 for(let i=1;i<valid.length;i++)if(valid[i].t-valid[i-1].t>6*3600000)gaps++;
 return {count:valid.length,first:valid[0].t,last:valid.at(-1).t,days:(valid.at(-1).t-valid[0].t)/DAY,gaps};
}
function renderHistoryDiagnostics(data){
 const el=$('historyDiagnostics');if(!el)return;
 const rows=source==='live'?live:hist, st=datasetStats(rows), shown=data.length;
 if(!st.count){el.className='advice diagnostic';el.textContent='Aucun relevé daté valide dans cette source.';return}
 const period=st.days<1?`${Math.round(st.days*24)} h`:`${st.days.toFixed(1)} jours`;
 const age=st.last?Math.max(0,(Date.now()-st.last)/DAY):0;
 let msg=`Base locale : ${st.count} ${plural(st.count,'relevé','relevés')} valides, du ${formatDateTime(st.first)} au ${formatDateTime(st.last)}, soit ${period} couverts.`;
 msg+=` ${shown} ${plural(shown,'relevé','relevés')} sont affichés selon le filtre actuel.`;
 if(st.gaps)msg+=` ${st.gaps} interruption${st.gaps>1?'s':''} de plus de 6 h détectée${st.gaps>1?'s':''}.`;
 if(source==='hist'&&age>30)msg+=' Attention : le dernier relevé date de plus de 30 jours.';
 if(st.count<=300)msg+=' Ce nombre peut correspondre à la mémoire historique limitée de la VMI ou à un export partiel ; il ne permet pas de prouver que la VMI conserve les données depuis octobre 2025.';
 el.className='advice diagnostic';el.textContent=msg;
}
function ingest(recs,label){
 const {fixed,kept}=fixClock(recs);
 const before=hist.length;
 const map=new Map(hist.map(r=>[r.t,r]));
 kept.forEach(r=>map.set(r.t,r));
 hist=[...map.values()].sort((a,b)=>a.t-b.t);
 pruneHist();dbSet('hist',hist);source='hist';selectedDate=null;$('dayPicker').value='';
 const lost=recs.length-kept.length,newCount=Math.max(0,hist.length-before);
 $('importInfo').textContent=`${label} : ${recs.length} ${plural(recs.length,'relevé lu','relevés lus')}, ${newCount} ${plural(newCount,'nouveau relevé','nouveaux relevés')} ajouté${newCount>1?'s':''}${fixed?`, dont ${fixed} date${fixed>1?'s':''} corrigée${fixed>1?'s':''}`:''}${lost?`, ${lost} ignoré${lost>1?'s':''} (date invalide impossible à corriger)`:''}.`;
 log($('importInfo').textContent);
 render();
}
/* Téléchargement de l'historique : arrêt au premier relevé déjà connu. */
const sigOf=r=>r.rk+'|'+r.d;
function parseDownloadLine(line){
 if(!download.on||!/^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2};/.test(line))return;
 const f=line.split(';'),p=parseCell(f[0]);if(!p)return;
 if(download.sigs.size&&download.sigs.has(p.rk+'|'+num(f[11]))){finishDownload(true);return}
 const rec=recFrom(f);if(rec)download.rows.push(rec);
}
function armDownloadTimeout(){clearTimeout(download.timeout);download.timeout=setTimeout(()=>{if(download.on)finishDownload(false,true)},20000)}
function finishDownload(reachedCut,timeout=false){
 if(!download.on)return;download.on=false;clearTimeout(download.timeout);
 const count=download.rows.length;if(count)ingest(download.rows,'Téléchargement');
 $('dlh').disabled=false;setCommandsDisabled(false);
 $('dlp').textContent=`Terminé : ${count} ${plural(count,'nouveau relevé lu','nouveaux relevés lus')}${reachedCut?' · historique à jour':timeout?(download.got?' · arrêt après une pause de 20 s':' · aucune réponse de la VMI'):(download.sigs.size?' · attention : trou possible avant la dernière ligne mémorisée':' · historique complet')}`;
 if(reachedCut&&dev&&dev.gatt&&dev.gatt.connected){disconnectAfterDownload=true;dev.gatt.disconnect()}
}
function abortDownload(message){
 if(!download.on)return;download.on=false;clearTimeout(download.timeout);$('dlh').disabled=false;setCommandsDisabled(false);$('dlp').textContent=message;log(message);
}
async function startDownload(auto=false){
 if(!chC){if(!auto)showError('Connecte-toi d’abord à la VMI.');return}if(download.on)return;
 showError('');dlFrames=0;download={on:true,rows:[],buf:'',total:0,sigs:new Set(hist.filter(r=>r.rk&&Number.isFinite(r.d)).map(sigOf)),got:false,lastPacket:Date.now(),timeout:null};
 $('dlh').disabled=true;setCommandsDisabled(true);$('dlp').textContent=auto?'Téléchargement automatique de l’historique…':'Démarrage du téléchargement…';
 try{const ok=await setClock();if(!ok){abortDownload('Téléchargement annulé : impossible de synchroniser l’heure.');return}
  for(const [reg,value] of [[0x2c,0],[0x20,0],[0x22,0]]){if(!await send(reg,value)){abortDownload('Téléchargement interrompu : une commande Bluetooth a échoué.');return}}
  armDownloadTimeout();
 }catch(e){abortDownload('Téléchargement interrompu : '+(e.message||e))}
}
$('dlh').onclick=()=>startDownload(false);
function autoHistory(){if(autoDone||download.on||!connected())return;autoDone=true;startDownload(true).catch(e=>log('Téléchargement automatique impossible : '+(e.message||e)))}
/* Import tableur */
$('fx').onchange=async e=>{
 const file=e.target.files&&e.target.files[0];if(!file)return;showError('');
 try{if(!window.XLSX)throw new Error('La bibliothèque de lecture Excel ne s’est pas chargée. Vérifie ta connexion internet.');const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});const sheet=wb.Sheets[wb.SheetNames[0]];if(!sheet)throw new Error('Aucune feuille trouvée.');const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:''});const recs=[];for(let i=4;i<rows.length;i++){const r=recFrom(rows[i]);if(r)recs.push(r)}ingest(recs,'Import');}catch(err){showError('Import impossible : '+err.message)}e.target.value='';
};
$('clearImport').onclick=async()=>{if(confirm('Effacer tout l’historique importé ?')){hist=[];await dbSet('hist',[]);$('importInfo').textContent='';render()}};
$('histBtn').onclick=()=>{source='hist';render()};$('liveBtn').onclick=()=>{source='live';render()};
$('dayPicker').onchange=e=>{selectedDate=e.target.value||null;render()};$('prev').onclick=()=>{selectedDate=shiftDay(selectedDate,-1);$('dayPicker').value=selectedDate;render()};$('next').onclick=()=>{selectedDate=shiftDay(selectedDate,1);$('dayPicker').value=selectedDate;render()};
document.querySelectorAll('[data-days]').forEach(b=>b.onclick=()=>{daysSetting=Number(b.dataset.days);selectedDate=null;$('dayPicker').value='';render()});
$('clearLive').onclick=async()=>{if(confirm('Effacer les relevés en direct ?')){live=[];await dbSet('live',[]);$('liveCount').textContent='0';render()}};
$('csv').onclick=()=>{const keys=['t','st','sh','t1','h1','te','he','rpm','fil','vit','boost','hol'];const rows=[keys.join(';'),...live.map(r=>keys.map(k=>k==='t'?new Date(r.t).toISOString():(r[k]!=null?r[k]:'')).join(';'))];downloadText(rows.join('\n'),'vmi-purevent-live.csv','text/csv;charset=utf-8')};
function downloadText(content,name,type){const blob=new Blob(['\ufeff',content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
