import {activeOfflineWaste,captureOfflineWaste,offlineWasteEvents,syncOfflineWaste,berlinDay} from './offline-waste-core.js';
const SUPABASE_URL='https://dherkuguwqffwyzaigag.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_acXolOKrUobf5wamZJLNmg_tw2_Egzk'; // browser-public key; no service role
const SESSION_KEY='duschl_supabase_session_v1';
const byId=id=>document.getElementById(id);
const choose=byId('binList'),status=byId('status'),pendingBox=byId('pendingList');
let snapshot=null,selectedBin=null,busy=false;
function msg(t,error=false){status.textContent=t;status.classList.toggle('error',error);}
function make(tag,text,cls){
  const n=document.createElement(tag);if(text!=null)n.textContent=String(text);
  if(cls)n.className=cls;return n;
}
async function currentSession(expectedUser){
  let session;
  try{session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{session=null;}
  if(!session?.access_token||!session?.refresh_token)throw Error('Bitte online in der Objektplattform anmelden.');
  if(session.expires_at && session.expires_at*1000<Date.now()+60000){
    const res=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{
      method:'POST',headers:{apikey:PUBLISHABLE_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({refresh_token:session.refresh_token})
    });
    if(!res.ok)throw Error('Sitzung abgelaufen. Bitte erneut anmelden.');
    session=await res.json();
    localStorage.setItem(SESSION_KEY,JSON.stringify(session));
  }
  const headers={apikey:PUBLISHABLE_KEY,'Authorization':'Bearer '+session.access_token};
  const verified=await fetch(SUPABASE_URL+'/auth/v1/user',{headers});
  if(!verified.ok)throw Error('Anmeldung nicht mehr gültig. Bitte online anmelden.');
  const user=await verified.json();
  if(user.id!==expectedUser)throw Error('Falsches Benutzerkonto. Offline-Daten werden nicht übertragen.');
  return headers;
}
async function sync(){
  if(busy||!snapshot||navigator.onLine===false)return;
  const pending=(await offlineWasteEvents(snapshot.userId,snapshot.organizationId))
    .filter(e=>e.status==='pending');
  if(!pending.length)return;
  busy=true;msg('Synchronisiere '+pending.length+' lokale Erfassung(en) …');
  try{
    const headers=await currentSession(snapshot.userId);
    const result=await syncOfflineWaste({
      userId:snapshot.userId,organizationId:snapshot.organizationId,
      api:async(path,options)=>{
        const res=await fetch(SUPABASE_URL+'/rest/v1/'+path,{
          ...options,headers:{...headers,...(options.headers||{})}
        });
        if(!res.ok){
          const body=await res.json().catch(()=>({}));
          throw Error(body.message||('HTTP '+res.status));
        }
        return await res.json();
      }
    });
    msg(result.blocked
      ?result.sent+' übertragen, '+result.blocked+' Konflikt(e) – bitte online prüfen.'
      :result.sent+' übertragen. '+result.pending+' ausstehend.',!!result.blocked);
  }catch(e){msg('Noch nicht synchronisiert: '+String(e.message||e),true);}
  finally{busy=false;await render();}
}
async function capture(bin,pct){
  if(busy)return;
  busy=true;
  try{
    await captureOfflineWaste({snapshot,binId:bin.id,fillPercent:pct,note:byId('note').value});
    byId('note').value='';selectedBin=null;
    msg(bin.code+' · '+pct+' % sicher lokal vorgemerkt. Upload bei Internetverbindung.');
  }catch(e){msg(String(e.message||e),true);}
  finally{busy=false;await render();if(navigator.onLine)void sync();}
}
async function render(){
  if(!snapshot)return;
  byId('objectName').textContent=snapshot.objectName;
  byId('offlineUntil').textContent='Offline-Freigabe bis '+new Date(snapshot.expiresAt).toLocaleString('de-DE');
  const events=await offlineWasteEvents(snapshot.userId,snapshot.organizationId);
  pendingBox.replaceChildren();
  const counter=make('strong',events.length+' lokal gespeicherte Erfassung(en)');
  pendingBox.append(counter);
  events.forEach(e=>{
    const p=make('p',e.binCode+' · '+e.fillPercent+' % · '+e.observedDate+
      (e.status==='conflict'?' · KONFLIKT: '+(e.lastError||'Bitte prüfen'):' · Wartet auf Sync'));
    pendingBox.append(p);
  });
  choose.replaceChildren();
  const day=berlinDay(new Date().toISOString());
  const token=new URLSearchParams(location.search).get('muelltonne');
  const exact=token?snapshot.bins.find(b=>b.qr_token===token):null;
  if(token&&!exact)msg('Dieser QR-Code ist nicht für das vorbereitete Objekt gespeichert.',true);
  const bins=exact?[exact]:snapshot.bins;
  for(const bin of bins){
    const recorded=events.some(e=>e.binId===bin.id&&e.observedDate===day);
    const box=make('section',null,'bin');
    box.append(make('h2',bin.code));
    if(recorded){box.append(make('p','Heute bereits lokal erfasst.'));choose.append(box);continue;}
    const fills=make('div',null,'fills');
    for(const pct of [0,25,50,75,100]){
      const b=make('button',pct===0?'Leer':pct+' %');
      b.type='button';b.addEventListener('click',()=>void capture(bin,pct));fills.append(b);
    }
    box.append(fills);choose.append(box);
  }
}
async function boot(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(e=>console.warn('Offline-Cache',e));
  }
  try{
    snapshot=await activeOfflineWaste();
    if(!snapshot){msg('Keine gültige Offline-Freigabe. Objekt online öffnen und Müllmanagement vorbereiten.',true);return;}
    await render();
    msg(navigator.onLine?'Offline-Erfassung bereit – online wird automatisch abgeglichen.':'Offline bereit. Erfassungen werden lokal gesichert.');
    if(navigator.onLine)void sync();
  }catch(e){msg('Offline-Modus nicht verfügbar: '+String(e.message||e),true);}
}
byId('syncButton').addEventListener('click',()=>void sync());
window.addEventListener('online',()=>void sync());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void sync();});
setInterval(()=>{if(!document.hidden&&navigator.onLine)void sync();},60000);
void boot();
