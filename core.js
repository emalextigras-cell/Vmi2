'use strict';

/* Protocole Bluetooth : UUID, registres et positions d'octets déduits d'une capture réelle de VMI+. */
const SVC_C='0003cbbb-0000-1000-8000-00805f9b0131';
const CH_C='0003cbb1-0000-1000-8000-00805f9b0131';
const SVC_T='0003cab5-0000-1000-8000-00805f9b0131';
const CH_T='0003caa2-0000-1000-8000-00805f9b0131';
const $=id=>document.getElementById(id);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pad=n=>String(n).padStart(2,'0');
const DAY=864e5;
const localDay=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const dayStart=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d).getTime()};
const shiftDay=(s,k)=>{const d=new Date(dayStart(s||localDay()));d.setDate(d.getDate()+k);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const fmt=v=>Number.isFinite(v)?v.toFixed(1):'–';
const num=v=>{if(typeof v==='number')return Number.isFinite(v)?v:null;if(typeof v!=='string')return null;const n=parseFloat(v.trim().replace(',','.'));return Number.isFinite(n)?n:null};
const MIN_VALID=new Date(2025,0,1).getTime();   /* avant cette date, l'horloge de la VMI est forcément fausse */
const HIST_MAX=100000;

let dev=null,chC=null,chT=null,pollTimer=null,snapTimer=null,reconnectTimer=null;
let manualDisconnect=false,disconnectAfterDownload=false,commandQueue=Promise.resolve(),manualCommandPending=false,polling=false,autoDone=false;
let cur={},lastSeen={},live=[],hist=[],source='hist',selectedDate=null,daysSetting=30;
let logLines=[],dlFrames=0;
let download={on:false,rows:[],buf:'',total:0,sigs:new Set(),got:false,lastPacket:0,timeout:null};
const DB='VMI_PUREVENT_DB',STORE='data';
const connected=()=>!!(chC&&dev&&dev.gatt&&dev.gatt.connected);

function showError(e){$('err').textContent=e?String(e.message||e):''}
function log(s){logLines.push(`${new Date().toLocaleTimeString('fr-FR')} ${s}`);if(logLines.length>300)logLines.shift();const p=$('log');p.textContent=logLines.slice(-70).join('\n');p.scrollTop=p.scrollHeight}
function setStatus(s,isConnected=false){$('st').textContent=s;$('bleState').textContent=isConnected?'Connecté':'Déconnecté';$('conn').disabled=isConnected;$('disc').disabled=!isConnected}

/* Stockage local (IndexedDB) */
function openDB(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE)};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
let dbPromise=null;
async function db(){if(!dbPromise)dbPromise=openDB().catch(e=>{dbPromise=null;throw e});return dbPromise}
async function dbGet(k){try{const d=await db();return await new Promise((res,rej)=>{const r=d.transaction(STORE,'readonly').objectStore(STORE).get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}catch(e){log('IndexedDB lecture : '+e.message);return null}}
async function dbSet(k,v){try{const d=await db();await new Promise((res,rej)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).put(v,k);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)})}catch(e){log('IndexedDB écriture : '+e.message)}}

/* Reprise des données des anciennes versions (heure affichée mémorisée comme de l'UTC) */
const wallUtcToLocal=t=>{const d=new Date(t);return new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds()).getTime()};
const fromOldRow=a=>({t:wallUtcToLocal(a[0]),st:a[1],sh:a[2],t1:a[3],h1:a[4],te:a[5],he:a[6],rpm:a[7],fil:a[8],vit:null,boost:null,hol:null});
async function readOldDatabase(){
 try{
  if(!indexedDB.databases)return null;
  const list=await indexedDB.databases();
  if(!list.some(d=>d.name==='VMI_DB'))return null;
  const old=await new Promise((res,rej)=>{const r=indexedDB.open('VMI_DB');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  if(!old.objectStoreNames.contains('vmi_store')){old.close();return null}
  const get=k=>new Promise((res,rej)=>{const r=old.transaction('vmi_store','readonly').objectStore('vmi_store').get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  const out={hist:await get('vmi_hist'),live:await get('vmi_live')};old.close();return out;
 }catch(e){return null}
}
async function init(){
 let l=await dbGet('live'),h=await dbGet('hist');
 live=Array.isArray(l)?l:[];hist=Array.isArray(h)?h:[];
 const migrated=await dbGet('migrated');
 if(!migrated&&!hist.length&&!live.length){
  const old=await readOldDatabase();
  if(old){
   if(Array.isArray(old.hist))hist=old.hist.map(fromOldRow);
   if(Array.isArray(old.live))live=old.live;
  }
  if(!hist.length){try{const x=JSON.parse(localStorage.getItem('vmi_hist')||'[]');if(Array.isArray(x))hist=x.map(fromOldRow)}catch(e){}}
  if(!live.length){try{const x=JSON.parse(localStorage.getItem('vmi_live')||'[]');if(Array.isArray(x))live=x}catch(e){}}
  await dbSet('migrated',true);
 }
 /* Les relevés datés d'avant 2025 ont une date fausse (horloge de la VMI) et ne peuvent pas être corrigés
    sans leur compteur de jours : on les retire, un nouvel import ou téléchargement les rétablit avec la bonne date. */
 const bad=hist.filter(r=>!(r&&r.t>=MIN_VALID)).length;
 if(bad){hist=hist.filter(r=>r&&r.t>=MIN_VALID);$('importInfo').textContent=`${bad} anciens relevés à date invalide ont été retirés. Réimporte ton export VMI+ ou récupère l’historique : ils reviendront avec la bonne date.`}
 hist.sort((a,b)=>a.t-b.t);
 await dbSet('hist',hist);if(live.length)await dbSet('live',live);
 $('liveCount').textContent=live.length;render();
}
function pruneHist(){
 hist=hist.filter(r=>r&&(r.st!=null||r.sh!=null||r.te!=null||r.he!=null||r.rpm!=null||r.t1!=null||r.h1!=null));
 if(hist.length>HIST_MAX){hist=hist.slice(hist.length-HIST_MAX);log(`Historique limité à ${HIST_MAX} relevés (les plus anciens supprimés).`)}
}

/* Psychrométrie : approximation de Magnus */
function saturationVaporPressure(temp){return 6.112*Math.exp((17.62*temp)/(243.12+temp))}
function absoluteHumidity(temp,rh){
 if(!Number.isFinite(temp)||!Number.isFinite(rh)||rh<0||rh>100||temp<=-80||temp>=80)return null;
 const e=(rh/100)*saturationVaporPressure(temp);
 return 216.7*e/(temp+273.15);
}
function dewPoint(temp,rh){
 if(!Number.isFinite(temp)||!Number.isFinite(rh)||rh<=0||rh>100)return null;
 const a=17.62,b=243.12,g=Math.log(rh/100)+(a*temp)/(b+temp);
 return b*g/(a-g);
}
function psychro(r){return {haIn:absoluteHumidity(r.st,r.sh),haOut:absoluteHumidity(r.te,r.he),dewIn:dewPoint(r.st,r.sh),dewOut:dewPoint(r.te,r.he)}}
function validTemp(v){return Number.isFinite(v)&&v>-40&&v<80}
