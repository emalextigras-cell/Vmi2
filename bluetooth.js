/* Trames */
function crc(data){let c=0;for(const b of data){c^=b;for(let i=0;i<8;i++)c=(c&0x80)?(((c<<1)^1)&255):((c<<1)&255)}return c^0x13}
function frame(reg,val){const d=[0xA5,0xB6,0x10,0x06,0x05,reg,0,0,0,val];return new Uint8Array([...d,crc(d)])}
function timeFrame(d){const b=[0xA5,0xB6,0x1A,0x06,0x06,d.getFullYear()%100,d.getMonth()+1,d.getDate(),d.getHours(),d.getMinutes(),d.getSeconds()];return new Uint8Array([...b,crc(b)])}
const hex=a=>Array.from(a,x=>x.toString(16).padStart(2,'0')).join('');
function writeFrame(bytes){
 const task=commandQueue.then(async()=>{
  if(!connected())throw new Error('VMI non connectée');
  if(chC.properties&&chC.properties.write&&typeof chC.writeValueWithResponse==='function'){
   await chC.writeValueWithResponse(bytes);
  }else if(chC.properties&&chC.properties.writeWithoutResponse&&typeof chC.writeValueWithoutResponse==='function'){
   await chC.writeValueWithoutResponse(bytes);
  }else if(typeof chC.writeValue==='function'){
   await chC.writeValue(bytes);
  }else{
   throw new Error('Cette caractéristique Bluetooth ne permet pas l’écriture.');
  }
  log('> '+hex(bytes));
  await sleep(350);
  return true;
 });
 const result=task.catch(e=>{
  showError('Échec de l’envoi Bluetooth : '+(e.message||e));
  log('Erreur commande : '+(e.message||e));
  return false;
 });
 commandQueue=result.then(()=>{},()=>{});
 return result;
}
const send=(reg,val)=>writeFrame(frame(reg,val));
async function setClock(){if(!chC){showError('Connecte-toi d’abord à la VMI.');return false}const d=new Date();const ok=await writeFrame(timeFrame(d));$('dlp').textContent=ok?'Heure envoyée : '+d.toLocaleString('fr-FR'):'Heure non envoyée.';return ok}

