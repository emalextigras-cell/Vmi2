if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{})}

setInterval(()=>{if(cur.sal_t!==undefined)updateLiveMetrics()},5000);
$('copyLog').onclick=()=>navigator.clipboard.writeText(logLines.join('\n')).then(()=>showError('Journal copié.'),showError);
$('clearLog').onclick=()=>{logLines=[];$('log').textContent=''};
$('themeBtn').onclick=()=>{
 const root=document.documentElement;
 const dark=root.dataset.theme?root.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
 root.dataset.theme=dark?'light':'dark';
 try{localStorage.setItem('vmi_theme',root.dataset.theme)}catch(e){}
};
try{const theme=localStorage.getItem('vmi_theme');if(theme)document.documentElement.dataset.theme=theme}catch(e){}
if(!navigator.bluetooth)showError('Web Bluetooth indisponible : ouvre cette page en HTTPS dans Chrome sur Android.');
init();
