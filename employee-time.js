/* Duschl Service · QR-Objektportal & Mitarbeiterzeiten · Pilot v3.56.0
 * Vorhandene Bewohner-QR-Codes bleiben gültig (?meldung=...).
 * Employee time: append-only server-stamped records in Supabase.
 * GPS is taken only after a deliberate booking; precise coordinates are discarded by DB trigger.
 */
(function(){
'use strict';
const VALID_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const state={objectId:'',rows:[],busy:false,loadedOrg:'',deepHandled:false};
const h=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el=id=>document.getElementById(id);
const fmt=t=>t?new Date(t).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}):'–';
const tm=t=>t?new Date(t).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):'–';
const roleTime=()=>{
 try{
  const r=String(effectiveOrganizationRole()||'');
  return !!(cloudSession?.access_token&&currentOrganizationId()
      && (hasOperationalAdminAccess()||['object_manager','staff','employee','external_contractor'].includes(r)));
 }catch(_){return false;}
};
const roleAdmin=()=>{try{return hasOperationalAdminAccess()}catch(_){return false}};
const org=()=>{try{return String(currentOrganizationId()||'')}catch(_){return ''}};
const uid=()=>{try{return String(currentUserId()||'')}catch(_){return ''}};
const findObject=id=>{try{return (db.objects||[]).find(o=>String(o.id)===String(id))}catch(_){return null}};
const objName=id=>findObject(id)?.name||'Objekt';
const escParam=s=>encodeURIComponent(s);
const gpsLabel=r=>({
 near:'GPS: nahe am Objekt',outside:'GPS: außerhalb des Bereichs',
 uncertain:'GPS ungenau',no_object_coordinates:'Objekt ohne hinterlegte GPS-Koordinaten',
 unavailable:'GPS nicht verfügbar',not_requested:'Ohne GPS-Abfrage'
}[r]||'GPS-Status unbekannt');
const typeLabel=t=>({
 shift_start:'Dienstbeginn',shift_end:'Feierabend',break_start:'Pause begonnen',
 break_end:'Pause beendet',object_in:'Objekt betreten',object_out:'Objekt verlassen'
}[t]||t);

const style=document.createElement('style');
style.id='ds-qr-office-styles-v3560';
style.textContent=`
#dsTimeHub .dst-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
#dsTimeHub .dst-eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#a5bacb;font-weight:800}
#dsTimeHub .dst-head h2{margin:6px 0 0}
#dsTimeHub .dst-muted{font-size:13px;color:#abc0d0;line-height:1.5}
#dsTimeHub .dst-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}
#dsTimeHub .dst-box{background:#0d2534;border:1px solid #345166;border-radius:14px;padding:15px;min-width:0}
#dsTimeHub .dst-box h3{margin:0 0 8px;font-size:17px}
#dsTimeHub .dst-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}
#dsTimeHub .dst-actions button{min-height:44px}
#dsTimeHub .dst-actions button:disabled{opacity:.45;cursor:not-allowed}
#dsTimeHub .dst-pill{display:inline-flex;align-items:center;gap:5px;border:1px solid #466276;padding:5px 9px;border-radius:99px;font-size:12px;color:#d8e7f1}
#dsTimeHub .dst-row{display:flex;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid #294454;align-items:flex-start}
#dsTimeHub .dst-row:last-child{border-bottom:0}
#dsTimeHub .dst-row span{font-size:12px;color:#afc1ce}
#dsTimeHub .dst-context-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}
#dsTimeHub .dst-context-actions button{min-height:44px}
#dsTimeHub #dstNotice{padding:10px;margin:10px 0;border:1px solid #466276;border-radius:10px;display:none;white-space:pre-wrap}
#dsTimeHub #dstNotice.dst-error{border-color:#e69a89;color:#ffd2c6}
#dsTimeHub #dstHistory{max-height:360px;overflow:auto}
#dsTimeHub .dst-internal-note{margin:10px 0;border-left:3px solid #d1ad61;padding:6px 10px;color:#d8cab0;font-size:12px}
#dsTimeHub .dst-onecol{grid-template-columns:1fr}
@media(max-width:700px){#dsTimeHub .dst-grid{grid-template-columns:1fr}#dsTimeHub .dst-actions button{flex:1 1 150px}}
`;
document.head.appendChild(style);