function onNotification(ev){
 try{handleNotification(ev)}catch(e){log('Erreur de décodage d’une trame : '+(e.message||e))}
}
function handleNotification(ev){
 const v=ev.target.value;
 const a=new Uint8Array(v.buffer,v.byteOffset,v.byteLength);
 if(a.length<3||a[0]!==0xA5||a[1]!==0xB6)return;
 const type=a[2],now=Date.now();
 if(type===0x30){
  if(!download.on)return;
  if(a.length<14){log('Trame d’historique trop courte, ignorée.');return}
  dlFrames++;if(dlFrames%200===1)log(`< trames d’historique reçues : ${dlFrames}`);
  download.got=true;download.lastPacket=now;
  let end=14;while(end<a.length&&a[end]!==0)end++;
  download.buf+=new TextDecoder('latin1').decode(a.slice(14,end));
  const lines=download.buf.split('\n');download.buf=lines.pop();lines.forEach(parseDownloadLine);
  if(download.on){
   $('dlp').textContent=`${download.rows.length} nouvelles lignes (${a[9]|(a[10]<<8)} / ${download.total||'?'} lues)`;
   armDownloadTimeout();
   if(a[13]===1){if(download.buf.trim())parseDownloadLine(download.buf);finishDownload(false)}
  }
  return;
 }
 log('< '+hex(a));
 if(type===1&&a.length>53){
  cur.filtre=a[28];cur.jours=a[26];cur.vol=a[22]|(a[23]<<8);cur.tmax=a[38];
  cur.vit=a[34]+1;cur.boost=a[44];cur.hol=a[43];cur.rpm=null;
  lastSeen.state=now;
  $('fi').textContent=cur.filtre;$('jf').textContent=cur.jours;$('vo').textContent=cur.vol;$('tm').textContent=cur.tmax;
  $('sp').textContent=cur.vit;$('bo').textContent=cur.boost?'Actif':'Arrêté';$('ho').textContent=cur.hol?'Actif':'Arrêté';
 }
 else if(type===2&&a.length>13){
  cur.sal_t=a[11];cur.sal_h=a[13];lastSeen.salon=now;
  $('tp').textContent=cur.sal_t;$('hp').textContent=cur.sal_h;
 }
 else if(type===3&&a.length>13){
  cur.s1_t=a[6];cur.s1_h=a[8];cur.s2_t=a[11];cur.s2_h=a[13];lastSeen.probes=now;
  $('ti').textContent=cur.s1_t;$('hi').textContent=cur.s1_h;$('t2').textContent=cur.s2_t;$('h2').textContent=cur.s2_h;
 }
 else if(type===4&&a.length>7){download.total=a[6]|(a[7]<<8);return}
 else return;
 updateLiveMetrics();
}
function updateLiveMetrics(){
 const freshest=Math.max(lastSeen.salon||0,lastSeen.probes||0);
 $('sampleAge').textContent=lastSeen.salon&&lastSeen.probes?'Dernières mesures reçues : '+Math.max(0,Math.round((Date.now()-freshest)/1000))+' s':'Mesures partielles : en attente des deux trames capteurs.';
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

/* Relevés en direct : dès que le salon est frais, avec les sondes si elles le sont aussi */
function takeSnapshot(){
 const now=Date.now();
 if(!lastSeen.salon||now-lastSeen.salon>90000)return;
 const pf=lastSeen.probes&&now-lastSeen.probes<=90000;
 const row={t:now,st:cur.sal_t,sh:cur.sal_h,t1:pf?cur.s1_t:null,h1:pf?cur.s1_h:null,te:pf?cur.s2_t:null,he:pf?cur.s2_h:null,
  rpm:null,fil:Number.isFinite(cur.filtre)?cur.filtre:null,vit:Number.isFinite(cur.vit)?cur.vit:null,
  boost:cur.boost!=null?cur.boost:null,hol:cur.hol!=null?cur.hol:null};
 if(!Number.isFinite(row.st)&&!Number.isFinite(row.sh))return;
 live.push(row);
 if(live.length>10000)live.splice(0,live.length-10000);
 dbSet('live',live);$('liveCount').textContent=live.length;
 if(source==='live')render();
}

/* Scrutation : pas de chevauchement, arrêt dès que la connexion tombe */
async function poll(force=false){
 if(polling||!connected()||download.on||(manualCommandPending&&!force))return;
 polling=true;
 try{for(const r of [3,6,7]){if(!connected()||download.on)break;const ok=await send(r,0);if(!ok)break}}
 finally{polling=false}
}
function startPolling(){
 clearInterval(pollTimer);clearInterval(snapTimer);
 poll();
 pollTimer=setInterval(()=>poll(),12000);
 setTimeout(takeSnapshot,15000);
 snapTimer=setInterval(takeSnapshot,300000);
}
function cleanupConnection(){clearInterval(pollTimer);clearInterval(snapTimer);chC=null;chT=null}
function onDisconnect(){
 cleanupConnection();setStatus('Déconnecté.');
 if(disconnectAfterDownload){disconnectAfterDownload=false;return}
 if(!manualDisconnect&&dev){setStatus('Connexion perdue, tentative de reconnexion…');clearTimeout(reconnectTimer);reconnectTimer=setTimeout(reconnect,4000)}
}
async function connectCharacteristics(server){
 const serviceC=await server.getPrimaryService(SVC_C);
 chC=await serviceC.getCharacteristic(CH_C);
 const serviceT=await server.getPrimaryService(SVC_T);
 chT=await serviceT.getCharacteristic(CH_T);
 await chT.startNotifications();chT.removeEventListener('characteristicvaluechanged',onNotification);chT.addEventListener('characteristicvaluechanged',onNotification);
 try{await chC.startNotifications();chC.removeEventListener('characteristicvaluechanged',onNotification);chC.addEventListener('characteristicvaluechanged',onNotification)}catch(e){log('Notifications canal commande non disponibles : '+e.message)}
}
async function connectBLE(){
 manualDisconnect=false;clearTimeout(reconnectTimer);showError('');
 if(!navigator.bluetooth){showError('Web Bluetooth indisponible. Utilise Chrome sur Android ou un navigateur compatible, en HTTPS.');return}
 try{
  dev=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:[SVC_C,SVC_T]});
  dev.removeEventListener('gattserverdisconnected',onDisconnect);dev.addEventListener('gattserverdisconnected',onDisconnect);
  setStatus('Connexion à '+(dev.name||'la VMI')+'…');
  const server=await dev.gatt.connect();await connectCharacteristics(server);
  setStatus('Connecté à '+(dev.name||'la VMI')+'.',true);startPolling();
  autoDone=false;setTimeout(autoHistory,3000);
 }catch(e){showError(e);setStatus('Connexion impossible.')}
}
async function reconnect(){
 if(manualDisconnect||!dev)return;
 try{const server=await dev.gatt.connect();await connectCharacteristics(server);setStatus('Reconnecté à '+(dev.name||'la VMI')+'.',true);startPolling()}
 catch(e){log('Reconnexion échouée : '+e.message);clearTimeout(reconnectTimer);reconnectTimer=setTimeout(reconnect,7000)}
}
$('conn').onclick=connectBLE;
$('disc').onclick=()=>{manualDisconnect=true;clearTimeout(reconnectTimer);cleanupConnection();if(dev&&dev.gatt&&dev.gatt.connected)dev.gatt.disconnect();setStatus('Déconnexion demandée.')};

