import { DAY, pad, localDay, shiftDay, fmt, num, MIN_VALID, HIST_MAX } from './modules/date-utils.js';
import { pruneHistory, mergeImportedHistory } from './modules/history.js';
import { commitHistorySync } from './modules/history-sync-commit.js';
import { createBackupSnapshot, mergeBackupData } from './modules/backup.js';
import { $, sleep, APP_VERSION } from './modules/core.js';
import { createStore, normalizeStoreSnapshot } from './modules/store.js';
import { requestPersistentStorage } from './modules/storage-persistence.js';
import { fromOldRow } from './modules/legacy-migration.js';
import { median, analyzeSpeedLevels, analyzeSpeedTimeContext, analyzeHygrometricPeriods, summarizeDailyTrends, analyzeHourlyPatterns, detectRapidChanges, compareOperatingPeriods, buildHygrometricDiagnosis } from './modules/analysis.js';
import { renderCharts, resetChartViews } from './modules/charts.js';
import { createBluetoothService } from './modules/bluetooth-service.js';
import { createPureventNotificationHandler } from './modules/bluetooth-notification-adapter.js';
import { createHistoryStreamState, isHistorySyncBaseline, markHistoryRows } from './modules/bluetooth-history-stream.js';
import { validateBluetoothHistoryRow } from './modules/bluetooth-history-row.js';
import { armDownloadTimeout, findNewestCounterRecord, classifyHistoryDownloadRow } from './modules/sync.js';
import { parseCell, recFrom, getColumnMapping, findVmiHeaderRowIndex, parseCsvRows, isCsvFile } from './modules/dataio.js';
import { fixClock, evaluateCounterBaseline } from './modules/clock-correction.js';
import { absoluteHumidity, psychro, validTemp } from './modules/psychrometry.js';
import { summarizeDataQuality, isPlausibleHumidity, isPlausibleTemperature } from './modules/data-quality.js';

import { summarizeFanEnergyEstimate, summarizeFanEnergyByManualMode } from './modules/energy-estimate.js';
import { summarizeDailyEnergyClimateContext } from './modules/energy-climate.js';
import { summarizeWeeklyDiagnostic } from './modules/weekly-diagnostic.js';
import { createLiveMeasurementFilters } from './modules/measurement-filter.js';
import { applyAdvancedCommand } from './modules/bluetooth-advanced-commands.js';
import { createStateTelemetryRecord, appendStateTelemetry, normalizeStateTelemetry } from './modules/bluetooth-state-telemetry.js';
import { renderStateTelemetryChart } from './modules/bluetooth-telemetry-chart.js';

// Garde volontairement fermée jusqu'à validation des registres sur capture VMI+.
const ADVANCED_COMMANDS_ENABLED = false;
import { buildLiveFreshnessText } from './modules/live-freshness.js';
import { formatDiagnosisConfidence } from './modules/diagnostic-confidence.js';
import { analyzeSeasonalVentilation } from './modules/seasonal-advice.js';
import { renderVmiAssistant } from './modules/assistant-renderer.js';
import { renderEnergyReadiness } from './modules/energy-readiness-renderer.js';
import { selectDataRange } from './modules/history-selection.js';
import { renderTechnicalDiagnostic } from './modules/technical-diagnostic.js';
import { renderHistoryFreshness, renderRecommendation, renderSeasonalAdvice } from './modules/history-advice-renderer.js';
import { renderFanEnergyEstimate, renderDailyEnergyClimateContext, renderWeeklyDiagnostic } from './modules/energy-analysis-renderer.js';

/** @typedef {import('./types/vmi-types.js').VmiRecord} VmiRecord */
/** @typedef {import('./types/vmi-types.js').UnknownRecord} UnknownRecord */


if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(error=>recordError('Enregistrement du service worker impossible : '+(error?.message||error)))}

/* Le protocole et le transport Bluetooth sont encapsulés dans bluetooth-service.js. */





const errors=[];
function recordError(m){
 errors.push(new Date().toLocaleTimeString('fr-FR')+' '+m);if(errors.length>30)errors.shift();
 const b=$('errBanner');b.textContent='⚠ Une erreur interne est survenue ('+errors.length+'). Touche « Diagnostic » (en bas de page) pour la copier.';b.style.display='block';
}
window.addEventListener('error',e=>recordError('Erreur : '+(e.message||(e.error&&e.error.message)||'inconnue')+(e.filename?' ('+String(e.filename).split('/').pop()+':'+e.lineno+')':'')));
window.addEventListener('unhandledrejection',e=>recordError('Promesse rejetée : '+((e.reason&&e.reason.message)||e.reason)));











let manualCommandPending=false,bluetoothService=null;

/** @type {UnknownRecord} */ let meta={};
let cur={},lastSeen={};
let stateTelemetry=[];
let stateTelemetryRangeDays=30;
let stateTelemetryWrite=Promise.resolve();
/** @type {VmiRecord[]} */ let hist=[];
let selectedDate=null,daysSetting=30;
let logLines=[],dlFrames=0;
let download={on:false,rows:[],buf:'',sigs:new Set(),knownSigs:new Set(),seenSigs:new Set(),bootstrap:false,got:false,lastPacket:0,timeout:null,historyStream:createHistoryStreamState(),integrityGap:false,dataStarted:false,announcedTotalRows:null};
const DB='VMI_PUREVENT_DB_TEST',STORE='data';
const { get: dbGet, set: dbSet, setMany: dbSetMany } = createStore({ databaseName: DB, storeName: STORE, onError: message => log(message) });
const connected=()=>!!(bluetoothService&&bluetoothService.connected());
const liveMeasurementFilters=createLiveMeasurementFilters();

/** Demande la protection du stockage local et informe sans bloquer l'application. */
async function updateStorageProtection(){
 const result=await requestPersistentStorage();
 const status=$('storageProtection');
 if(!status)return;
 const labels={
  persisted:'Stockage persistant accordé par le navigateur.',
  granted:'Stockage persistant activé pour cette application.',
  denied:'Le navigateur a refusé le stockage persistant. Une sauvegarde externe est fortement recommandée.',
  unsupported:'Ce navigateur ne permet pas de demander le stockage persistant.',
  error:'Impossible de vérifier la protection du stockage : '+(result.error||'erreur inconnue')
 };
 status.textContent=labels[result.status]||labels.error;
 status.dataset.state=result.status;
 renderBackupReminder();
}
function renderBackupReminder(){
 const reminder=$('backupReminder');
 if(!reminder)return;
 const last=Number(meta.lastBackupAt)||0;
 const age=last?Date.now()-last:Infinity;
 const due=age>=7*DAY;
 reminder.textContent=due
  ? (last?'Dernière sauvegarde générée il y a plus de 7 jours.':'Aucune sauvegarde externe enregistrée dans cette application.')+' La VMI ne conserve qu’environ 4 semaines de relevés : exporte maintenant le fichier JSON et conserve-le hors de ce navigateur.'
  : 'Dernière sauvegarde générée le '+new Date(last).toLocaleString('fr-FR')+'. Pense à conserver le fichier JSON hors de ce navigateur.';
 reminder.dataset.due=String(due);
}
void updateStorageProtection();
setInterval(renderBackupReminder,60*60*1000);

function showError(e){$('err').textContent=e?String(e.message||e):''}
function persist(key,value,label='Sauvegarde IndexedDB'){
 return dbSet(key,value).catch(error=>{
  const message=label+' impossible : '+(error?.message||error);
  showError(message);log(message);recordError('Échec IndexedDB : '+message);throw error;
 });
}
function persistMany(entries,label='Sauvegarde transactionnelle'){
 return dbSetMany(entries).catch(error=>{
  const message=label+' impossible : '+(error?.message||error);
  showError(message);log(message);recordError('Échec IndexedDB : '+message);throw error;
 });
}
function renderLog(){const p=$('log');p.textContent=logLines.slice(-70).join('\n');p.scrollTop=p.scrollHeight}
function log(s){logLines.push(`${new Date().toLocaleTimeString('fr-FR')} ${s}`);if(logLines.length>300)logLines.shift();if($('logDetails').open)renderLog()}
$('logDetails').addEventListener('toggle',()=>{if($('logDetails').open)renderLog()});
function setStatus(s,isConnected=false){$('st').textContent=s;$('bleState').textContent=isConnected?'Connecté':'Déconnecté';$('conn').disabled=isConnected;$('disc').disabled=!isConnected;const overview=$('dashboardConnectionStatus');if(overview)overview.textContent=s}

/* La lecture IndexedDB ancienne reste ici ; la conversion des lignes est isolée.
   Un état "unavailable" interdit de marquer la migration terminée : l'ancienne base
   n'a alors pas été vérifiée et pourrait encore contenir l’historique à récupérer. */