function mount(){
 if(el('dsTimeHub'))return;
 const nav=el('navOperations');
 if(nav&&!el('navEmployeeTime')){
  const btn=document.createElement('button');
  btn.id='navEmployeeTime';btn.type='button';btn.className='hidden';
  btn.innerHTML='<span class="nav-icon">◷</span><span>Arbeitszeit &amp; Objektakte</span>';
  btn.addEventListener('click',()=>openTime());
  nav.insertAdjacentElement('afterend',btn);
 }
 const main=document.querySelector('main');
 if(main){
  const section=document.createElement('section');
  section.className='section';section.id='dsTimeHub';
  // showSection requires the section id passed as-is.
  section.innerHTML=`
  <div class="dst-head"><div><div class="dst-eyebrow">DUSCHL SERVICE · PILOT</div>
  <h2>Arbeitszeit &amp; digitale Objektakte</h2></div>
  <button id="dstRefresh" type="button">↻ Aktualisieren</button></div>
  <div id="dstNotice" role="status" aria-live="polite"></div>
  <div id="dstObjectBox" class="dst-box">
    <div class="dst-eyebrow">Digitale Objektakte</div>
    <h3 id="dstObjectName">Kein Objekt gewählt</h3>
    <div id="dstObjectAddress" class="dst-muted">QR-Code am Objekt scannen oder ein zugewiesenes Objekt aus der Objektliste öffnen.</div>
    <div id="dstObjectContents"></div>
    <div id="dstObjectActions" class="dst-context-actions"></div>
  </div>
  <div class="dst-grid">
   <div class="dst-box">
    <h3>Meine Arbeitszeit</h3><div id="dstMyStatus" class="dst-muted">Wird geladen …</div>
    <div class="dst-actions" id="dstBookingActions"></div>
    <div class="dst-internal-note">QR-Scan + Schaltfläche bestätigt den Einsatz. GPS wird nur bei Check-in/Check-out mit Zustimmung punktuell abgefragt. Keine Live-Ortung.</div>
   </div>
   <div class="dst-box">
    <h3 id="dstTeamTitle">Meine Buchungen</h3><div id="dstHistory" class="dst-muted"></div>
    <div class="dst-actions"><button id="dstExport" type="button">Stundenbuchungen als CSV exportieren</button></div>
   </div>
  </div>
  <div class="dst-box" id="dstTeamBox" style="display:none;margin-top:12px">
   <h3>Einsatzübersicht · letzter bestätigter Buchungsstand</h3>
   <div class="dst-muted">Kein GPS-Live-Tracking. „Im Objekt“ bedeutet: Check-in vorhanden, Check-out noch offen.</div>
   <div id="dstTeamList"></div>
  </div>`;
  main.appendChild(section);
  el('dstRefresh').addEventListener('click',()=>loadRows());
  el('dstExport').addEventListener('click',downloadCsv);
  el('dstBookingActions').addEventListener('click',e=>{
   const b=e.target.closest('button[data-dst-event]');if(b)void book(b.dataset.dstEvent);
  });
  el('dstObjectActions').addEventListener('click',e=>{
   const b=e.target.closest('button[data-dst-page]');if(!b)return;
   const page=b.dataset.dstPage;
   if(page==='time')void book(b.dataset.dstEvent);
   else if(page==='report')location.assign('https://michi243.github.io/-duschl-objektplattform/?meldung='+escParam(state.objectId));
   else if(page==='findings_object' && typeof openObjectOpenFindings==='function')openObjectOpenFindings(state.objectId);
   else if(page==='docs_object' && typeof openObjectDocumentation==='function')openObjectDocumentation(state.objectId);
   else if(page==='construction_object' && typeof openObjectDocumentationModule==='function')openObjectDocumentationModule(state.objectId);
   else if(page==='scope_object' && typeof openObjectServicesModal==='function')openObjectServicesModal(state.objectId);
   else if(page==='reports_object' && typeof showObjectReport==='function')showObjectReport(state.objectId);
   else if(typeof showSection==='function')showSection(page);
  });
 }
 // Existing published object QR links still point to the public resident report.
 // A visible staff entrance leads to the authenticated portal without exposing internal content.
 const publicBrand=document.querySelector('#publicReportPage .public-report-brand');
 if(publicBrand&&!el('dstStaffEntrance')){
  const link=document.createElement('a');link.id='dstStaffEntrance';
  link.className='primary';link.style.cssText='display:inline-flex;margin:10px 0;padding:12px 16px;min-height:44px;align-items:center;border-radius:10px;text-decoration:none';
  const id=new URLSearchParams(location.search).get('meldung');
  link.href=VALID_ID.test(id||'')?'?objekt='+escParam(id):'?';
  link.textContent='Mitarbeiter / Verwaltung · zur Objektakte';
  publicBrand.appendChild(link);
 }
}
function notice(msg,error=false){
 const d=el('dstNotice');if(!d)return;
 d.textContent=String(msg||'');d.style.display=msg?'block':'none';
 d.classList.toggle('dst-error',!!error);
}
function navSync(){
 const nav=el('navEmployeeTime');if(nav)nav.classList.toggle('hidden',!roleTime());
 if(el('dsTimeHub')?.classList.contains('active')&&(!cloudSession?.access_token||!org())){
  // Keine Zeiterfassung anzeigen, wenn Mandantenkontext verloren geht.
  if(typeof showSection==='function')showSection('dashboard');
 }
 const deep=new URLSearchParams(location.search).get('objekt');
 if(!state.deepHandled && deep && VALID_ID.test(deep) && cloudSession?.access_token && org()
    && Array.isArray(db?.objects) && db.objects.length){
   if(findObject(deep)){
    state.deepHandled=true;
    openTime(deep);
   }
 }
}
function openTime(objectId=''){
 if(!cloudSession?.access_token||!org()){notice('Bitte anmelden und Mandanten auswählen.',true);return;}
 if(objectId && (!VALID_ID.test(objectId)||!findObject(objectId))){
  alert('Das Objekt ist für diesen Zugang nicht freigegeben.');return;
 }
 state.objectId=objectId||'';
 if(typeof showSection==='function')showSection('dsTimeHub');
 if(el('navEmployeeTime'))el('navEmployeeTime').classList.add('primary');
 renderObject();
 if(typeof cloudLoadObjectDocumentations==='function'){
  void cloudLoadObjectDocumentations().then(()=>{if(state.objectId)renderObject();}).catch(()=>{});
 }
 void loadRows();
}
window.dsTimeOpenObjectFile=(objectId)=>openTime(String(objectId||''));