/* Boutons de commande : une commande à la fois, avec vérification de l'état renvoyé par la VMI */
const EXPECT={24:v=>['vit',v+1,'Vitesse '+(v+1)],25:v=>['boost',v,'Boost '+(v?'activé':'arrêté')],26:v=>['hol',v,'Mode vacances '+(v?'activé':'arrêté')]};
document.querySelectorAll('[data-r]').forEach(b=>b.addEventListener('click',async()=>{
 if(manualCommandPending||download.on)return;
 if(!connected()){showError('VMI non connectée.');$('cmdResult').textContent='';return}
 manualCommandPending=true;
 const controls=[...document.querySelectorAll('[data-r]')];
 controls.forEach(x=>x.disabled=true);
 document.querySelectorAll('[data-r]').forEach(x=>x.setAttribute('aria-disabled','true'));
 showError('');
 const reg=Number(b.dataset.r),value=Number(b.dataset.v),[key,expected,label]=EXPECT[reg](value);
 const result=$('cmdResult');
 try{
  result.textContent='Envoi de la commande à la VMI…';
  const t0=Date.now();
  const sent=await send(reg,value);
  if(!sent){result.textContent='La commande n’a pas pu être envoyée (voir le journal Bluetooth).';return}
  result.textContent='Commande envoyée, vérification de l’état…';
  for(let i=0;i<10&&!((lastSeen.state||0)>t0);i++)await sleep(200);
  if(!((lastSeen.state||0)>t0)){await send(3,0);for(let i=0;i<10&&!((lastSeen.state||0)>t0);i++)await sleep(200)}
  if((lastSeen.state||0)>t0&&cur[key]===expected)result.textContent='✓ Confirmé par la VMI : '+label+'.';
  else if((lastSeen.state||0)>t0)result.textContent='⚠ La VMI a répondu mais l’état affiché n’est pas '+label.toLowerCase()+'. Vérifie sur la VMI ou dans VMI+.';
  else result.textContent='⚠ Commande envoyée mais aucune réponse de la VMI : l’état n’a pas pu être vérifié.';
  poll(true);
 }catch(e){
  showError(e);result.textContent='Erreur pendant la commande.';
 }finally{
  manualCommandPending=false;controls.forEach(x=>{x.disabled=false;x.setAttribute('aria-disabled','false')});
 }
}));
const setCommandsDisabled=dis=>document.querySelectorAll('[data-r]').forEach(x=>x.disabled=dis);
$('clk').onclick=setClock;