async function readOldDatabase(){
 if(typeof indexedDB==='undefined'||typeof indexedDB.databases!=='function')return {status:'unavailable'};
 let list;
 try{list=await indexedDB.databases()}catch(e){return {status:'unavailable',error:e}}
 if(!Array.isArray(list))return {status:'unavailable'};
 if(!list.some(d=>d&&d.name==='VMI_DB'))return {status:'absent'};
 let old=null;
 try{
  old=await new Promise((res,rej)=>{const r=indexedDB.open('VMI_DB');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  if(!old.objectStoreNames.contains('vmi_store'))return {status:'read',hist:[]};
  const get=k=>new Promise((res,rej)=>{const r=old.transaction('vmi_store','readonly').objectStore('vmi_store').get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  return {status:'read',hist:await get('vmi_hist')};
 }catch(e){return {status:'unavailable',error:e}}
 finally{if(old)old.close()}
}
async function init(){
 const storedHistory=await dbGet('hist');
 const storedMeta=await dbGet('meta');
 const storedStateTelemetry=await dbGet('stateTelemetry');
 stateTelemetry=normalizeStateTelemetry(storedStateTelemetry);
 renderStateTelemetryPanel();
 const snapshot=normalizeStoreSnapshot({
  history:storedHistory,meta:storedMeta
 });
 hist=/** @type {VmiRecord[]} */ (snapshot.history);meta=snapshot.meta;
 renderBackupReminder();
 const migrated=await dbGet('migrated');
 // Le marqueur est l'unique preuve d'une migration achevée. Des données déjà présentes
 // ne doivent pas empêcher une nouvelle tentative après une migration interrompue.
 const migrationPending=migrated!==true;
 let migrationCompleted=false;
 if(migrationPending){
  const old=await readOldDatabase();
  if(old.status==='unavailable'){
   $('importInfo').textContent='Migration de l’ancien historique en attente : le navigateur ne permet pas de vérifier l’ancienne base. Les données actuelles sont conservées ; réessaie avec Chrome à jour ou importe une sauvegarde.';
  }else{
   let oldHist=[];
   if(old.status==='read'){
    if(Array.isArray(old.hist))oldHist=old.hist.map(fromOldRow).filter(Boolean);
   }
   if(!oldHist.length){try{const x=JSON.parse(localStorage.getItem('vmi_hist')||'[]');if(Array.isArray(x))oldHist=x.map(fromOldRow).filter(Boolean)}catch(e){const message='Récupération de l’ancien historique local impossible : '+(e?.message||e);log(message);recordError(message)}}
   // Fusion par horodatage : une nouvelle tentative ne remplace jamais un historique
   // plus récent déjà enregistré dans la base de préversion.
   hist=mergeImportedHistory(hist,oldHist);
   migrationCompleted=true;
  }
 }
 /* Les relevés datés d'avant 2025 ont une date fausse (horloge de la VMI) et ne peuvent pas être corrigés
    sans leur compteur de jours : on les retire, un nouvel import ou téléchargement les rétablit avec la bonne date. */
 const bad=hist.filter(r=>!(r&&r.t>=MIN_VALID)).length;
 if(bad){hist=hist.filter(r=>r&&r.t>=MIN_VALID);$('importInfo').textContent=`${bad} anciens relevés à date invalide ont été retirés. Réimporte ton export VMI+ ou récupère l’historique : ils reviendront avec la bonne date.`}
 hist.sort((a,b)=>a.t-b.t);
 // Initialiser une seule fois la référence persistante à partir du dernier relevé daté.
 // Elle sera ensuite actualisée uniquement après une synchronisation Bluetooth complète.
 if(!meta.counterBaseline){
  const baselineRecord=[...hist].reverse().find(record=>Number.isFinite(record.d)&&Number.isFinite(record.t));
  if(baselineRecord){meta.counterBaseline={d:baselineRecord.d,observedAt:baselineRecord.t};await dbSet('meta',meta)}
 }
 if(migrationPending&&migrationCompleted){
  // Les données fusionnées et le marqueur sont validés ensemble : un échec permet une nouvelle tentative.
  await dbSetMany([['hist',hist],['migrated',true]]);
 }else{
  // Si l'ancienne base n'a pas pu être vérifiée, conserver les données courantes sans
  // marquer la migration comme terminée : elle pourra être retentée au prochain démarrage.
  await dbSet('hist',hist);
  // Nettoyage de l’ancien stockage de l’enregistrement direct.
  await dbSet('live',[]);
 }
 render();
}

/* Psychrométrie : approximation de Magnus */














/* Trames */




async function setClock(allowDuringDownload=false){
 if(!connected()){showError('Connecte-toi d’abord à la VMI.');return false}
 if(download.on&&!allowDuringDownload)return false;
 const d=new Date();
 const ok=await bluetoothService.setClock(d);
 $('dlp').textContent=ok?'Heure confirmée par la VMI : '+d.toLocaleString('fr-FR'):'Mise à l’heure écrite, mais accusé protocolaire absent.';
 return ok;
}

function recordStateTelemetry({timestamp,decoded}){
 const record=createStateTelemetryRecord({timestamp,decoded});
 if(!record)return;
 const next=appendStateTelemetry(stateTelemetry,record);
 if(next.at(-1)?.t===stateTelemetry.at(-1)?.t)return;
 stateTelemetry=next;
 renderStateTelemetryPanel();
 const snapshot=stateTelemetry;
 stateTelemetryWrite=stateTelemetryWrite.then(()=>persist('stateTelemetry',snapshot,'Enregistrement du renouvellement Bluetooth')).catch(error=>{
  log('Historique du renouvellement Bluetooth non sauvegardé : '+(error?.message||error));
 });
}

function renderStateTelemetryPanel(){
 const renewalContainer=$('telemetryRenewalChart');
 const airflowContainer=$('telemetryAirflowChart');
 const summaryContainer=$('telemetrySummary');
 if(!renewalContainer||!airflowContainer||!summaryContainer)return;
 renderStateTelemetryChart({
  renewalContainer,airflowContainer,summaryContainer,
  records:stateTelemetry,rangeDays:stateTelemetryRangeDays
 });
 document.querySelectorAll('[data-telemetry-days]').forEach(button=>{
  button.setAttribute('aria-pressed',String(Number(button.dataset.telemetryDays)===stateTelemetryRangeDays));
 });
}

const handleNotification = createPureventNotificationHandler({
 getDownload:()=>download,
 getCur:()=>cur,
 getLastSeen:()=>lastSeen,
 onStateTelemetry:recordStateTelemetry,
 parseDownloadLine,
 incrementDlFrames:()=>++dlFrames,
 armTimer,
 finishDownload,
 updateLiveMetrics,
 log,
 $,
 notifyResponse:(kind,decoded)=>bluetoothService?.notifyResponse(kind,decoded)
});
function onNotification(ev){
 try{handleNotification(ev)}catch(e){log('Erreur de décodage d’une trame : '+(e.message||e));recordError('Décodage d’une trame : '+(e.message||e))}
}
bluetoothService=createBluetoothService({
 sleep,
 setStatus,
 log,
 showError,
 onNotification,
 getLastStateAt:()=>lastSeen.state,
 isDownloadActive:()=>download.on,
 isCommandPending:()=>manualCommandPending,
 onAutoHistory:()=>autoHistory(),
 onConnected:()=>{
  liveMeasurementFilters.resetAll();
  lastSeen={};
 },
 onSessionCleanup:()=>{
  liveMeasurementFilters.resetAll();
  if(download.on)void finishDownload(false,true,true);
  manualCommandPending=false;
  [...document.querySelectorAll('[data-r]'), ...document.querySelectorAll('[data-advanced]')].forEach(control=>control.disabled=download.on);
 },
 onManualConnectRequested:()=>{
  $('conn').disabled=true;
  showError('');
 },
 onManualConnectSettled:isConnected=>{
  $('conn').disabled=isConnected;
 }
});

function refreshTechnicalDiagnostic(){
 renderTechnicalDiagnostic($('technicalDiagnostic'),{
  cur,lastSeen,connected:connected(),now:Date.now(),maxAgeMs:35000
 });
}
function updateLiveMetrics(){
 $('sampleAge').textContent=buildLiveFreshnessText(lastSeen);
 const r={st:cur.sal_t,sh:cur.sal_h,te:cur.s2_t,he:cur.s2_h};
 const p=psychro(r);
 $('haSalon').textContent=fmt(p.haIn);$('haExt').textContent=fmt(p.haOut);$('dew').textContent=fmt(p.dewIn);$('dewExt').textContent=fmt(p.dewOut);
 $('deltaHA').textContent=p.haIn!=null&&p.haOut!=null?fmt(p.haIn-p.haOut):'–';
 $('deltaT').textContent=validTemp(r.st)&&validTemp(r.te)?fmt(r.st-r.te):'–';
 const box=$('hygroAdvice');
 if(p.haIn==null||p.haOut==null){box.className='advice';box.textContent='En attente de mesures valides pour comparer les masses de vapeur d’eau.';return}
 const delta=p.haIn-p.haOut;
 if(delta>1){box.className='advice good';box.textContent=`L’air entrant contient environ ${fmt(delta)} g/m³ de vapeur d’eau en moins que l’air du salon. Dans ces conditions, le renouvellement d’air peut contribuer à réduire l’humidité intérieure.`}
 else if(delta< -1){box.className='advice warn';box.textContent=`L’air entrant contient environ ${fmt(Math.abs(delta))} g/m³ de vapeur d’eau de plus que l’air du salon. Une ventilation accrue ne garantit donc pas un assèchement.`}
 else{box.className='advice';box.textContent='Les humidités absolues sont proches. L’effet asséchant potentiel de l’air entrant est limité à cet instant.'}
}

$('conn').onclick=()=>bluetoothService.connectBLE();
$('disc').onclick=()=>bluetoothService.disconnect();

/* Boutons de commande : une commande à la fois, avec vérification de l'état renvoyé par la VMI */
const EXPECT={24:v=>['vit',v+1,'Vitesse '+(v+1)],25:v=>['boost',v,'Boost '+(v?'activé':'arrêté')],26:v=>['hol',v>0,'Mode vacances '+(v?`${v} jour(s)`:'arrêté')]};
document.querySelectorAll('[data-r]').forEach(b=>b.addEventListener('click',async()=>{
 if(manualCommandPending||download.on)return;
 if(!connected()){showError('VMI non connectée.');$('cmdResult').textContent='';return}
 manualCommandPending=true;
 const commandToken=bluetoothService.getSessionToken(),commandDevice=bluetoothService.getDevice();
 const commandIsCurrent=()=>bluetoothService.isSessionCurrent(commandToken,commandDevice)&&connected();
 const controls=[...document.querySelectorAll('[data-r]')];
 controls.forEach(x=>x.disabled=true);
 showError('');
 const reg=Number(b.dataset.r),value=Number(b.dataset.v),[key,expected,label]=EXPECT[reg](value);
 const result=$('cmdResult');
 try{
  while(bluetoothService.isPolling(commandToken)&&commandIsCurrent())await sleep(50);
  if(!commandIsCurrent())return;
  result.textContent='Envoi de la commande à la VMI…';
  const t0=Date.now();
  const sent=await bluetoothService.sendAndWait(reg,value,'state');
  if(!commandIsCurrent()){result.textContent='Connexion interrompue : l’état de la commande n’a pas pu être vérifié.';return}
  if(!sent.written){result.textContent='La commande n’a pas pu être envoyée (voir le journal Bluetooth).';return}
  result.textContent=sent.responded?'Commande envoyée et réponse reçue, vérification de l’état…':'Commande écrite, mais sans réponse typée : tentative de relecture de l’état…';
  if(!commandIsCurrent()){result.textContent='Connexion interrompue : l’état de la commande n’a pas pu être vérifié.';return}
  if(!((lastSeen.state||0)>t0)){
   const readSent=await bluetoothService.sendAndWait(3,0,'state');
   if(!commandIsCurrent()){result.textContent='Connexion interrompue : l’état de la commande n’a pas pu être vérifié.';return}
   if(!readSent.responded)log('La relecture de l’état n’a pas reçu de réponse typée.');
  }
  if(!commandIsCurrent()){result.textContent='Connexion interrompue : l’état de la commande n’a pas pu être vérifié.';return}
  if((lastSeen.state||0)>t0&&cur[key]===expected)result.textContent='✓ Confirmé par la VMI : '+label+'.';
  else if((lastSeen.state||0)>t0)result.textContent='⚠ La VMI a répondu mais l’état affiché n’est pas '+label.toLowerCase()+'. Vérifie sur la VMI ou dans VMI+.';
  else result.textContent='⚠ Commande envoyée mais aucune réponse de la VMI : l’état n’a pas pu être vérifié.';
 }catch(e){
  showError(e);result.textContent='Erreur pendant la commande.';
 }finally{
  if(bluetoothService.getSessionToken()===commandToken){manualCommandPending=false;controls.forEach(x=>x.disabled=download.on)}
 }
}));
const setCommandsDisabled=dis=>[...document.querySelectorAll('[data-r]'), ...document.querySelectorAll('[data-advanced]')].forEach(x=>x.disabled=dis);

async function runAdvancedCommand(action,value,label){
 if(!ADVANCED_COMMANDS_ENABLED){
  $('cmdResult').textContent='Commande avancée bloquée : registre non validé sur cette VMI. Capturer l’action dans VMI+ officielle avant réactivation.';
  return;
 }
 if(manualCommandPending||download.on)return;
 if(!connected()){showError('VMI non connectée.');$('cmdResult').textContent='';return}
 if(action==='preheatSetpoint'&&!confirm('Régler une consigne démarre le préchauffage électrique. Confirmer ?'))return;
 if(action==='preheatPower'&&value===true&&!confirm('Démarrer le préchauffage électrique peut augmenter la consommation jusqu’à 1 800 W. Confirmer ?'))return;
 manualCommandPending=true;
 const commandToken=bluetoothService.getSessionToken(),commandDevice=bluetoothService.getDevice();
 const commandIsCurrent=()=>bluetoothService.isSessionCurrent(commandToken,commandDevice)&&connected();
 const controls=[...document.querySelectorAll('[data-r]'), ...document.querySelectorAll('[data-advanced]')];
 controls.forEach(control=>control.disabled=true);
 showError('');
 const result=$('cmdResult');
 let lastCommandState=null;
 const deps={
  isConnected:commandIsCurrent,
  readState:async()=>{
   const read=await bluetoothService.sendAndWait(0x03,0,'state');
   if(!read.written||!read.responded||!read.response)throw new Error('Lecture d’état Purevent sans réponse valide.');
   return read.response;
  },
  writeCommand:async(register,commandValue)=>{
   const sent=await bluetoothService.sendAndWait(register,commandValue,'state');
   if(!sent.written)throw new Error('Écriture Bluetooth non effectuée.');
   lastCommandState=sent.responded?sent.response:null;
   return sent;
  },
  getLastCommandState:async()=>lastCommandState
 };
 try{
  while(bluetoothService.isPolling(commandToken)&&commandIsCurrent())await sleep(50);
  if(!commandIsCurrent())return;
  result.textContent='Lecture de l’état actuel de la VMI…';
  const outcome=await applyAdvancedCommand(deps,action,value);
  if(!commandIsCurrent()){result.textContent='Connexion interrompue : confirmation impossible.';return}
  result.textContent=(outcome.changed?'✓ Réglage appliqué et confirmé : ':'✓ Déjà dans l’état demandé : ')+label+'.';
  log('Commande avancée confirmée par relecture d’état : '+label+'.');
 }catch(error){
  showError(error);
  result.textContent='⚠ '+(error.message||error);
  log('Commande avancée non confirmée ('+label+') : '+(error.message||error));
 }finally{
  if(commandToken===bluetoothService.getSessionToken()){manualCommandPending=false;controls.forEach(control=>control.disabled=download.on)}
 }
}

document.querySelectorAll('[data-advanced]').forEach(button=>button.addEventListener('click',()=>{
 const action=button.dataset.advanced;
 const value=button.dataset.value==='true'?true:button.dataset.value==='false'?false:Number(button.dataset.value);
 const labels={
  surventilation:value?'Activer la surventilation':'Arrêter la surventilation',
  fixedAirflow:value?'Activer le débit fixe':'Désactiver le débit fixe',
  preheatPower:value?'Démarrer le préchauffage':'Arrêter le préchauffage',
  preheatSetpoint:'Consigne de préchauffage '+value+' °C',
  summerLimit:'Limite estivale '+value+' °C'
 };
 void runAdvancedCommand(action,value,labels[action]);
}));
$('summerLimitApply').addEventListener('click',()=>{
 const value=Number((/** @type {HTMLSelectElement} */ ($('summerLimitInput'))).value);
 void runAdvancedCommand('summerLimit',value,'Limite estivale '+value+' °C');
});
$('preheatSetpointApply').addEventListener('click',()=>{
 const value=Number((/** @type {HTMLSelectElement} */ ($('preheatSetpointInput'))).value);
 void runAdvancedCommand('preheatSetpoint',value,'Consigne de préchauffage '+value+' °C');
});
$('clk').onclick=()=>setClock(false);

/* Correction des dates historiques isolée dans clock-correction.js. */
async function ingest(recs,label,maxTimestamp=Date.now(),options={}){
 const future=recs.filter(record=>Number.isFinite(record.t)&&record.t>maxTimestamp);
 if(future.length)log(`${label} : dates futures reçues (${future.map(record=>record.rk+' · +'+Math.round((record.t-maxTimestamp)/1000)+' s').join(' ; ')})`);
 const {fixed,kept,futureDetails,counterReset,counterResetDetails,referenceCount,concordantCount,concordanceRate}=fixClock(recs,hist,MIN_VALID,maxTimestamp,options);
 if(counterReset)log(`${label} : discontinuité du compteur d détectée (${counterResetDetails.current} après ${counterResetDetails.previousMax}) ; ancien historique exclu des repères. ${referenceCount?`Nouveau recalage établi avec ${referenceCount} repère(s) entrant(s).`:'Aucun nouveau repère fiable : les anciennes dates ne sont pas corrigées.'}`);
 else if(referenceCount)log(`${label} : repères date/compteur ${concordantCount}/${referenceCount} concordants (${concordanceRate} %).`);
 if(futureDetails.length)log(`${label} : dates futures après correction (${futureDetails.map(({record,correctedTimestamp})=>record.rk+' · d='+record.d+' · '+new Date(correctedTimestamp).toLocaleString('fr-FR')).join(' ; ')})`);
 const keptSet=new Set(kept);
 const discarded=recs.filter(record=>!keptSet.has(record));
 if(discarded.length)log(`${label} : lignes écartées (${discarded.map(record=>record.rk+' · d='+record.d+' · brut='+new Date(record.t).toLocaleString('fr-FR')).join(' ; ')})`);
 const committed=await commitHistorySync({
  currentRecords:hist,
  importedRecords:kept,
  maxTimestamp,
  futureToleranceMs:options.futureToleranceMs,
  maxRecords:HIST_MAX,
  metadata:options.metadataToCommit,
  persistMany:entries=>persistMany(entries,'Sauvegarde de l’historique')
 });
 hist=committed.history;
 if(options.metadataToCommit!==undefined)meta=options.metadataToCommit;
 if(committed.removed)log(`Historique limité à ${HIST_MAX} relevés (les plus anciens supprimés).`);
  // Conserver le jour choisi : une synchronisation en arrière-plan ne doit pas réinitialiser les graphiques.
 const lost=recs.length-kept.length;
 $('importInfo').textContent=`${label} : ${recs.length} relevés lus${fixed?`, dont ${fixed} dont la date a été corrigée (horloge de la VMI fausse)`:''}${lost?`, ${lost} écartés (date invalide ou postérieure à la synchronisation)`:''}.`;
 log($('importInfo').textContent);
 render();
 return {counterReset,counterResetDetails,referenceCount,concordantCount,concordanceRate};
}

/* Téléchargement de l’historique : on s'arrête au premier relevé déjà connu, puis on coupe la connexion
   pour interrompre le flux de la VMI (elle ne sait pas s'arrêter seule). */
const sigOf=r=>r.rk+'|'+r.d;
function parseDownloadLine(line){
 if(!download.on||download.reachedCut)return;
 if(!download.dataStarted){
  if(String(line).trimStart().startsWith('Date;Event;'))download.dataStarted=true;
  return;
 }
 const validation=validateBluetoothHistoryRow(line);
 if(!validation.valid){download.invalidRows=(download.invalidRows||0)+1;const reason='reason' in validation?validation.reason:'motif non précisé';log('Ligne historique Bluetooth rejetée ('+reason+') · date brute : '+String(line).split(';',1)[0]);return}
 const f=validation.fields,p=parseCell(f[0]);if(!p)return;
 const signature=p.rk+'|'+num(f[11]);
 const decision=classifyHistoryDownloadRow(signature,{
  baselineSignatures:download.sigs,knownSignatures:download.knownSigs,
  seenSignatures:download.seenSigs,bootstrap:download.bootstrap
 });
 if(decision==='cut'){download.reachedCut=true;return}
 if(decision==='skip')return;
 const rec=recFrom(f);if(rec)download.rows.push(rec);
}
function armTimer(){armDownloadTimeout(download,finishDownload)}
async function finishDownload(completeBoundary,timeout=false,interrupted=false){
 if(!download.on)return;
 download.on=false;clearTimeout(download.timeout);
 const count=download.rows.length;
 const complete=!timeout&&!interrupted&&!download.integrityGap&&!(download.invalidRows>0)&&completeBoundary;
 const syncObservedAt=Date.now();
 let ingestResult=null,persistenceError=null,counterAssessment=null;
 try{
  const newestCounterRecord=findNewestCounterRecord(download.rows);
  counterAssessment=complete&&newestCounterRecord
   ? evaluateCounterBaseline({
    baseline:/** @type {{d:number,observedAt:number}|undefined} */ (meta.counterBaseline),
    candidate:/** @type {{d:number,observedAt:number}|null|undefined} */ (meta.counterCandidate),
    currentDays:newestCounterRecord.d,observedAt:syncObservedAt
   })
   : null;
  const nextMeta=complete?{
   ...meta,
   lastSync:syncObservedAt,
   ...(counterAssessment?{
    counterBaseline:counterAssessment.baseline,
    counterCandidate:counterAssessment.candidate
   }:{})
  }:undefined;
  if(count)ingestResult=await ingest(markHistoryRows(download.rows,complete),'Téléchargement',syncObservedAt,{
   allowPre2020RawDates:true,
   forceCounterReset:counterAssessment?.discontinuity===true,
   counterResetReason:counterAssessment?.reason,
   counterPreviousDays:counterAssessment?.previousDays ?? (/** @type {{d?:number}|undefined} */ (meta.counterBaseline))?.d,
   // La VMI peut dater sa dernière ligne de quelques secondes après la fin locale du transfert.
   // La même tolérance est appliquée jusqu'à la fusion, sans modifier les autres imports.
   futureToleranceMs:30_000,
   metadataToCommit:nextMeta
  });
  else if(nextMeta){
   await persist('meta',nextMeta,'Sauvegarde des métadonnées de synchronisation');
   meta=nextMeta;
  }
  if(complete)renderFreshness();
 }catch(error){
  persistenceError=error;
  const message='Synchronisation non validée : sauvegarde IndexedDB impossible ('+(error?.message||error)+').';
  showError(message);log(message);recordError(message);
 }
 $('dlh').disabled=false;setCommandsDisabled(false);
 const completionMessage=persistenceError
  ? ' · échec de sauvegarde, synchronisation non validée'
  : download.invalidRows>0
   ? ' · lignes rejetées : synchronisation non certifiée, relance nécessaire'
   : download.integrityGap
    ? ' · lacune détectée : synchronisation non certifiée, relance nécessaire'
    : interrupted
     ? (download.got?' · transfert interrompu, données partielles conservées ; relance la synchronisation':' · transfert interrompu avant réception')
     : completeBoundary
      ? ' · historique synchronisé'
      : timeout
       ? (download.got?' · arrêt après une pause de 20 s':' · aucune réponse de la VMI')
       : (download.bootstrap?' · synchronisation initiale non certifiée':download.sigs.size?' · attention : trou possible avant la dernière ligne mémorisée':' · historique complet');
 $('dlp').textContent=`Terminé : ${count} nouvelles lignes${completionMessage}`;
 if(Number.isSafeInteger(download.announcedTotalRows)) $('dlp').textContent+=` · total annoncé par la VMI : ${download.announcedTotalRows} lignes`;
 if(download.bootstrap&&!complete) $('dlp').textContent+=' · lignes déjà enregistrées ignorées, relance possible pour rechercher les suivantes';
 if(ingestResult?.counterReset){
  $('dlp').textContent+=' · ⚠ discontinuité du compteur détectée';
  $('dlp').textContent+=ingestResult.referenceCount>=2
   ? ` · dates recalées avec ${ingestResult.referenceCount} repères indépendants : vérification conseillée`
   : ' · pas assez de nouveaux repères fiables : dates anciennes laissées non corrigées';
 }
 if(completeBoundary&&connected())bluetoothService.disconnectIntentional();
}
async function startDownload(auto=false){
 if(!connected()){if(!auto)showError('Connecte-toi d’abord à la VMI.');return}
 if(download.on)return;
 const sessionToken=bluetoothService.getSessionToken();
 const abortDownload=()=>{
  if(download.on)void finishDownload(false,true,true);
 };
 showError('');dlFrames=0;
 const baselineRecords=hist.filter(r=>isHistorySyncBaseline(r)&&r.rk&&Number.isFinite(r.d));
 const baselineSigs=new Set(baselineRecords.map(sigOf));
 const knownSigs=new Set(hist.filter(r=>r.rk&&Number.isFinite(r.d)).map(sigOf));
 download={on:true,rows:[],buf:'',sigs:baselineSigs,knownSigs,seenSigs:new Set(),bootstrap:baselineSigs.size===0,got:false,lastPacket:Date.now(),timeout:null,historyStream:createHistoryStreamState(),integrityGap:false,dataStarted:false,announcedTotalRows:null};
 $('dlh').disabled=true;setCommandsDisabled(true);
 $('dlp').textContent=auto?'Téléchargement automatique de l’historique…':'Démarrage du téléchargement…';
 // Terminer la requête de lecture déjà en cours avant d'envoyer les registres du flux historique.
 while(bluetoothService.isPolling(sessionToken)&&connected())await sleep(50);
 if(!download.on||sessionToken!==bluetoothService.getSessionToken()){abortDownload();return}
 const sequenceOk=await bluetoothService.startHistoryTransfer({
  beforeCommands:()=>setClock(true),
  isActive:()=>download.on&&connected()
 });
 if(!sequenceOk){abortDownload();return}
 armTimer();
}
$('dlh').onclick=()=>startDownload(false);
function autoHistory(){
 if(download.on||!connected())return;
 startDownload(true).catch(e=>{const message='Téléchargement automatique impossible : '+(e.message||e);log(message);recordError(message)});
}

/* Import tableur */
const XLSX_SOURCES=[{url:'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',integrity:'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw'}];
function loadScript(url,integrity,ms=15000){
 return new Promise((res,rej)=>{
  const sc=document.createElement('script');
  const t=setTimeout(()=>{sc.remove();rej(new Error('délai dépassé'))},ms);
  sc.src=url;sc.integrity=integrity;sc.crossOrigin='anonymous';sc.onload=()=>{clearTimeout(t);res()};sc.onerror=()=>{clearTimeout(t);sc.remove();rej(new Error('échec du chargement ou vérification SRI refusée'))};
  document.head.appendChild(sc);
 });
}
let xlsxPromise=null;
function loadXLSX(){
 if(window.XLSX)return Promise.resolve();
 if(!xlsxPromise)xlsxPromise=(async()=>{
  for(const source of XLSX_SOURCES){try{await loadScript(source.url,source.integrity);if(window.XLSX)return}catch(e){log('SheetJS : '+e.message+' ('+source.url+')')}}
  throw new Error('Impossible de charger la bibliothèque de lecture : l’import CSV/Excel demande une connexion internet (une seule fois). Le téléchargement par Bluetooth n’en a pas besoin.');
 })().catch(e=>{xlsxPromise=null;throw e});
 return xlsxPromise;
}
$('fx').onchange=async e=>{
 const input=e.currentTarget instanceof HTMLInputElement?e.currentTarget:null;
 if(!input)return;
 const file=input.files&&input.files[0];if(!file)return;showError('');
 try{
  let rows,spreadsheet=null;
  if(isCsvFile(file.name)){
   $('importInfo').textContent='Lecture du CSV…';
   rows=parseCsvRows(await file.text());
  }else{
   $('importInfo').textContent='Chargement de la bibliothèque Excel…';
   await loadXLSX();spreadsheet=XLSX;
   const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
   const sheet=wb.Sheets[wb.SheetNames[0]];
   if(!sheet)throw new Error('Aucune feuille trouvée.');
   rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:''});
  }
  const headerIndex=findVmiHeaderRowIndex(rows);
  if(headerIndex<0)throw new Error('En-tête VMI+ introuvable : les colonnes Date, mode et Debit doivent être présentes dans les 20 premières lignes. Aucun relevé n’a été importé.');
  const columnMapping=getColumnMapping(rows[headerIndex]);
  const recs=[];for(let i=headerIndex+1;i<rows.length;i++){const r=recFrom(rows[i],spreadsheet,columnMapping);if(r)recs.push(r)}
  await ingest(recs,'Import');
 }catch(err){showError('Import impossible : '+err.message)}
 input.value='';
};
$('clearImport').onclick=async()=>{if(!confirm('Effacer tout l’historique importé ?'))return;try{await persist('hist',[],'Effacement de l’historique');hist=[];$('importInfo').textContent='';render()}catch(error){showError('Effacement de l’historique impossible : '+(error?.message||error))} };
$('dayPicker').onchange=e=>{if(!(e.currentTarget instanceof HTMLInputElement))return;selectedDate=e.currentTarget.value||null;resetChartViews();render()};
$('clearDay').onclick=()=>{selectedDate=null;$('dayPicker').value='';resetChartViews();render()};
$('prev').onclick=()=>{selectedDate=shiftDay(selectedDate,-1);$('dayPicker').value=selectedDate;resetChartViews();render()};
$('next').onclick=()=>{selectedDate=shiftDay(selectedDate,1);$('dayPicker').value=selectedDate;resetChartViews();render()};
document.querySelectorAll('[data-days]').forEach(b=>b.onclick=()=>{daysSetting=Number(b.dataset.days);selectedDate=null;$('dayPicker').value='';resetChartViews();render()});
function downloadText(content,name,type,bom=true){
 const blob=new Blob(bom?['\ufeff',content]:[content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/* ---------- Export, sauvegarde et fraîcheur de l’historique ---------- */
const fmtLocal=t=>{const d=new Date(t);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`};
const fmtShort=t=>{const d=new Date(t);return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`};
const decFr=v=>(v==null||!Number.isFinite(v))?'':String(Math.round(v*100)/100).replace('.',',');
function histToCsv(rows){
 const head=['date_heure','salon_temp_C','salon_HR_pct','temperature_exterieure_vmi_plus_C','salon_HA_calculee_g_m3','salon_rosee_C','sonde1_temp_C','sonde1_HR_pct','vmi_plus_P0_Hum_abs_brute','air_entrant_temp_C','air_entrant_HR_pct','vmi_plus_P1_Hum_abs_brute','air_entrant_HA_calculee_g_m3','regime_tr_min','etat_filtre_brut','indice_encrassement_pct','duree_fonctionnement_j','debit_vmi_plus_brut','vitesse_vmi_plus_code_brut','pwm_vmi_plus_brut','mode_vmi_plus_brut','volume_vmi_plus_m3_brut','cons_dp_vmi_plus_brut'];
 const lines=[head.join(';')];
 for(const r of rows){
  const p=psychro({st:r.st,sh:r.sh,te:r.te,he:r.he});
  lines.push([fmtLocal(r.t),decFr(r.st),decFr(r.sh),decFr(r.tExt),decFr(p.haIn),decFr(p.dewIn),decFr(r.t1),decFr(r.h1),decFr(r.vmiAbsP0),decFr(r.te),decFr(r.he),decFr(r.vmiAbsP1),decFr(p.haOut),decFr(r.rpm),decFr(r.fil),decFr(r.filterIndexPct),decFr(r.d),decFr(r.debit),decFr(r.vmiSpeedRaw),decFr(r.vmiPwmRaw),decFr(r.vmiModeRaw),decFr(r.volumeRaw),decFr(r.consDpRaw)].join(';'));
 }
 return lines.join('\r\n');
}

/** @param {UnknownRecord} obj Sauvegarde JSON validée comme objet. */
async function restoreBackup(obj){
 await stateTelemetryWrite;
 const result=mergeBackupData({backup:obj,currentHist:hist,currentStateTelemetry:stateTelemetry,currentMeta:meta,minValid:MIN_VALID});
 const nextHist=pruneHistory(result.hist,HIST_MAX).records;
 const nextStateTelemetry=Array.isArray(result.stateTelemetry)?result.stateTelemetry:stateTelemetry;
 const entries=/** @type {Array<[IDBValidKey, unknown]>} */ ([['hist',nextHist],['live',[]],['stateTelemetry',nextStateTelemetry]]);
 if(result.meta.lastSync!==meta.lastSync)entries.push(['meta',result.meta]);
 // Ne modifier l'état en mémoire qu'après validation atomique du stockage local.
 await dbSetMany(entries);
 hist=nextHist;meta=result.meta;stateTelemetry=nextStateTelemetry;
 return {add:result.addedHistory,enriched:result.enrichedHistory};
}
$('expHist').onclick=()=>{
 const rows=hist.filter(r=>r.t>=MIN_VALID&&r.t<=Date.now());
 if(!rows.length){$('backupInfo').textContent='Aucun historique à exporter.';return}
 downloadText(histToCsv(rows),`vmi-historique-${localDay()}.csv`,'text/csv;charset=utf-8');
 $('backupInfo').textContent=`${rows.length} relevés exportés (séparateur « ; », virgule décimale, prêt pour Excel).`;
};
async function exportBackup(){
 try{
  const nextMeta={...meta,lastBackupAt:Date.now()};
  const backup=createBackupSnapshot({hist,live:[],meta:nextMeta,stateTelemetry});
  downloadText(JSON.stringify(backup),`vmi-sauvegarde-${localDay()}.json`,'application/json',false);
  await dbSet('meta',nextMeta);
  meta=nextMeta;
  $('backupInfo').textContent=`Fichier JSON généré pour ${hist.length} relevés. Vérifie le téléchargement et conserve ce fichier hors de ce navigateur.`;
  renderBackupReminder();
 }catch(error){
  $('backupInfo').textContent='Sauvegarde impossible : '+(error?.message||error);
  recordError('Mise à jour de la date de sauvegarde impossible : '+(error?.message||error));
 }
}
$('backupReminderExport').onclick=exportBackup;
$('expBackup').onclick=exportBackup;
$('restoreFile').onchange=async e=>{
 const input=e.currentTarget instanceof HTMLInputElement?e.currentTarget:null;
 if(!input)return;
 const file=input.files&&input.files[0];if(!file)return;
 try{
  const parsed=JSON.parse(await file.text());
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Fichier de sauvegarde invalide : objet attendu.');
  const obj=/** @type {UnknownRecord} */ (parsed);
  const {add,enriched}=await restoreBackup(obj);
  $('backupInfo').textContent='Sauvegarde restaurée : '+add+' relevés d’historique ajoutés et '+enriched+' complétés.';
  render();
 }catch(err){$('backupInfo').textContent='Restauration impossible : '+err.message}
 input.value='';
};
/* La VMI ne garde que ~800 relevés : on estime sa capacité en jours d'après le rythme réel des relevés
   et on prévient avant que des relevés non téléchargés soient écrasés. */
function renderFreshness(){
 renderHistoryFreshness({container:$('fresh'),history:hist,metadata:meta,dayMs:DAY,minValid:MIN_VALID,formatShort:fmtShort});
}
setInterval(renderFreshness,60000);

/* ---------- Diagnostic ---------- */
function buildDiagnostic(){
 const L=[];
 const ago=t=>t?Math.round((Date.now()-t)/1000)+' s':'jamais';
 L.push(`VMI Purevent – diagnostic – version ${APP_VERSION} – ${new Date().toLocaleString('fr-FR')}`);
 L.push('Navigateur : '+navigator.userAgent);
 L.push(`Bluetooth : ${bluetoothService?.isAvailable()?'disponible':'indisponible'} · connecté : ${connected()?'oui':'non'} · service worker : ${'serviceWorker' in navigator?(navigator.serviceWorker.controller?'actif':'non actif'):'absent'} · SheetJS : ${window.XLSX?'chargé':'non chargé'}`);
 const valid=hist.filter(r=>r.t>=MIN_VALID&&r.t<=Date.now());
 L.push(`Historique : ${hist.length} relevés dont ${valid.length} valides`);
 if(valid.length){
  const ts=valid.map(r=>r.t);
  L.push(`  période : ${fmtLocal(ts[0])} → ${fmtLocal(ts[ts.length-1])}`);
  const gaps=[];for(let i=1;i<ts.length;i++)if(ts[i]-ts[i-1]>2*3600e3)gaps.push(`${fmtShort(ts[i-1])} → ${fmtShort(ts[i])} (${((ts[i]-ts[i-1])/3600e3).toFixed(1)} h)`);
  L.push(`  trous > 2 h : ${gaps.length}${gaps.length?' : '+gaps.slice(0,8).join(' ; '):''}`);
  const miss=k=>valid.filter(r=>r[k]==null).length;
  L.push(`  valeurs manquantes : salon T ${miss('st')}, ext. VMI+ T ${miss('tExt')}, salon HR ${miss('sh')}, sonde 1 T ${miss('t1')}, air entrant T ${miss('te')}, air entrant HR ${miss('he')}, régime ${miss('rpm')}`);
  for(const [key,label] of [['st','Salon'],['t1','Sonde résistances'],['te','Air entrant']]){
   const extreme=valid.filter(r=>typeof r[key]==='number'&&Number.isFinite(r[key])&&r[key]>40);
   L.push(`  Température >40°C – ${label} : ${extreme.length}${extreme.length?' · '+extreme.slice(0,8).map(r=>fmtLocal(r.t)+' = '+r[key]+'°C').join(' ; '):''}`);
  }
  for(const [tk,hk,label] of [['st','sh','Salon'],['t1','h1','Sonde résistances'],['te','he','Air entrant']]){
   const extreme=valid.map(r=>{const t=r[tk],h=r[hk];return {r,v:typeof t==='number'&&typeof h==='number'&&Number.isFinite(t)&&Number.isFinite(h)?absoluteHumidity(t,h):null}}).filter(x=>Number.isFinite(x.v)&&x.v>35);
   L.push(`  Humidité absolue calculée >35 g/m³ – ${label} : ${extreme.length}${extreme.length?' · '+extreme.slice(0,8).map(x=>fmtLocal(x.r.t)+' = '+x.v.toFixed(1)).join(' ; '):''}`);
  }
  L.push(`  relevés avec compteur de jours : ${valid.filter(r=>Number.isFinite(r.d)).length} · avec date brute : ${valid.filter(r=>r.rk).length}`);
 }
  L.push(`Synchro : dernière ${meta.lastSync?fmtLocal(meta.lastSync):'jamais'} · mesures reçues : salon ${ago(lastSeen.salon)}, sondes ${ago(lastSeen.probes)}, état ${ago(lastSeen.state)}`);
 L.push(`Renouvellement Bluetooth : ${stateTelemetry.length} transitions enregistrées${stateTelemetry.length?' · dernière : '+fmtLocal(stateTelemetry.at(-1).t)+' · '+stateTelemetry.at(-1).airChangesPerHour.toFixed(3)+' vol/h · code vitesse brut '+stateTelemetry.at(-1).rawSpeed:''}`);
 L.push(`Affichage : jour ${selectedDate||'aucun'}, période ${daysSetting?daysSetting+' j':'tout'}`);
 L.push('Graphiques : '+['chartRH','chartHA','chartTemp','chartRPM'].map(id=>`${id} ${(($(id).innerHTML.match(/<path/g))||[]).length} courbe(s)`).join(' · '));
 L.push('Téléchargement : '+(download.on?'en cours':'inactif')+` · ${$('dlp').textContent||'—'}`);
 L.push('Commandes : '+($('cmdResult').textContent||'—'));
 L.push('Erreurs : '+(errors.length?'\n  '+errors.join('\n  '):'aucune'));
 L.push('Journal (25 dernières lignes) :');
 logLines.slice(-25).forEach(x=>L.push('  '+x));
 return L.join('\n');
}
$('diagBtn').onclick=()=>{$('diagOut').textContent=buildDiagnostic()};
$('diagCopy').onclick=async()=>{
 const txt=buildDiagnostic();$('diagOut').textContent=txt;
 try{await navigator.clipboard.writeText(txt);showError('Diagnostic copié : colle-le dans la conversation.')}
 catch(e){showError('Copie impossible : sélectionne le texte du diagnostic puis copie-le à la main.')}
};

/* ---------- Graphiques SVG ---------- */
/* Le direct reste une vue facultative ; toutes les analyses utilisent l’historique importé/téléchargé. */
function selectedData(){return selectDataRange(hist,{selectedDate,daysSetting})}
let historicalSelectionCache={history:null,selectedDate:null,daysSetting:null,data:null};
function selectedHistoricalData(){
 if(historicalSelectionCache.history===hist&&historicalSelectionCache.selectedDate===selectedDate&&historicalSelectionCache.daysSetting===daysSetting){
  return historicalSelectionCache.data;
 }
 const data=selectDataRange(hist,{selectedDate,daysSetting});
 historicalSelectionCache={history:hist,selectedDate,daysSetting,data};
 return data;
}
const hygrometricDiagnosisCache=new WeakMap();
function getHygrometricDiagnosis(data){
 let result=hygrometricDiagnosisCache.get(data);
 if(!result){
  result=buildHygrometricDiagnosis(data);
  hygrometricDiagnosisCache.set(data,result);
 }
 return result;
}
const dataQualityCache=new WeakMap();
function getDataQuality(data){
 let result=dataQualityCache.get(data);
 if(!result){
  result=summarizeDataQuality(data);
  dataQualityCache.set(data,result);
 }
 return result;
}
function formatDuration(ms){
 const minutes=Math.round(ms/60000),hours=Math.floor(minutes/60),days=Math.floor(hours/24);
 if(days)return days+' j '+(hours%24)+' h';
 if(hours)return hours+' h '+(minutes%60)+' min';
 return minutes+' min';
}
function renderHygrometricPeriods(data){
 const box=$('hygroPeriods');
 const result=analyzeHygrometricPeriods(data,{threshold:1,maxGapHours:2});
 if(result.sampleCount<2||!result.observedDurationMs){
  box.className='advice';
  box.textContent=result.sampleCount<2?'Pas assez de mesures simultanées valides pour analyser une durée.':'Aucune durée exploitable : les mesures sont trop espacées (plus de 2 h entre deux relevés).';
  return;
 }
 const total=result.observedDurationMs;
 const pct=value=>Math.round(value/total*100);
 let message='Sur '+formatDuration(total)+' d’intervalles exploitables (interpolation entre relevés, sans extrapoler les trous de plus de '+result.maxGapHours+' h) : ';
 message+='Dans le diagnostic global, le seuil de 1 g/m³ et la règle de dominance de 60 % sont des critères heuristiques, pas des seuils physiques validés pour ces capteurs. ';
 message+='Potentiel favorable (air entrant plus sec) : '+formatDuration(result.dryDurationMs)+' ('+pct(result.dryDurationMs)+' %). ';
 message+='Potentiel défavorable (air entrant plus humide) : '+formatDuration(result.humidDurationMs)+' ('+pct(result.humidDurationMs)+' %). ';
 message+='Écart faible : '+formatDuration(result.neutralDurationMs)+' ('+pct(result.neutralDurationMs)+' %). ';
 message+='Écart médian salon − air entrant : '+fmt(result.medianDelta)+' g/m³. ';
 message+='Plus longue séquence estimée avec un écart favorable : '+formatDuration(result.longestDryMs)+'. ';
 message+='Plus longue séquence avec un air entrant plus humide : '+formatDuration(result.longestHumidMs)+'.';
 if(result.gapCount)message+=' '+result.gapCount+' interruption(s) de plus de '+result.maxGapHours+' h exclue(s) du calcul.';
 message+=' Ces durées décrivent uniquement l’écart d’humidité absolue entre les deux capteurs. Elles ne prouvent pas une baisse de l’humidité dans le logement : cette évolution est évaluée séparément à partir des mesures intérieures. Le débit réellement renouvelé et les échanges d’humidité avec les parois ne sont pas mesurés ici.';
 box.className=result.humidDurationMs>result.dryDurationMs?'advice warn':'advice';
 box.textContent=message;
}

function renderTemporalAnalysis(data){
 const dailyBox=$('dailyTrends'), hourlyBox=$('hourlyPatterns'), anomalyBox=$('rapidChanges');
 const daily=summarizeDailyTrends(data);
 if(!daily.days.length){
  dailyBox.textContent='Pas assez de températures et d’humidités valides pour établir une tendance journalière.';
 }else{
  const rows=daily.days.slice(-7).map(d=>{
   const parts=d.date.split('-').map(Number),date=new Date(parts[0],parts[1]-1,parts[2]);
   return date.toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit',month:'2-digit'})+
    ' : '+fmt(d.medianRH)+' % HR · '+fmt(d.medianAbsoluteHumidity)+' g/m³ HA · '+d.sampleCount+' relevés';
  });
  let message='Médianes journalières du salon (7 derniers jours disponibles) : '+rows.join(' | ')+'. ';
  if(daily.changeRH!=null){
   const direction=daily.changeRH>0?'hausse':daily.changeRH<0?'baisse':'stabilité';
   message+='Entre les deux derniers jours suffisamment documentés : '+direction+' de '+fmt(Math.abs(daily.changeRH))+' points d’humidité relative et variation de '+fmt(daily.changeAbsoluteHumidity)+' g/m³ d’humidité absolue.';
  }else message+='Il faut au moins 3 relevés par jour et deux jours suffisamment documentés pour calculer une évolution.';
  dailyBox.textContent=message;
 }
 const hourly=analyzeHourlyPatterns(data,3);
 hourlyBox.textContent='Profils par tranche de 6 h (médiane salon ; minimum 3 relevés) : '+hourly.buckets.map(b=>
  b.label+' : '+(b.medianRH==null?'données insuffisantes':fmt(b.medianRH)+' % HR · '+fmt(b.medianDelta)+' g/m³ écart HA · '+b.sampleCount+' relevés')
 ).join(' | ')+'.';
 const events=detectRapidChanges(data);
 if(!events.length){
  anomalyBox.className='advice';
  anomalyBox.textContent='Aucune variation rapide dépassant les seuils de surveillance n’a été détectée dans les données valides de cette période.';
 }else{
  anomalyBox.className='advice warn';
  anomalyBox.textContent='Variations rapides à examiner (ce ne sont pas des diagnostics de panne) : '+events.slice(-5).reverse().map(e=>{
   const start=new Date(e.start).toLocaleString('fr-FR'),end=new Date(e.end).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
   return start+' → '+end+' : '+(e.deltaRH>0?'+':'')+fmt(e.deltaRH)+' points HR, '+(e.deltaAbsoluteHumidity>0?'+':'')+fmt(e.deltaAbsoluteHumidity)+' g/m³ HA';
  }).join(' | ')+(events.length>5?' | '+(events.length-5)+' autre(s) événement(s).':'.');
 }
}


function renderIntelligentDiagnosis(result){
 const box=$('diagnosisStatus'), evidence=$('diagnosisEvidence'), limits=$('diagnosisLimits');
 const coverageValue=$('coverageValue'), coverageDescription=$('coverageDescription'), coverageMethod=$('coverageMethod');
 const available=result.status==='analysis-available';
 if(result.observedCoveragePercent!=null){
  coverageValue.textContent=fmt(result.observedCoveragePercent)+' %';
  coverageDescription.textContent='Part de la période entre le premier et le dernier relevé couverte par des intervalles exploitables.';
  coverageMethod.textContent='Durée exploitable : '+fmt(result.observedHours)+' h sur '+fmt(result.coverageSpanHours)+' h. Les intervalles de plus de '+result.maxGapHours+' h sont exclus. Cette estimation dépend de la fréquence des relevés et ne représente pas une mesure continue.';
 }else{
  coverageValue.textContent='–';
  coverageDescription.textContent='Pas assez de relevés datés pour calculer une couverture temporelle.';
  coverageMethod.textContent='Il faut au moins deux horodatages valides distincts. Les intervalles de plus de '+result.maxGapHours+' h sont exclus.';
 }
 const confidence=formatDiagnosisConfidence(result,fmt);
 const quality=result.inputQuality;
 const inputSummary='Entrée : '+quality.inputSampleCount+' lignes · '+quality.acceptedSampleCount+' retenues après contrôle et dédoublonnage · '+quality.excludedSampleCount+' écartées ou regroupées ('+quality.missingTimestampCount+' sans horodatage, '+quality.incompleteSensorRecordCount+' incomplètes, '+quality.implausibleSensorRecordCount+' avec valeurs hors plage, '+quality.placeholderSensorRecordCount+' relevés de remplacement, '+quality.transientSpikeRecordCount+' pics isolés, '+quality.duplicateTimestampCount+' doublons). Les catégories peuvent se chevaucher.';
 box.className=available?'advice good':'advice warn';
 box.textContent=(available?'Analyse possible avec les données disponibles. ':'Diagnostic non concluant pour le moment. ')+confidence+'. '+inputSummary;
 if(result.medianSampleIntervalMinutes!=null){
  box.textContent+=' Intervalle médian entre relevés : '+fmt(result.medianSampleIntervalMinutes)+' min.';
 }
 if(result.excludedGapCount){
  box.textContent+=' '+result.excludedGapCount+' interruption(s) de plus de '+result.maxGapHours+' h exclue(s)';
  if(result.largestExcludedGapHours>0)box.textContent+=' ; plus longue : '+fmt(result.largestExcludedGapHours)+' h';
  box.textContent+='.';
 }
 evidence.replaceChildren();
 if(!result.observations.length){
  const empty=document.createElement('p');
  empty.className='muted';
  empty.textContent='Aucun constat ne peut être établi avec les mesures disponibles.';
  evidence.append(empty);
 }else{
  result.observations.forEach((item,index)=>{
   const article=document.createElement('article');
   const heading=document.createElement('h4');
   const detail=document.createElement('p');
   const action=document.createElement('p');
   const tag=document.createElement('span');
   const level=item.level==='positive'?'favorable':item.level==='caution'?'à surveiller':'information';
   article.className='diagnosis-item diagnosis-'+(item.level==='positive'?'positive':item.level==='caution'?'caution':'info');
   tag.className='diagnosis-tag';
   tag.textContent=level;
   heading.textContent=(index+1)+'. '+item.title;
   detail.textContent=item.detail;
   action.className='diagnosis-action';
   action.textContent='À faire : '+item.recommendation;
   article.append(tag,heading,detail,action);
   if(item.basis&&Object.keys(item.basis).length){
    const proof=document.createElement('details');
    proof.className='diagnosis-proof';
    const proofTitle=document.createElement('summary');
    proofTitle.textContent='Voir les mesures et les critères';
    const list=document.createElement('dl');
    const labels={
     candidateWindowCount:'Tranches horaires exploitables',
     candidatePairCount:'Paires de tranches examinées',
     pairsWithTwoCommonDays:'Paires avec au moins deux jours communs',
     pairsMeetingDailyMinimum:'Paires respectant le minimum quotidien',
     minimumSamplesPerWindow:'Minimum de relevés par tranche',
     minimumDistinctDaysPerWindow:'Minimum de jours par tranche',
     minimumSharedDays:'Minimum de jours communs',
     minimumSamplesPerWindowAndDay:'Minimum de relevés par tranche et par jour',
     validSamples:'Relevés valides',requiredSamples:'Minimum de relevés requis',
     distinctDays:'Jours distincts',requiredDays:'Minimum de jours requis',
     observedHours:'Durée exploitable',requiredObservedHours:'Durée minimale requise',
     medianIndoorMinusIncomingHA:'Écart médian salon − air entrant',
     threshold:'Seuil appliqué',durationShare:'Part des durées observées',
     requiredDurationShare:'Part minimale requise',dryDurationShare:'Air entrant plus sec',
     humidDurationShare:'Air entrant plus humide',dominanceThreshold:'Seuil de dominance',
     firstDate:'Première date comparée',lastDate:'Dernière date comparée',
     baselineWindowStartDate:'Début de la fenêtre initiale',baselineWindowEndDate:'Fin de la fenêtre initiale',
     baselineDailyValues:'Relevés journaliers — fenêtre initiale',recentDailyValues:'Relevés journaliers — fenêtre récente',
     recentWindowStartDate:'Début de la fenêtre récente',recentWindowEndDate:'Fin de la fenêtre récente',
     baselineWindowSpanDays:'Étendue de la fenêtre initiale (jours)',recentWindowSpanDays:'Étendue de la fenêtre récente (jours)',totalComparisonSpanDays:'Étendue totale comparée (jours)',
     firstMedianAbsoluteHumidity:'Humidité absolue médiane au départ',
     lastMedianAbsoluteHumidity:'Humidité absolue médiane à la fin',
     baselineMedianAbsoluteHumidity:'Médiane de la première fenêtre',
     recentMedianAbsoluteHumidity:'Médiane de la dernière fenêtre',
     baselineMedianRelativeHumidity:'Humidité relative médiane — fenêtre initiale',recentMedianRelativeHumidity:'Humidité relative médiane — fenêtre récente',
     baselineMedianTemperature:'Température intérieure médiane — fenêtre initiale',recentMedianTemperature:'Température intérieure médiane — fenêtre récente',
     baselineIncomingMedianAbsoluteHumidity:'Humidité absolue médiane de l’air entrant — fenêtre initiale',
     recentIncomingMedianAbsoluteHumidity:'Humidité absolue médiane de l’air entrant — fenêtre récente',
     incomingAbsoluteHumidityChange:'Évolution de l’humidité absolue entrante',indoorMinusIncomingChange:'Évolution de l’écart salon − air entrant',
     baselineIndoorMinusIncomingMedian:'Écart salon − air entrant — fenêtre initiale',
     recentIndoorMinusIncomingMedian:'Écart salon − air entrant — fenêtre récente',
     eligibleDays:'Jours suffisamment échantillonnés',
     minimumDailySamples:'Relevés minimum par jour',daysPerWindow:'Jours par fenêtre',
     risingDays:'Jours orientés à la hausse',fallingDays:'Jours orientés à la baisse',minimumDirectionalDays:'Jours directionnels minimum',
     change:'Évolution mesurée',timeWindow:'Tranche horaire retenue',
     aggregationMethod:'Méthode d’agrégation',
     medianDelta:'Écart médian observé',sampleCount:'Nombre de relevés',
     dayCount:'Nombre de jours'
    };
    const percentKeys=new Set(['durationShare','requiredDurationShare','dryDurationShare','humidDurationShare','dominanceThreshold']);
    const hourKeys=new Set(['observedHours','requiredObservedHours']);
    const humidityKeys=new Set(['medianIndoorMinusIncomingHA','firstMedianAbsoluteHumidity','lastMedianAbsoluteHumidity','baselineMedianAbsoluteHumidity','recentMedianAbsoluteHumidity','baselineIncomingMedianAbsoluteHumidity','recentIncomingMedianAbsoluteHumidity','incomingAbsoluteHumidityChange','baselineIndoorMinusIncomingMedian','recentIndoorMinusIncomingMedian','indoorMinusIncomingChange','change','medianDelta','threshold']);
    const relativeHumidityKeys=new Set(['baselineMedianRelativeHumidity','recentMedianRelativeHumidity']);
    const temperatureKeys=new Set(['baselineMedianTemperature','recentMedianTemperature']);
    Object.entries(item.basis).forEach(([key,value])=>{
     if(key==='unit'||value==null||!labels[key])return;
     const term=document.createElement('dt');
     const description=document.createElement('dd');
     term.textContent=labels[key];
     let shown;
     if(typeof value==='number'){
      if(percentKeys.has(key))shown=(value*100).toLocaleString('fr-FR',{maximumFractionDigits:1})+' %';
      else if(hourKeys.has(key))shown=value.toLocaleString('fr-FR',{maximumFractionDigits:1})+' h';
      else if(relativeHumidityKeys.has(key))shown=value.toLocaleString('fr-FR',{maximumFractionDigits:1})+' %';
      else if(temperatureKeys.has(key))shown=value.toLocaleString('fr-FR',{maximumFractionDigits:1})+' °C';
      else if(humidityKeys.has(key))shown=value.toLocaleString('fr-FR',{maximumFractionDigits:2})+' g/m³';
      else shown=value.toLocaleString('fr-FR',{maximumFractionDigits:1});
     }else shown=String(value);
     description.textContent=shown;
     list.append(term,description);
    });
    proof.append(proofTitle,list);
    article.append(proof);
   }
   evidence.append(article);
  });
 }
 const method=document.createElement('details');
 method.className='diagnosis-method';
 const methodTitle=document.createElement('summary');
 methodTitle.textContent='Méthode et seuils utilisés';
 const methodText=document.createElement('p');
 methodText.textContent='Version '+result.methodology.version+' · écart hygrométrique : '+fmt(result.methodology.dryDeltaThreshold)+' g/m³ · évolution intérieure : '+fmt(result.methodology.trendDeltaThreshold)+' g/m³ · tendance durable : 6 jours exploitables minimum, répartis en deux fenêtres de 3 jours ; chaque fenêtre tient en 4 jours calendaires maximum et les deux fenêtres couvrent 14 jours maximum · minimum '+result.methodology.minimumSamples+' relevés sur '+result.methodology.minimumDistinctDays+' jours et '+result.methodology.minimumObservedHours+' h exploitables · interruptions de plus de '+fmt(result.methodology.maximumGapHours)+' h exclues · dominance requise : '+Math.round(result.methodology.dominantDurationShare*100)+' % · tranches horaires de '+result.methodology.hourlyBucketHours+' h (au moins '+result.methodology.hourlyMinimumSamples+' relevés au total et '+result.methodology.hourlyMinimumDailySamples+' relevés par jour sur au moins '+result.methodology.hourlyMinimumSharedDays+' jours communs). Le niveau de robustesse tient aussi compte de la couverture temporelle (20 % pour modérée, 50 % pour élevée), de la part de lignes retenues (70 % / 90 %) et d’au moins 3 relevés sur chaque jour compté.';
 method.append(methodTitle,methodText);
 evidence.append(method);
 limits.textContent='À garder en tête : '+result.limits.join(' ');
}

/* Affichage de la comparaison calculée par le module d'analyse. */
function analyzeSpeeds(data){
 const min=Number($('minSamples').value);
 const result=analyzeSpeedLevels(data,min,Number($('targetRH').value));
 const groups=result.groups;
 let html='<table><thead><tr><th>Niveau manuel</th><th>Relevés</th><th>Jours mesurés</th><th>Maximum de jours communs avec un autre niveau</th><th>HR médiane</th><th>HA salon</th><th>Écart HA</th><th>Temps couvert</th><th>RPM médian</th><th>Part avec air entrant plus sec</th></tr></thead><tbody>';
 for(const g of groups){
  const span=g.spanHours>=24?fmt(g.spanHours/24)+' j':g.spanHours>0?fmt(g.spanHours)+' h':'–';
  html+='<tr><td>'+g.v+'</td><td>'+g.n+'</td><td>'+g.daysCovered+'</td><td>'+g.sharedDays+'</td><td>'+(g.rh==null?'–':fmt(g.rh)+' %')+'</td><td>'+(g.ha==null?'–':fmt(g.ha)+' g/m³')+'</td><td>'+(g.delta==null?'–':fmt(g.delta)+' g/m³')+'</td><td>'+span+'</td><td>'+(g.rpm==null?'–':fmt(g.rpm)+' ('+g.rpmSamples+')')+'</td><td>'+(g.dryingShare==null?'–':fmt(g.dryingShare*100)+' % ('+g.deltaSamples+')')+'</td></tr>';
 }
 html+='</tbody></table>';
 const usable=groups.filter(g=>g.n>=min);
 let advice='';
 if(result.status==='no-speed-data')advice='Aucun relevé ne contient un niveau manuel identifié. Les codes bruts VMI+ ne sont volontairement pas assimilés aux niveaux 1/2/3. L’analyse reste donc indisponible avec cet import seul.';
 else if(result.status==='insufficient')advice='Données insuffisantes : il faut au moins '+min+' relevés identifiés par niveau pour établir une comparaison. Les résultats partiels restent visibles mais ne permettent pas de conclure.';
 else advice='Comparaison descriptive disponible pour '+usable.map(g=>'niveau '+g.v).join(', ')+'. Le nombre de jours communs affiché correspond au meilleur recoupement avec un seul autre niveau, et non à l’addition de dates provenant de plusieurs comparaisons. Les statistiques générales restent descriptives : les heures, la météo et l’occupation peuvent différer. Aucun niveau n’est désigné comme optimal.';
 const context=analyzeSpeedTimeContext(data,{minSamples:5,minDays:2});
 let contextHtml='<h4>Comparaison par tranche horaire et dates communes</h4><p class="muted">Chaque paire de niveaux est comparée séparément, dans la même tranche de 6 h et uniquement sur les mêmes dates calendaires. Il faut au moins 2 dates communes et 5 relevés par niveau sur ces dates. Les relevés sont d’abord résumés par jour, puis chaque jour reçoit le même poids dans la médiane finale.</p>';
 const readyComparisons=context.comparisons.filter(item=>item.ready);
 if(!readyComparisons.length){
  const overlaps=context.comparisons.filter(item=>item.sharedDayCount>0);
  if(!overlaps.length){
   contextHtml+='<div class="advice">Aucune date commune n’a été trouvée entre deux niveaux manuels dans une même tranche horaire. Il n’est donc pas possible de neutraliser suffisamment les différences de dates. Les codes bruts Vitesse ne sont pas utilisés.</div>';
  }else{
   contextHtml+='<table><thead><tr><th>Horaire</th><th>Paire de niveaux</th><th>Dates communes</th><th>Relevés sur ces dates</th><th>État</th></tr></thead><tbody>';
   for(const item of overlaps){
    contextHtml+='<tr><td>'+item.label+'</td><td>'+item.speeds[0]+' / '+item.speeds[1]+'</td><td>'+item.sharedDayCount+' / '+context.minDays+'</td><td>'+item.sampleCountFirst+' / '+item.sampleCountSecond+'</td><td>'+item.reason+'</td></tr>';
   }
   contextHtml+='</tbody></table><div class="advice">Les recoupements actuels ne satisfont pas les critères minimaux. Aucune médiane comparative n’est affichée : c’est préférable à une comparaison trompeuse.</div>';
  }
 }else{
  contextHtml+='<table><thead><tr><th>Horaire</th><th>Paire</th><th>Jours communs</th><th>Relevés A / B</th><th>HA air entrant A / B</th><th>Écart HA A / B</th><th>Écart météo B − A</th><th>Différence d’écart B − A</th></tr></thead><tbody>';
  for(const item of readyComparisons){
   const first=item.first,second=item.second;
   const incoming=first.medianIncomingHA==null||second.medianIncomingHA==null?'–':fmt(first.medianIncomingHA)+' / '+fmt(second.medianIncomingHA)+' g/m³';
   const delta=first.medianDeltaHA==null||second.medianDeltaHA==null?'–':fmt(first.medianDeltaHA)+' / '+fmt(second.medianDeltaHA)+' g/m³';
   const weatherDifference=item.medianIncomingHADifference==null?'–':(item.medianIncomingHADifference>0?'+':'')+fmt(item.medianIncomingHADifference)+' g/m³';
   const deltaDifference=item.medianDeltaHADifference==null?'–':(item.medianDeltaHADifference>0?'+':'')+fmt(item.medianDeltaHADifference)+' g/m³';
   contextHtml+='<tr><td>'+item.label+'</td><td>'+item.speeds[0]+' / '+item.speeds[1]+'</td><td>'+item.sharedDayCount+'</td><td>'+item.sampleCountFirst+' / '+item.sampleCountSecond+'</td><td>'+incoming+'</td><td>'+delta+'</td><td>'+weatherDifference+'</td><td>'+deltaDifference+'</td></tr>';
  }
  contextHtml+='</tbody></table><div class="advice">HA air entrant = contexte hygrométrique de l’air extérieur introduit. « Écart météo B − A » mesure la différence d’humidité absolue entrante entre les deux modes. L’écart HA = humidité absolue intérieure moins air entrant ; « Différence d’écart » est calculée date par date avant agrégation. Les deux niveaux sont mesurés les mêmes jours et dans la même tranche, mais pas nécessairement aux mêmes minutes. Cette comparaison ne contrôle pas l’occupation, les apports d’humidité ni tous les écarts météo ; elle ne prouve pas un effet causal et ne désigne pas une vitesse optimale.</div>';
 }

 const periods=compareOperatingPeriods(data,{periodDays:7,minSamples:12,minDays:3});
 let periodHtml='<h4>Évolution entre deux périodes successives</h4><p class="muted">Comparaison sur 7 jours consécutifs, à Mode et tranche horaire identiques. Minimum : 12 relevés et 3 jours distincts dans chacune des deux périodes.</p>';
 if(periods.status!=='comparison-available'){
  periodHtml+='<div class="advice">Pas encore assez de données Mode réparties sur deux périodes successives comparables. Il faut au moins 12 relevés sur 3 jours dans chaque période, pour un même Mode et une même tranche horaire. Les codes Vitesse bruts ne sont pas utilisés.</div>';
 }else{
  periodHtml+='<p class="muted">Période précédente : '+periods.periods[0].start+' au '+periods.periods[0].end+' · Période récente : '+periods.periods[1].start+' au '+periods.periods[1].end+'.</p>';
  periodHtml+='<table><thead><tr><th>Mode / horaire</th><th>Relevés / jours<br>précédent → récent</th><th>Débit (m³/h)<br>médiane · Δ</th><th>RPM<br>médiane · Δ</th><th>PWM brut<br>médiane · Δ</th><th>Pression moteur brute<br>médiane · Δ</th></tr></thead><tbody>';
  for(const item of periods.comparisons.filter(entry=>entry.comparable)){
   const show=key=>{
    const value=item.deltas[key];
    if(!value)return '–';
    const percent=value.relativePercent==null?'': ' ('+(value.relativePercent>0?'+':'')+fmt(value.relativePercent)+' %)';
    return fmt(value.previous)+' → '+fmt(value.current)+' · '+(value.absolute>0?'+':'')+fmt(value.absolute)+percent;
   };
   periodHtml+='<tr><td>'+item.mode+' · '+item.label+'</td><td>'+item.previous.sampleCount+'/'+item.previous.dayCount+' → '+item.current.sampleCount+'/'+item.current.dayCount+'</td><td>'+show('debit')+'</td><td>'+show('rpm')+'</td><td>'+show('vmiPwmRaw')+'</td><td>'+show('motorPressureRaw')+'</td></tr>';
  }
  periodHtml+='</tbody></table><div class="advice">Les écarts sont descriptifs, sans seuil automatique d’alerte. Une évolution du débit, du régime ou des signaux bruts ne prouve pas un filtre encrassé ni une panne. Les changements de météo, d’installation, de réglage, d’entretien et les conditions d’utilisation peuvent expliquer une partie des différences.</div>';
 }
 $('speedAnalysis').innerHTML=html+'<div class="advice">'+advice+'</div>'+contextHtml+periodHtml;
}










function render(){
 const data=selectedData();
 const analysisData=selectedHistoricalData();
 const dashboardData=$('dashboardDataStatus');
 const dashboardAnalysis=$('dashboardAnalysisStatus');
 dashboardData.textContent=analysisData.length?`${analysisData.length} relevés historiques dans la période sélectionnée.`:'Aucun relevé historique exploitable dans la période sélectionnée. Importe un export VMI+.';
 const dashboardDiagnosis=getHygrometricDiagnosis(analysisData);
 dashboardAnalysis.textContent=dashboardDiagnosis.status==='analysis-available'?'Des constats hygrométriques peuvent être établis à partir de l’historique.':'Historique encore insuffisant pour établir un diagnostic fiable.';
  const rangeLabel=selectedDate?'jour '+selectedDate:(daysSetting?daysSetting+' derniers jours':'toute la période');
 $('historyStatus').textContent=`Graphiques : ${data.length} relevés · historique importé / VMI · ${rangeLabel}.`;
 const lastRpm=[...hist].reverse().find(r=>Number.isFinite(r.rpm));
 $('rpm').textContent=lastRpm?String(lastRpm.rpm):'–';
 const quality=getDataQuality(analysisData);
 renderVmiAssistant(analysisData,{targetRH:Number($('targetRH').value),minSamples:Number($('minSamples').value),onError:log});
 const qualityBox=$('dataQuality');
 const coreCoverage=quality.fieldCoverage.filter(field=>quality.coreSensorKeys.includes(String(field.key)));
 const missingDetails=coreCoverage.filter(field=>Number(field.missingCount)>0)
  .map(field=>`${field.label} : ${field.missingCount} absent(s)`);
 const invalidDetails=quality.fields.map(field=>`${field.label} : ${field.invalidCount} aberrant(s)`);
 const coverageText=quality.total
  ? `${quality.completeHygrometricRecords}/${quality.total} relevés avec les quatre mesures présentes (air intérieur et air entrant) (${fmt(quality.hygrometricCoveragePercent)} %).`
  : 'Aucun relevé historique dans la période sélectionnée.';
 const missingText=missingDetails.length
  ? ' Mesures absentes : '+missingDetails.join(' · ')+'.'
  : '';
 const invalidText=invalidDetails.length
  ? ` ${quality.affectedRecords} relevé(s) contiennent des valeurs physiquement improbables (${invalidDetails.join(' · ')}). Ces valeurs sont conservées dans l’historique et les exports, mais écartées des calculs concernés.`
  : ' Aucune valeur physiquement aberrante détectée sur les capteurs contrôlés.';
 const spikeText=quality.transientSpikes.count
  ? ' '+quality.transientSpikes.count+' pic(s) isolé(s) à vérifier : '+quality.transientSpikes.candidates.slice(0,5).map(item=>item.label+' ('+fmt(item.value)+' '+item.unit+', '+new Date(item.timestamp).toLocaleString('fr-FR')+')').join(' · ')+'. Un pic isolé est un indice de variation brusque, pas une preuve de panne.'
  : ' Aucun pic isolé répondant aux critères temporels n’a été détecté.';
 qualityBox.className=quality.hasAnomalies||quality.transientSpikes.count?'advice warn':'advice';
 qualityBox.textContent='Contrôle qualité de l’historique analysé : '+coverageText+missingText+invalidText+spikeText+' Les données manquantes réduisent la couverture ; elles ne sont pas considérées comme des anomalies.';
 renderCharts(data,selectedDate,$);
 renderStateTelemetryPanel();
 renderRecommendation(analysisData,{container:$('recommendation'),targetRH:Number($('targetRH').value),median,absoluteHumidity,isPlausibleTemperature,isPlausibleHumidity,format:fmt});renderSeasonalAdvice(analysisData,{container:$('seasonalAdvice'),analyzeSeasonalVentilation,format:fmt,formatShort:fmtShort});renderHygrometricPeriods(analysisData);renderIntelligentDiagnosis(dashboardDiagnosis);
 renderTemporalAnalysis(analysisData);analyzeSpeeds(analysisData);renderEnergyReadiness(analysisData);renderFanEnergyEstimate(analysisData,{fanEnergyEstimate:$('fanEnergyEstimate'),fanEnergyByMode:$('fanEnergyByMode'),summarizeFanEnergyEstimate,summarizeFanEnergyByManualMode,format:fmt,formatShort:fmtShort});renderDailyEnergyClimateContext(analysisData,{dailyEnergyClimateContext:$('dailyEnergyClimateContext'),summarizeDailyEnergyClimateContext,format:fmt});renderWeeklyDiagnostic(analysisData,{weeklyDiagnostic:$('weeklyDiagnostic'),summarizeWeeklyDiagnostic,format:fmt});renderFreshness();
}
$('targetRH').onchange=render;$('minSamples').onchange=render;
document.querySelectorAll('[data-telemetry-days]').forEach(button=>{
 button.addEventListener('click',()=>{
  stateTelemetryRangeDays=Number(button.dataset.telemetryDays)||0;
  renderStateTelemetryPanel();
 });
});

setInterval(()=>{if(cur.sal_t!==undefined)updateLiveMetrics();else $('sampleAge').textContent=buildLiveFreshnessText(lastSeen);refreshTechnicalDiagnostic()},5000);
refreshTechnicalDiagnostic();
$('copyLog').onclick=()=>navigator.clipboard.writeText(logLines.join('\n')).then(()=>showError('Journal copié.'),showError);
$('clearLog').onclick=()=>{logLines=[];$('log').textContent=''};
$('themeBtn').onclick=()=>{
 const root=document.documentElement;
 const dark=root.dataset.theme?root.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
 root.dataset.theme=dark?'light':'dark';
 try{localStorage.setItem('vmi_modulaire_theme',root.dataset.theme)}catch(error){log('Préférence de thème non enregistrée : '+(error?.message||error))}
};
try{const theme=localStorage.getItem('vmi_modulaire_theme');if(theme)document.documentElement.dataset.theme=theme}catch(error){log('Préférence de thème non récupérée : '+(error?.message||error))}
if(!bluetoothService.isAvailable())showError('Web Bluetooth indisponible : ouvre cette page en HTTPS dans Chrome sur Android.');
init().then(()=>bluetoothService.autoConnectAuthorizedDevice()).catch(e=>recordError('Initialisation impossible : '+(e.message||e)));