async function loadRows(){
 if(!el('dsTimeHub')?.classList.contains('active'))return;
 if(!cloudSession?.access_token||!org())return;
 const requestedOrg=org();
 notice('Arbeitszeiten werden geladen …');
 try{
  // Server enforces own-user / admin visibility via RLS.
  const rows=await cloudRequest('employee_time_events?select=id,organization_id,user_id,object_id,event_type,occurred_at,gps_result,gps_distance_m,gps_accuracy_m,note&organization_id=eq.'
    +escParam(requestedOrg)+'&order=occurred_at.desc&limit=1000');
  if(requestedOrg!==org())return; // Tenant switch while request pending
  state.rows=Array.isArray(rows)?rows:[];
  state.loadedOrg=requestedOrg;
  notice('');
  render();
 }catch(err){notice('Zeiterfassung konnte nicht geladen werden: '+(err.message||err),true);}
}
function myRows(){return state.rows.filter(x=>String(x.user_id)===uid()).slice().reverse()}
function getStatus(rows){
 const latest=rows.at(-1)||null;
 const shiftOpen=!!(latest&&latest.event_type!=='shift_end');
 const visits=rows.filter(x=>['object_in','object_out','shift_end'].includes(x.event_type));
 const v=visits.at(-1);
 const objectOpen=!!(v?.event_type==='object_in');
 const breaks=rows.filter(x=>['break_start','break_end','shift_end'].includes(x.event_type));
 const breakOpen=breaks.at(-1)?.event_type==='break_start';
 return {latest,shiftOpen,objectOpen,objectId:objectOpen?v.object_id:'',breakOpen};
}
function render(){
 renderObject();renderBookings();renderTeam();
}

function renderObject(){
 const o=findObject(state.objectId);
 if(el('dstObjectName'))el('dstObjectName').textContent=o?.name||'Kein Objekt ausgewählt';
 if(el('dstObjectAddress'))el('dstObjectAddress').textContent=o
  ?([o.address,o.street,[o.postalCode,o.city].filter(Boolean).join(' ')].filter(Boolean)[0]||'Adresse nicht hinterlegt')
  :'Scanne den QR-Code an der Anlage und wähle „Mitarbeiter / Verwaltung“.';
 const contents=el('dstObjectContents'),actions=el('dstObjectActions');
 if(!contents||!actions)return;
 if(!o){contents.textContent='';actions.innerHTML='';return;}
 const findings=(db?.findings||[]).filter(f=>String(f.objectId||f.object_id||'')===String(o.id)
   && (typeof findingVisibleInCurrentTenantUI!=='function'||findingVisibleInCurrentTenantUI(f)));
 const open=findings.filter(f=>String(f.status||'')!=='Erledigt');
 const docs=(typeof cloudObjectDocumentations!=='undefined'?cloudObjectDocumentations:[])
   .filter(d=>String(d.object_id||'')===String(o.id));
 const latestOpen=open.slice(0,5);
 const latestDocs=docs.slice(0,4);
 contents.innerHTML='<div class="dst-row"><strong>Offene Feststellungen</strong><span>'+open.length+'</span></div>'
  +'<div class="dst-row"><strong>Objektdokumentationen</strong><span>'+docs.length+'</span></div>'
  +(latestOpen.length?'<div style="margin-top:13px"><strong>Aktuelle Feststellungen</strong>'
    +latestOpen.map(f=>'<div class="dst-row"><div>'+h(f.title||f.description||f.type||'Feststellung')
     +'</div><span>'+h(f.status||'Offen')+'</span></div>').join('')+'</div>':'')
  +(latestDocs.length?'<div style="margin-top:13px"><strong>Digitale Dokumentenakte</strong>'
     +latestDocs.map(d=>'<div class="dst-row"><div>'+h(d.title||'Dokumentation')
       +'</div><span>'+h(d.status||'')+'</span></div>').join('')+'</div>':'')
  +'<div class="dst-muted" style="margin-top:10px">Alle Angaben richten sich nach deiner Rolle und den bestehenden Objektberechtigungen.</div>';
 const buttons=[];
 const visible=id=>{const node=el(id);return node&&!node.classList.contains('hidden')&&getComputedStyle(node).display!=='none'};
 if(roleTime())buttons.push('<button type="button" data-dst-page="time" data-dst-event="object_in">Am Objekt einchecken</button>');
 if(visible('navFindings')){
  buttons.push('<button type="button" data-dst-page="findings_object">Offene Punkte</button>');
  buttons.push('<button type="button" data-dst-page="docs_object">Begehungen &amp; Dokumentation</button>');
  buttons.push('<button type="button" data-dst-page="construction_object">Maßnahmen- / Baudokumentation</button>');
 }
 if(visible('navObjects')&&
   (typeof canManageObjectsUI==='function'&&canManageObjectsUI() ||
    typeof canViewObjectStandardsUI==='function'&&canViewObjectStandardsUI(o.id)))
  buttons.push('<button type="button" data-dst-page="scope_object">Leistungen &amp; Standards</button>');
 if(visible('navOperations'))buttons.push('<button type="button" data-dst-page="operations">Touren &amp; Einsätze</button>');
 if(visible('navReports'))buttons.push('<button type="button" data-dst-page="reports_object">Objektbericht</button>');
 buttons.push('<button type="button" data-dst-page="report">Bewohnermeldung</button>');
 actions.innerHTML=buttons.join('');
 const inBtn=actions.querySelector('[data-dst-event="object_in"]');
 if(inBtn){
   const st=getStatus(myRows());
   inBtn.disabled=!!(st.objectOpen||st.breakOpen||state.busy);
   if(st.objectOpen&&st.objectId===state.objectId)inBtn.textContent='Bereits eingecheckt';
 }
}
function renderBookings(){
 const status=el('dstMyStatus'),actions=el('dstBookingActions'),history=el('dstHistory');
 if(!status||!actions||!history)return;
 const rows=myRows(),st=getStatus(rows);
 if(!roleTime()){
  status.textContent='Für diese Rolle sind keine Arbeitszeitbuchungen vorgesehen.';
  actions.innerHTML='';
 }else{
  const activeObject=st.objectOpen?objName(st.objectId):'Kein Objekt geöffnet';
  status.innerHTML='<strong>'+h(st.breakOpen?'Pause':st.objectOpen?'Am Objekt eingecheckt':st.shiftOpen?'Im Dienst':'Außer Dienst')+'</strong>'
   +'<div class="dst-muted">'+h(activeObject)+'</div>'
   +(st.latest?'<div class="dst-muted">Letzte Buchung: '+h(fmt(st.latest.occurred_at))+'</div>':'<div class="dst-muted">Noch keine Zeitbuchung vorhanden.</div>');
  const btns=[];
  if(!st.shiftOpen)btns.push(['shift_start','Dienstbeginn ohne Objekt-QR']);
  if(st.shiftOpen&&!st.breakOpen)btns.push(['break_start','Pause beginnen']);
  if(st.breakOpen)btns.push(['break_end','Pause beenden']);
  if(st.objectOpen&&!st.breakOpen)btns.push(['object_out','Objekt verlassen']);
  if(st.shiftOpen&&!st.objectOpen&&!st.breakOpen)btns.push(['shift_end','Feierabend']);
  actions.innerHTML=btns.map(([type,label])=>'<button type="button" data-dst-event="'+type+'" '+(state.busy?'disabled':'')+'>'+h(label)+'</button>').join('');
  if(!st.objectOpen&&state.objectId&&!st.breakOpen){
   actions.insertAdjacentHTML('afterbegin','<button type="button" data-dst-event="object_in" '+(state.busy?'disabled':'')+'>Objekt betreten · QR-Check-in</button>');
  }
 }
 history.innerHTML=rows.length
  ?rows.slice(-40).reverse().map(x=>'<div class="dst-row"><div><strong>'+h(typeLabel(x.event_type))+'</strong>'
    +(x.object_id?'<div class="dst-muted">'+h(objName(x.object_id))+'</div>':'')
    +(['object_in','object_out'].includes(x.event_type)?'<div class="dst-muted">'+h(gpsLabel(x.gps_result))+(x.gps_distance_m!==null?' · '+Math.round(Number(x.gps_distance_m))+' m':'')+'</div>':'')
    +'</div><span>'+h(fmt(x.occurred_at))+'</span></div>').join('')
  :'<div class="dst-muted">Keine Zeitbuchungen vorhanden.</div>';
}
function renderTeam(){
 const box=el('dstTeamBox'),list=el('dstTeamList');if(!box||!list)return;
 box.style.display=roleAdmin()?'':'none';
 if(!roleAdmin())return;
 const members=new Map();
 for(const row of state.rows){
  if(!members.has(row.user_id))members.set(row.user_id,[]);
  members.get(row.user_id).push(row);
 }
 if(!members.size){list.innerHTML='<p class="dst-muted">Noch keine Mitarbeiterbuchungen.</p>';return;}
 list.innerHTML=[...members.entries()].map(([id,descending])=>{
  const st=getStatus(descending.slice().reverse());
  const label=typeof profileDisplayName==='function'?profileDisplayName(id):'';
  const name=label||((id===uid()&&currentUserProfile?.full_name)||'Mitarbeiter '+String(id).slice(0,8));
  const place=st.objectOpen?objName(st.objectId):(st.shiftOpen?'Kein aktiver Objekt-Check-in':'Außer Dienst');
  const lastScan=descending.find(x=>['object_in','object_out'].includes(x.event_type));
  const gpsText=lastScan?gpsLabel(lastScan.gps_result):'Keine GPS-Buchung';
  return '<div class="dst-row"><div><strong>'+h(name)+'</strong><div class="dst-muted">'+h(place)+'</div><div class="dst-muted">'+h(gpsText)+'</div></div>'
   +'<span>'+h(st.breakOpen?'Pause':st.objectOpen?'Im Objekt':st.shiftOpen?'Im Dienst':'Dienstende')
   +'<br>'+h(tm(st.latest?.occurred_at))+'</span></div>';
 }).join('');
}
async function getGps(){
 if(!navigator.geolocation)return null;
 return new Promise(resolve=>{
  navigator.geolocation.getCurrentPosition(
   p=>resolve({gps_latitude:p.coords.latitude,gps_longitude:p.coords.longitude,
      gps_accuracy_m:Math.round(p.coords.accuracy)}),
   ()=>resolve(null),{enableHighAccuracy:true,timeout:11000,maximumAge:0});
 });
}
async function book(type){
 if(state.busy||!roleTime())return;
 const st=getStatus(myRows());
 const obj=type==='object_out'?st.objectId:state.objectId;
 if(['object_in','object_out'].includes(type)&&(!obj||!findObject(obj))){
  notice('Bitte zuerst den QR-Code des Objekts scannen bzw. die Objektakte öffnen.',true);return;
 }
 if(type==='object_out'&&!st.objectOpen)return notice('Kein offener Objekteinsatz.',true);
 if(type==='shift_end'&&(st.objectOpen||st.breakOpen))return notice('Bitte vorher Objekteinsatz und Pause beenden.',true);
 const orgId=org(),userId=uid();if(!orgId||!userId)return;
 state.busy=true;
 notice(['object_in','object_out'].includes(type)?'GPS wird bei der Buchung punktuell abgefragt …':'Buchung wird gespeichert …');
 renderBookings();
 try{
  const gps=['object_in','object_out'].includes(type)?await getGps():null;
  // GPS may be unavailable; in that case an unverified event is still recorded.
  const payload={
   organization_id:orgId,user_id:userId,object_id:['object_in','object_out'].includes(type)?obj:null,
   event_type:type,...(gps||{})
  };
  const response=await cloudRequest('employee_time_events?select=id,event_type,occurred_at,gps_result,gps_distance_m',{
   method:'POST',headers:{Prefer:'return=representation','Content-Type':'application/json'},
   body:JSON.stringify(payload)
  });
  if(orgId!==org())return;
  const result=Array.isArray(response)?response[0]:response;
  state.rows.unshift({...payload,...result});
  notice(typeLabel(type)+' gespeichert · '+fmt(result?.occurred_at)+
   (['object_in','object_out'].includes(type)?' · '+gpsLabel(result?.gps_result):''));
  await loadRows();
 }catch(err){notice('Buchung nicht gespeichert: '+(err.message||err),true);}
 finally{state.busy=false;render();}
}
function downloadCsv(){
 if(!state.rows.length){notice('Keine Zeitbuchungen für den Export vorhanden.',true);return;}
 const safe=v=>{const txt=String(v??'').replace(/^[=+\-@]/,"'$&");return '"'+txt.replace(/"/g,'""')+'"';};
 const header=['Mitarbeiter','Objekt','Ereignis','Zeitstempel','GPS-Status','Abstand m','GPS-Genauigkeit m'];
 const rows=state.rows.slice().reverse().map(x=>[
  typeof profileDisplayName==='function'?(profileDisplayName(x.user_id)||String(x.user_id).slice(0,8)):String(x.user_id).slice(0,8),
  x.object_id?objName(x.object_id):'',typeLabel(x.event_type),fmt(x.occurred_at),
  gpsLabel(x.gps_result),x.gps_distance_m??'',x.gps_accuracy_m??''
 ]);
 const csv='\uFEFF'+[header,...rows].map(r=>r.map(safe).join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
 const a=document.createElement('a');a.href=url;a.download='duschl-arbeitszeiten-'+new Date().toISOString().slice(0,10)+'.csv';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
mount();
navSync();
setInterval(navSync,1800);
setInterval(()=>{if(document.visibilityState==='visible'&&el('dsTimeHub')?.classList.contains('active')&&roleTime()&&!state.busy)void loadRows();},30000);
})();