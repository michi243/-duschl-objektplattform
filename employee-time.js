/* Duschl Service · QR-Objektportal & Mitarbeiterzeiten · Pilot v3.56.0
 * Vorhandene Bewohner-QR-Codes bleiben gültig (?meldung=...).
 * Employee time: append-only server-stamped records in Supabase.
 * GPS is taken only after a deliberate booking; precise coordinates are discarded by DB trigger.
 */
(function(){
'use strict';
const VALID_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const state={objectId:'',rows:[],busy:false,loadedOrg:'',loadedUser:'',deepHandled:false,isTest:true,reviews:[],pendingScan:null,permission:{key:'',enabled:false,loading:false,error:'',checkedAt:0}};
const h=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el=id=>document.getElementById(id);
const fmt=t=>t?new Date(t).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}):'–';
const tm=t=>t?new Date(t).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):'–';
const eligibleTimeRole=()=>{
 try{
  const r=String(effectiveOrganizationRole()||'');
  return !!(cloudSession?.access_token&&currentOrganizationId()
      && (hasOperationalAdminAccess()||['object_manager','staff','employee','external_contractor'].includes(r)));
 }catch(_){return false;}
};
const roleTime=()=>{
 if(!eligibleTimeRole())return false;
 if(roleAdmin())return true;
 return state.permission.key===org()+':'+uid() && state.permission.enabled===true;
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
#dstPersonnel.dst-personnel-workspace{max-width:1260px;margin:auto}
#dstPersonnel .dst-personnel-identity{padding:18px 22px;border:1px solid #355168;border-radius:14px;margin:20px 0;background:#0c2231}
#dstPersonnel .dst-personnel-identity h3{margin-top:0}
#dstPersonnel .dst-personnel-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 20px;border-bottom:1px solid #365064;padding-bottom:13px}
#dstPersonnel .dst-personnel-tab{border:1px solid #45647a;border-radius:10px;padding:12px 18px;min-height:44px;background:#123044;color:#e5f0f8;font-weight:650}
#dstPersonnel .dst-personnel-tab.active{background:#215575;outline:2px solid #61a2c8}
#dstPersonnel .dst-personnel-panel[hidden]{display:none!important}
#dstPersonnel .dst-personnel-panel{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:16px;align-items:start}
#dstPersonnel .dst-personnel-panel>.dst-box{border:1px solid #385467;border-radius:14px;padding:18px;background:#0e2635;min-width:0}
#dstPersonnel .dst-personnel-panel label{display:block;margin:10px 0}
#dstPersonnel .dst-personnel-panel input:not([type=checkbox]),#dstPersonnel .dst-personnel-panel select,#dstPersonnel .dst-personnel-panel textarea{width:100%;max-width:100%;box-sizing:border-box}
#dstPersonnel #dstPersonnelMessage:not(:empty){padding:10px 12px;border-left:3px solid #e1b35f;margin:12px 0}

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
#dsTimeHub .dst-test-banner{border:1px solid #a88039;background:rgba(198,145,56,.12);padding:12px;border-radius:10px;margin:10px 0;color:#f0d4a3;font-weight:700}
#dsTimeHub .dst-live-banner{border:1px solid #446e78;padding:12px;border-radius:10px;margin:10px 0}
#dsTimeHub .dst-review{border:1px solid #bf8d43;background:rgba(180,125,41,.10);padding:12px;border-radius:12px;margin:10px 0}
#dsTimeHub .dst-review button{min-height:44px}
.ds-modal-dialog .dst-test-banner{border:1px solid #a88039;background:rgba(198,145,56,.12);padding:10px;border-radius:9px;margin:10px 0;color:#f0d4a3;font-weight:700}
#dsTimeHub .dst-mode-label{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
#dsTimeHub #dstModeSelect{min-height:44px;min-width:150px}

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
  <div class="dst-actions" style="margin:0">
   <button id="dstManageEmployees" type="button" style="display:none">Mitarbeiter &amp; Freigaben</button>
   <button id="dstRefresh" type="button">↻ Aktualisieren</button>
  </div></div>
  <div class="dst-mode-label"><label for="dstModeSelect">Arbeitszeitmodus</label>
 <select id="dstModeSelect"><option value="test" selected>Testmodus · nicht abrechnen</option><option value="live">Produktiv · nur nach bewusster Auswahl</option></select></div>
 <div id="dstModeBanner" class="dst-live-banner">Produktive Arbeitszeiten · Testbuchungen werden ausgeschlossen.</div>
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
  <div class="dst-box" id="dstAdminHours" style="display:none;margin-top:12px">
   <h3>Personal · Arbeitszeiten</h3>
   <p class="dst-muted">Mandanteninterne Übersicht aus Dienstbeginn, Dienstende und Pausen. Nur vollständig gestempelte Pausen werden von der Arbeitszeit abgezogen. Unterschreitung gesetzlicher Mindestpausen wird als Prüfbedarf angezeigt; kein automatischer Abzug. Keine Lohnabrechnung.</p>
   <div class="dst-actions">
    <label>Mitarbeiter <select id="dstHoursEmployee"><option value="">Alle Mitarbeiter</option></select></label>
    <label>Zeitraum <select id="dstHoursPeriod"><option value="week">Diese Woche</option><option value="month" selected>Dieser Monat</option><option value="all">Alle geladenen Buchungen</option></select></label>
    <button type="button" id="dstHoursCsv">Arbeitszeitübersicht CSV</button>
   </div>
   <div id="dstHoursSummary" class="dst-muted" style="margin-top:14px"></div>
   <div id="dstHoursTable" style="overflow-x:auto;margin-top:12px"></div>
   <div class="dst-internal-note">Hinweis: Keine pauschalen Pausenabzüge. Arbeitszeitrechtliche Verstöße sind organisatorisch zu klären, nicht durch rückwirkende Abzüge zu verdecken. Die Übersicht basiert auf maximal 1.000 zuletzt geladenen Ereignissen. Bei älteren Zeiträumen und periodenübergreifenden Schichten sind die Stunden nicht vollständig. Ausschließlich der aktive Mandant wird angezeigt.</div>
  </div>
  <div class="dst-box" id="dstTeamBox" style="display:none;margin-top:12px">
   <h3>Einsatzübersicht · letzter bestätigter Buchungsstand</h3>
   <div class="dst-muted">Kein GPS-Live-Tracking. „Im Objekt“ bedeutet: Check-in vorhanden, Check-out noch offen.</div>
   <div id="dstTeamList"></div>
    <h3>GPS-Ausnahmebuchungen · Freigaben</h3>
    <div id="dstReviewList"></div>
  </div>`;
  main.appendChild(section);
  el('dstRefresh').addEventListener('click',()=>loadRows());
  el('dstManageEmployees').addEventListener('click',()=>{
   if(roleAdmin()&&typeof showSection==='function')showSection('users');
  });
  el('dstExport').addEventListener('click',downloadCsv);
  el('dstHoursEmployee').addEventListener('change',renderAdminHours);
  el('dstHoursPeriod').addEventListener('change',renderAdminHours);
  el('dstHoursCsv').addEventListener('click',downloadAdminHoursCsv);
  el('dstModeSelect').addEventListener('change',e=>{
    const next=e.target.value==='test';
    if(state.objectId&&!!findObject(state.objectId)?.isTest!==next){
      state.objectId='';notice('Das bisherige Objekt gehört zu einem anderen Modus. Bitte ein Objekt in diesem Modus öffnen.');
    }
    state.isTest=next;state.pendingScan=null;render();
  });
  el('dstReviewList').addEventListener('click',async e=>{
    const btn=e.target.closest('button[data-dst-review]');if(!btn||!roleAdmin())return;
    const eventId=btn.dataset.dstReview,decision=btn.dataset.dstDecision;
    const row=state.rows.find(x=>x.id===eventId&&x.is_test===state.isTest);
    if(!row)return;
    let note='';
    if(decision==='approved'){
      if(!confirm('Ausnahmebuchung nach Prüfung genehmigen? GPS-Abweichung bleibt protokolliert.'))return;
    }else{
      const input=prompt('Grund für die Ablehnung (mindestens 5 Zeichen):','');
      if(input===null)return;note=input.trim();if(note.length<5)return alert('Bitte einen Ablehnungsgrund angeben.');
    }
    btn.disabled=true;
    try{
      await cloudRequest('rpc/review_employee_time_event_v1',{
        method:'POST',body:JSON.stringify({p_event_id:eventId,p_decision:decision,p_note:note})
      });
      await loadRows();
    }catch(err){alert('Entscheidung nicht gespeichert: '+String(err.message||err));btn.disabled=false;}
  });
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

async function loadOwnTimePermission(){
 if(roleAdmin()||!eligibleTimeRole())return;
 const requestedKey=org()+':'+uid();
 if(state.permission.loading || (state.permission.key===requestedKey && Date.now()-state.permission.checkedAt<60000))return;
 // Set a scoped loading record immediately; prevent duplicate requests.
 state.permission={key:requestedKey,enabled:false,loading:true,error:'',checkedAt:0};
 if(el('dsTimeHub')?.classList.contains('active'))renderBookings();
 try{
  const rows=await cloudRequest(
    'employee_time_permissions?select=enabled&organization_id=eq.'+escParam(org())+
    '&user_id=eq.'+escParam(uid())+'&limit=1'
  );
  if(requestedKey!==org()+':'+uid())return;
  state.permission.enabled=Array.isArray(rows)&&rows[0]?.enabled===true;
  state.permission.error='';
 }catch(error){
  if(requestedKey===org()+':'+uid()){
   state.permission.error=String(error?.message||error);
   console.warn('Zeiterfassungsfreigabe konnte nicht geladen werden',error);
  }
 }finally{
  if(requestedKey===org()+':'+uid()){
   state.permission.loading=false;
   state.permission.checkedAt=Date.now();
   if(el('dsTimeHub')?.classList.contains('active'))render();
  }
 }
}
async function renderAdminTimePermission(){
 const editor=el('userAdminEditor');
 const selection=el('userAdminSelect');
 if(!editor||!selection||!selection.value||!editor.firstElementChild||!roleAdmin())return;
 if(editor.querySelector('#dstEmployeeTimePermissionCard'))return;
 const person=String(selection.value);
 const currentOrg=org();
 const membership=(typeof userAdminMemberships!=='undefined'?userAdminMemberships:[])
    .find(m=>String(m.user_id)===person&&String(m.organization_id)===currentOrg);
 if(!membership)return;
 const allowed=['object_manager','staff','employee','external_contractor'].includes(String(membership.role||''));
 const card=document.createElement('div');
 card.id='dstEmployeeTimePermissionCard';
 card.className='card';
 card.style.marginTop='12px';
 card.innerHTML='<h3>Arbeitszeiterfassung</h3>'+
  '<p class="dst-muted">Die Freigabe ist <strong>personenbezogen</strong> und gilt nur für den ausgewählten Mandanten. Die Objektzuweisung erfolgt separat.</p>'+
  '<label class="row" style="align-items:center;gap:10px;min-height:44px">'+
  '<input id="dstTimePermissionCheck" type="checkbox" disabled>'+
  '<span>Mitarbeiter für Arbeitszeiterfassung freigeben</span></label>'+
  '<div class="dst-actions"><button id="dstSaveTimePermission" type="button" disabled>Zeiterfassungsfreigabe speichern</button></div>'+
  '<div id="dstTimePermissionFeedback" class="dst-muted" role="status" aria-live="polite"></div>';
 const editorCard=editor.querySelector(':scope > .card');
 const nameHeading=editorCard?.querySelector('h3');
 if(nameHeading)nameHeading.insertAdjacentElement('afterend',card);
 else editor.appendChild(card);
 const check=el('dstTimePermissionCheck'), save=el('dstSaveTimePermission'), msg=el('dstTimePermissionFeedback');
 if(!allowed){
  msg.textContent='Nur Benutzer mit operativer Mandantenrolle können freigegeben werden. Bei Rollenänderung zuerst die übrigen Berechtigungen speichern.';
  return;
 }
 msg.textContent='Bisherige Freigabe wird geprüft …';
 try{
  const rows=await cloudRequest(
   'employee_time_permissions?select=enabled&organization_id=eq.'+escParam(currentOrg)
    +'&user_id=eq.'+escParam(person)+'&limit=1'
  );
  if(selection.value!==person||org()!==currentOrg||!card.isConnected)return;
  check.checked=Array.isArray(rows)&&rows[0]?.enabled===true;
  check.disabled=false;save.disabled=false;
  msg.textContent=check.checked?'Freigabe: aktiv.':'Freigabe: nicht aktiv.';
 }catch(error){
  if(card.isConnected)msg.textContent='Freigabe nicht lesbar: '+String(error?.message||error);
  return;
 }
 save.addEventListener('click',async()=>{
  if(selection.value!==person||org()!==currentOrg)return;
  save.disabled=true;check.disabled=true;
  msg.textContent='Speichern …';
  try{
   const result=await cloudRequest('rpc/set_employee_time_permission_v1',{
    method:'POST',body:JSON.stringify({
      p_organization_id:currentOrg,p_user_id:person,p_enabled:check.checked
    })
   });
   msg.textContent=result===true?'Zeiterfassung freigegeben.':'Zeiterfassung gesperrt.';
   if(person===uid()){
    state.permission={key:currentOrg+':'+person,enabled:result===true,loading:false,error:'',checkedAt:Date.now()};
   }
  }catch(error){
   msg.textContent='Speichern fehlgeschlagen: '+String(error?.message||error);
  }finally{if(card.isConnected){save.disabled=false;check.disabled=false;}}
 });
}
function installAdminTimePermissionEditor(){
 const editor=el('userAdminEditor');
 if(!editor)return;
 let scheduled=false;
 const schedule=()=>{
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(()=>{
   scheduled=false;
   // Observer also fires on insertion, but the guard in renderAdminTimePermission prevents loops.
   if(!editor.querySelector('#dstEmployeeTimePermissionCard'))void renderAdminTimePermission();
  });
 };
 const observer=new MutationObserver(schedule);
 observer.observe(editor,{childList:true});
 el('userAdminSelect')?.addEventListener('change',schedule);
 schedule();
}

function navSync(){
 if(eligibleTimeRole()&&!roleAdmin()&&org()&&uid()&& (state.permission.key!==org()+':'+uid() || Date.now()-state.permission.checkedAt>60000)){
   void loadOwnTimePermission();
 }
 if((state.loadedUser&&state.loadedUser!==uid())||(state.loadedOrg&&state.loadedOrg!==org())){
  state.rows=[];state.reviews=[];state.pendingScan=null;state.objectId='';state.loadedOrg='';state.loadedUser='';
  if(el('dsTimeHub')?.classList.contains('active'))render();
 }
 const nav=el('navEmployeeTime');if(nav)nav.classList.toggle('hidden',!eligibleTimeRole());
 const pnav=el('navPersonnel');if(pnav)pnav.classList.toggle('hidden',!eligibleTimeRole());
 const manage=el('dstManageEmployees');if(manage)manage.style.display=roleAdmin()?'':'none';
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
 if((state.loadedUser&&state.loadedUser!==uid())||(state.loadedOrg&&state.loadedOrg!==org())){state.rows=[];state.reviews=[];state.pendingScan=null;state.objectId='';state.loadedOrg='';state.loadedUser='';}
 if(!cloudSession?.access_token||!org()){notice('Bitte anmelden und Mandanten auswählen.',true);return;}
 if(eligibleTimeRole()&&!roleAdmin())void loadOwnTimePermission();
 if(objectId && (!VALID_ID.test(objectId)||!findObject(objectId))){
  alert('Das Objekt ist für diesen Zugang nicht freigegeben.');return;
 }
 state.objectId=objectId||'';
 if(objectId)state.isTest=!!findObject(objectId)?.isTest;
 state.pendingScan=null;
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
 const requestedOrg=org(),requestedUser=uid();
 notice('Arbeitszeiten werden geladen …');
 try{
  const rows=await cloudRequest('employee_time_events?select=id,organization_id,user_id,object_id,event_type,occurred_at,gps_result,gps_distance_m,gps_accuracy_m,note,is_test,exception_reason,review_status&organization_id=eq.'
    +escParam(requestedOrg)+'&order=occurred_at.desc&limit=1000');
  if(requestedOrg!==org()||requestedUser!==uid())return;
  const decisions=await cloudRequest('employee_time_event_reviews?select=event_id,decision,note,reviewed_at,reviewed_by&organization_id=eq.'
    +escParam(requestedOrg)+'&order=reviewed_at.desc&limit=1000');
  if(requestedOrg!==org()||requestedUser!==uid())return;
  // Publish both datasets atomically only once the same tenant and user were verified.
  state.rows=Array.isArray(rows)?rows:[];
  state.reviews=Array.isArray(decisions)?decisions:[];
  state.loadedOrg=requestedOrg;state.loadedUser=requestedUser;
  notice('');
  render();
 }catch(err){
  if(requestedOrg===org()&&requestedUser===uid())
   notice('Zeiterfassung konnte nicht geladen werden: '+(err.message||err),true);
 }
}
function modeRows(){return state.rows.filter(x=>x.is_test===state.isTest)}
function myRows(){return modeRows().filter(x=>String(x.user_id)===uid()).slice().reverse()}
function timeReview(id){return state.reviews.find(r=>String(r.event_id)===String(id))}
function reviewLabel(row){
 if(row.review_status!=='pending_review')return row.review_status==='verified'?'GPS bestätigt':'';
 const r=timeReview(row.id);
 return r?(r.decision==='approved'?'Ausnahme genehmigt':'Ausnahme abgelehnt'):'Ausnahme offen · Prüfung erforderlich';
}
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
 const exportBtn=el('dstExport');
 if(exportBtn)exportBtn.textContent=state.isTest?'Testbuchungen als CSV (nicht abrechnen)':'Produktivbuchungen als CSV (nur geprüfte)';
 const select=el('dstModeSelect'),banner=el('dstModeBanner');
 if(select&&select.value!==(state.isTest?'test':'live'))select.value=state.isTest?'test':'live';
 if(banner){
  banner.className=state.isTest?'dst-test-banner':'dst-live-banner';
  banner.textContent=state.isTest?'TESTMODUS – keine Lohnabrechnung. Testbuchungen werden separat geführt.':'PRODUKTIV – Testbuchungen sind ausgeblendet und werden nicht exportiert.';
 }
 renderObject();renderBookings();renderTeam();renderAdminHours();
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
 if(o.isTest)contents.insertAdjacentHTML('afterbegin','<div class="dst-test-banner">TESTOBJEKT – Buchungen nur im Testmodus.</div>');
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
  status.textContent=eligibleTimeRole() ? (state.permission.loading?'Zeiterfassungsfreigabe wird geprüft …':(state.permission.error?'Zeitfreigabe konnte nicht geprüft werden. Bitte Seite aktualisieren.':'Zeiterfassung noch nicht freigegeben. Ein Administrator kann sie unter Benutzer & Berechtigungen aktivieren.')) : 'Für diese Rolle sind keine Arbeitszeitbuchungen vorgesehen.';
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
    +(x.review_status==='pending_review'?'<div class="dst-muted">'+h(reviewLabel(x))+
      (x.exception_reason?': '+h(x.exception_reason):'')+'</div>':'')+
    '</div><span>'+h(fmt(x.occurred_at))+'</span></div>').join('')
  :'<div class="dst-muted">Keine Zeitbuchungen vorhanden.</div>';
}
function timeEmployeeName(id){
 const name=typeof profileDisplayName==='function'?profileDisplayName(id):'';
 return name||((String(id)===uid()&&currentUserProfile?.full_name)||'Mitarbeiter '+String(id).slice(0,8));
}
function currentHoursRows(){
 if(!roleAdmin())return [];
 const period=el('dstHoursPeriod')?.value||'month',employee=el('dstHoursEmployee')?.value||'';
 const now=new Date(), start=new Date(now);
 if(period==='month')start.setFullYear(now.getFullYear(),now.getMonth(),1),start.setHours(0,0,0,0);
 if(period==='week'){const offset=(now.getDay()+6)%7;start.setDate(now.getDate()-offset);start.setHours(0,0,0,0);}
 return modeRows().filter(x=>(!employee||x.user_id===employee)&&(period==='all'||new Date(x.occurred_at)>=start));
}
function summarizeHours(){
 const grouped=new Map();
 for(const x of currentHoursRows()){
  const id=String(x.user_id);
  if(!grouped.has(id))grouped.set(id,{id,name:timeEmployeeName(id),hours:0,completed:0,open:false,issue:false,exceptions:0,events:0});
  const g=grouped.get(id);g.events++;
  if((x.review_status==='pending_review'&&!timeReview(x.id))||timeReview(x.id)?.decision==='rejected')g.exceptions++;
 }
 for(const d of detailedHours()){
  const g=grouped.get(d.id);if(!g)continue;
  if(d.start!==null&&d.end!==null&&d.net!==null){g.hours+=d.net;g.completed++;}
  if(d.end===null)g.open=true;
  if(d.issues!=='–')g.issue=true;
 }
 return [...grouped.values()].sort((a,b)=>a.name.localeCompare(b.name,'de'));
}
function detailedHours(){
 const byUser=new Map();
 for(const e of currentHoursRows().slice().sort((a,b)=>new Date(a.occurred_at)-new Date(b.occurred_at))){
  const id=String(e.user_id);if(!byUser.has(id))byUser.set(id,[]);byUser.get(id).push(e);
 }
 const out=[];
 for(const [id,events] of byUser){
  let shift=null;
  const finish=(end,open)=>{
   if(!shift)return;
   const duration=end?Math.max(0,end-shift.start):null;
   const pause=shift.breakMs;
   const issues=[...shift.issues];
   if(open)issues.push('Gehen fehlt');
   if(shift.pauseAt!==null)issues.push('Pausenende fehlt');
   const effectivePause=pause/60000;
   const net=duration===null?null:Math.max(0,duration-pause)/3600000;
   if(duration!==null){
    const required=net>9?45:net>6?30:0;
    if(effectivePause<required)issues.push('Mindestpause unterschritten ('+Math.round(effectivePause)+'/'+required+' Min.)');
   }
   out.push({id,name:timeEmployeeName(id),date:new Date(shift.start).toLocaleDateString('de-DE'),start:shift.start,end,pauseMin:effectivePause,net,issues:issues.join(' · ')||'–'});
   shift=null;
  };
  for(const e of events){
   const t=new Date(e.occurred_at).getTime();if(!Number.isFinite(t))continue;
   if(e.event_type==='shift_start'){
    if(shift){shift.issues.push('Weiterer Dienstbeginn');finish(null,true);}
    shift={start:t,breakMs:0,pauseAt:null,issues:[]};
   }else if(e.event_type==='break_start'){
    if(shift){if(shift.pauseAt!==null)shift.issues.push('Doppelte Pause');else shift.pauseAt=t;}
   }else if(e.event_type==='break_end'){
    if(shift){if(shift.pauseAt===null)shift.issues.push('Pausenbeginn fehlt');else {const elapsed=Math.max(0,t-shift.pauseAt);shift.breakMs+=elapsed;if(elapsed<15*60000)shift.issues.push('Pausenabschnitt unter 15 Minuten');shift.pauseAt=null;}}
   }else if(e.event_type==='shift_end'){
    if(shift)finish(t,false);
    else out.push({id,name:timeEmployeeName(id),date:new Date(t).toLocaleDateString('de-DE'),start:null,end:t,pauseMin:null,net:null,issues:'Kommen fehlt'});
   }
  }
  if(shift)finish(null,true);
 }
 return out.sort((a,b)=>(b.start||b.end||0)-(a.start||a.end||0));
}
function hourClock(t){return t===null?'–':new Date(t).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});}
function renderAdminHours(){
 const panel=el('dstAdminHours');if(!panel)return;
 panel.style.display=roleAdmin()?'':'none';if(!roleAdmin())return;
 const selected=el('dstHoursEmployee'),old=selected.value;
 const members=[...new Set(modeRows().map(x=>String(x.user_id)))].sort((a,b)=>timeEmployeeName(a).localeCompare(timeEmployeeName(b),'de'));
 selected.innerHTML='<option value="">Alle Mitarbeiter</option>'+members.map(id=>'<option value="'+h(id)+'">'+h(timeEmployeeName(id))+'</option>').join('');
 selected.value=members.includes(old)?old:'';
 const result=summarizeHours();
 const format=x=>x.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
 el('dstHoursSummary').textContent=result.length+' Mitarbeiter mit Buchungen · '+format(result.reduce((a,x)=>a+x.hours,0))+' h aus abgeschlossenen Schichten (vorläufig)';
  const details=detailedHours();
 const detailTable='<h4 style="margin:22px 0 9px">Tagesbuchungen · Kommen / Gehen / Pause</h4>'+
 (details.length?'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;text-align:left"><thead><tr><th>Datum</th><th>Mitarbeiter</th><th>Kommen</th><th>Gehen</th><th>Pause</th><th>Netto</th><th>Status</th></tr></thead><tbody>'+
 details.map(x=>'<tr><td style="padding:10px 6px;border-top:1px solid #345166">'+h(x.date)+'</td><td>'+h(x.name)+'</td><td>'+hourClock(x.start)+'</td><td>'+hourClock(x.end)+'</td><td>'+(x.pauseMin===null?'–':Math.round(x.pauseMin)+' min')+'</td><td>'+(x.net===null?'–':format(x.net)+' h')+'</td><td>'+h(x.issues)+'</td></tr>').join('')+'</tbody></table></div>':'<p class="dst-muted">Keine Tagesbuchungen vorhanden.</p>');
 el('dstHoursTable').innerHTML=result.length?'<table style="width:100%;border-collapse:collapse;text-align:left"><thead><tr><th>Mitarbeiter</th><th>Abgeschlossene Dienste</th><th>Stunden</th><th>Prüfbedarf</th></tr></thead><tbody>'+
 result.map(x=>'<tr><td style="padding:10px 6px;border-top:1px solid #345166">'+h(x.name)+'</td><td>'+x.completed+'</td><td>'+format(x.hours)+' h</td><td>'+h([x.open?'Dienst offen':'',x.issue?'Buchungsfolge prüfen':'',x.exceptions?x.exceptions+' GPS-Ausnahmen':''].filter(Boolean).join(' · ')||'–')+'</td></tr>').join('')+'</tbody></table>':'<p class="dst-muted">Keine Buchungen für die Filterauswahl.</p>';
 el('dstHoursTable').insertAdjacentHTML('beforeend',detailTable);
}
function downloadAdminHoursCsv(){
 if(!roleAdmin())return;
 const data=summarizeHours();if(!data.length)return;
 const safe=v=>'"'+String(v??'').replace(/^[=+@-]/,"'function renderTeam(){").replace(/"/g,'""')+'"';
 const lines=[['Mitarbeiter','Abgeschlossene Dienste','Stunden (vorläufig)','Dienst offen','Buchungsfolge prüfen','GPS-Ausnahmen','Anzahl Ereignisse'],...data.map(x=>[x.name,x.completed,x.hours.toFixed(2).replace('.',','),x.open?'Ja':'Nein',x.issue?'Ja':'Nein',x.exceptions,x.events])];
 const details=detailedHours();
 lines.push([],['Tagesbuchungen'],['Datum','Mitarbeiter','Kommen','Gehen','Pause (Minuten)','Netto (Stunden)','Status']);
 details.forEach(x=>lines.push([x.date,x.name,hourClock(x.start),hourClock(x.end),x.pauseMin===null?'':Math.round(x.pauseMin),x.net===null?'':x.net.toFixed(2).replace('.',','),x.issues]));
 const csv=String.fromCharCode(0xFEFF)+'sep=;\r\n'+lines.map(x=>x.map(safe).join(';')).join('\r\n')+'\r\n';
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='duschl-arbeitszeiten-vorlaeufig-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function renderTeam(){
 const box=el('dstTeamBox'),list=el('dstTeamList');if(!box||!list)return;
 box.style.display=roleAdmin()?'':'none';
 if(!roleAdmin())return;
 const members=new Map();
 for(const row of modeRows()){
  if(!members.has(row.user_id))members.set(row.user_id,[]);
  members.get(row.user_id).push(row);
 }
 if(!members.size){list.innerHTML='<p class="dst-muted">Keine Zeitbuchungen im gewählten Modus.</p>';renderTimeReviews();return;}
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
 renderTimeReviews();
}
function renderTimeReviews(){
 const list=el('dstReviewList');if(!list)return;
 if(!roleAdmin()){list.innerHTML='';return;}
 const pending=modeRows().filter(e=>e.review_status==='pending_review'&&!timeReview(e.id));
 list.innerHTML=pending.length?pending.map(e=>{
  const name=typeof profileDisplayName==='function'?(profileDisplayName(e.user_id)||'Mitarbeiter'):('Mitarbeiter '+String(e.user_id).slice(0,8));
  return '<div class="dst-review"><strong>'+h(name)+' · '+h(objName(e.object_id))+'</strong>'+
   '<div class="dst-muted">'+h(fmt(e.occurred_at))+' · '+h(gpsLabel(e.gps_result))+
   (e.gps_distance_m!=null?' · '+h(e.gps_distance_m)+' m':'')+'</div>'+
   '<div>'+h(e.exception_reason||'Keine Begründung (Altbuchung)')+'</div>'+
   '<div class="dst-actions"><button type="button" data-dst-review="'+h(e.id)+'" data-dst-decision="approved">Genehmigen</button>'+
   '<button type="button" data-dst-review="'+h(e.id)+'" data-dst-decision="rejected">Ablehnen</button></div></div>';
 }).join(''):'<div class="dst-muted">Keine offenen GPS-Ausnahmen im gewählten Modus.</div>';
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

function gpsPlausibility(gps,objectId){
 const o=findObject(objectId);
 if(!gps)return {status:'unavailable',distance:null,accuracy:null};
 if(o?.latitude==null||o?.longitude==null)return {status:'no_object_coordinates',distance:null,accuracy:gps.gps_accuracy_m};
 const lat1=Number(gps.gps_latitude)*Math.PI/180,lat2=Number(o.latitude)*Math.PI/180;
 const deltaLat=(Number(o.latitude)-Number(gps.gps_latitude))*Math.PI/180;
 const deltaLon=(Number(o.longitude)-Number(gps.gps_longitude))*Math.PI/180;
 const hval=Math.sin(deltaLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(deltaLon/2)**2;
 const distance=6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.max(0,hval))));
 const accuracy=Number(gps.gps_accuracy_m);
 return {status:accuracy>100?'uncertain':distance<=150+accuracy?'near':'outside',
  distance,accuracy};
}
function showScanPreview(){
 const scan=state.pendingScan;if(!scan)return;
 const p=scan.plausibility;
 const isGood=p.status==='near';
 const distance=p.distance==null?'nicht bestimmbar':p.distance>=1000?(p.distance/1000).toFixed(2).replace('.',',')+' km':Math.round(p.distance)+' m';
 const accuracy=p.accuracy==null?'nicht verfügbar':Math.round(p.accuracy)+' m';
 const checkout=scan.type==='object_out';
 const minReason=scan.isTest?4:10;
 const headline=isGood?'Standortprüfung plausibel':checkout?'Auschecken außerhalb des Objekts':'GPS-Prüfung: Ausnahme erforderlich';
 modal('<h2>Standortprüfung vor Buchung</h2>'+
  '<p><strong>'+h(objName(scan.objectId))+'</strong> · '+h(typeLabel(scan.type))+'</p>'+
  (scan.isTest?'<div class="dst-test-banner">TESTMODUS – nicht für die Lohnabrechnung</div>':'')+
  '<div class="card" style="margin:12px 0"><strong>'+h(headline)+'</strong>'+
  '<div class="muted" style="margin-top:8px">Entfernung zum Objekt: <strong>'+h(distance)+'</strong></div>'+
  '<div class="muted">Standortgenauigkeit: '+h(accuracy)+'</div>'+
  '<div class="muted">Ergebnis: '+h(gpsLabel(p.status))+'</div></div>'+
  (isGood?'<p class="muted">Du kannst den Check-in beziehungsweise Check-out jetzt bestätigen.</p>':
   (checkout
    ?'<p class="muted">Du kannst auch nach dem Verlassen des Objekts auschecken, z. B. vom geparkten Auto aus. Der tatsächliche Zeitpunkt des Auscheckens wird gespeichert, die Abweichung mit Grund protokolliert und zur Prüfung vorgelegt. Bitte das Smartphone nicht während der Fahrt bedienen.</p>'
    :'<p class="muted">Ein regulärer Check-in ist hier nicht möglich. Mit Begründung kannst du eine prüfpflichtige Ausnahmebuchung anlegen. Die Zeit wird dokumentiert, aber nicht automatisch freigegeben.</p>')+
   '<label style="display:block">Begründung der Ausnahme (mindestens '+minReason+' Zeichen)<textarea id="dstGeoExceptionReason" maxlength="500" rows="3" placeholder="'+
   (checkout?'z. B. Auschecken nach Verlassen des Objekts':'z. B. Testbuchung außerhalb des Objekts')+'"></textarea></label>'+
   (checkout?'<div class="dst-actions" style="margin-top:10px"><button type="button" id="dstReasonLateCheckout">Grund übernehmen: Auschecken nach Abfahrt</button></div>':'') )+
   '<div id="dstScanFeedback" role="status" aria-live="polite"></div>'+
   '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:14px">'+
   '<button id="dstRetryScan" type="button">Standort erneut prüfen</button>'+
   (isGood?'<button id="dstConfirmScan" type="button" class="primary">Buchung bestätigen</button>':
      '<button id="dstConfirmScan" type="button" class="primary">Ausnahmebuchung mit Begründung</button>')+
   '<button id="dstCancelScan" type="button">Abbrechen</button></div>');
 el('dstCancelScan')?.addEventListener('click',()=>{state.pendingScan=null;closeModal();});
 el('dstReasonLateCheckout')?.addEventListener('click',()=>{const t=el('dstGeoExceptionReason');if(t)t.value='Auschecken nach Abfahrt vom Objekt';});
 el('dstRetryScan')?.addEventListener('click',()=>{state.pendingScan=null;closeModal();void book(scan.type);});
 el('dstConfirmScan')?.addEventListener('click',async()=>{
  const current=state.pendingScan;
  if(!current||current!==scan||Date.now()-scan.at>60000
    ||scan.organizationId!==org()||scan.userId!==uid()
    ||scan.isTest!==state.isTest||scan.objectId!==(scan.type==='object_out'?getStatus(myRows()).objectId:state.objectId)){
    if(el('dstScanFeedback'))el('dstScanFeedback').textContent='Standortprüfung ist abgelaufen oder der Kontext hat gewechselt. Erneut prüfen.';
    return;
  }
  const reason=isGood?'':String(el('dstGeoExceptionReason')?.value||'').trim();
  if(!isGood&&(reason.length<minReason||reason.length>500)){
    if(el('dstScanFeedback'))el('dstScanFeedback').textContent='Bitte mindestens '+minReason+' Zeichen als Begründung eingeben.';
    return;
  }
  el('dstConfirmScan').disabled=true;
  try{
   await commitBooking(scan.type,scan.objectId,scan.gps,reason);
   if(state.pendingScan===scan){state.pendingScan=null;closeModal();}
  }catch(_){if(el('dstConfirmScan'))el('dstConfirmScan').disabled=false;}
 });
}
async function book(type){
 if(state.busy||!roleTime())return;
 const st=getStatus(myRows());
 const isObject=['object_in','object_out'].includes(type);
 const obj=type==='object_out'?st.objectId:state.objectId;
 if(isObject&&(!obj||!findObject(obj))){
  notice('Bitte den Objekt-QR-Code scannen beziehungsweise die Objektakte öffnen.',true);return;
 }
 if(isObject&&!!findObject(obj)?.isTest!==state.isTest){
  notice('Der Zeitmodus passt nicht zum Objekt. Bitte das Test-/Produktiv-Profil korrigieren.',true);return;
 }
 if(type==='object_out'&&!st.objectOpen)return notice('Kein offener Objekteinsatz.',true);
 if(type==='shift_end'&&(st.objectOpen||st.breakOpen))return notice('Bitte zuerst Objekteinsatz und Pause beenden.',true);
 if(!isObject){void commitBooking(type,null,null,'').catch(()=>{});return;}
 state.busy=true;
 notice('GPS wird zur einmaligen Standortprüfung abgefragt …');
 renderBookings();
 try{
  const gps=await getGps();
  if(!roleTime()||!org()||!uid())return;
  state.pendingScan={type,objectId:obj,organizationId:org(),userId:uid(),isTest:state.isTest,
    gps,plausibility:gpsPlausibility(gps,obj),at:Date.now()};
  notice('');
  const pending=state.pendingScan;
  setTimeout(()=>{if(state.pendingScan===pending)state.pendingScan=null;},60000);
  showScanPreview();
 }finally{state.busy=false;renderBookings();}
}
async function commitBooking(type,objectId,gps,exceptionReason){
 if(state.busy||!roleTime())throw new Error('Nicht berechtigt oder laufende Buchung.');
 const orgId=org(),userId=uid(),demo=state.isTest;
 if(!orgId||!userId)throw new Error('Sitzung nicht verfügbar.');
 if(objectId && !!findObject(objectId)?.isTest!==demo)throw new Error('Objekt gehört zu einem anderen Modus.');
 state.busy=true;
 notice('Zeitbuchung wird gespeichert …');
 try{
  const payload={organization_id:orgId,user_id:userId,object_id:objectId||null,
     event_type:type,is_test:demo,exception_reason:exceptionReason||null,...(gps||{})};
  const response=await cloudRequest('employee_time_events?select=id,event_type,occurred_at,gps_result,gps_distance_m,review_status,is_test',{
   method:'POST',headers:{Prefer:'return=representation','Content-Type':'application/json'},body:JSON.stringify(payload)
  });
  const result=Array.isArray(response)?response[0]:response;
  if(orgId!==org()||userId!==uid())return;
  // GPS raw location is intentionally not put into the local history.
  state.rows.unshift({...payload,gps_latitude:null,gps_longitude:null,...result});
  await loadRows();
  notice(typeLabel(type)+' gespeichert · '+fmt(result?.occurred_at)+
   (result?.review_status==='pending_review'?' · Ausnahme wartet auf Freigabe.':''));
 }catch(err){
  notice('Buchung nicht gespeichert: '+String(err.message||err),true);
  throw err;
 }finally{state.busy=false;render();}
}

function downloadCsv(){
 const demo=state.isTest;
 const all=modeRows();
 const rows=demo?all:all.filter(x=>x.review_status!=='pending_review'||timeReview(x.id)?.decision==='approved');
 const excluded=all.length-rows.length;
 if(!rows.length){
  notice(demo?'Keine Testbuchungen vorhanden.':'Keine geprüften Produktivbuchungen exportierbar.'+
   (excluded?' '+excluded+' Ausnahmen benötigen noch Freigabe.':''),true);return;
 }
 const safe=v=>{
  const txt=String(v??'').replace(/^[=+@-]/,"'$&");
  return '"'+txt.replace(/"/g,'""')+'"';
 };
 const header=['Modus','Mitarbeiter','Objekt','Ereignis','Zeitstempel','GPS-Status','Abstand m',
  'GPS-Genauigkeit m','Ausnahme-Prüfstatus','Ausnahme-Begründung'];
 const values=rows.slice().reverse().map(x=>[
  demo?'TEST – NICHT ABRECHNEN':'PRODUKTIV (BUCHUNGEN, KEINE LOHNABRECHNUNG)',
  typeof profileDisplayName==='function'?
   (profileDisplayName(x.user_id)||String(x.user_id).slice(0,8)):String(x.user_id).slice(0,8),
  x.object_id?objName(x.object_id):'',typeLabel(x.event_type),fmt(x.occurred_at),
  gpsLabel(x.gps_result),x.gps_distance_m??'',x.gps_accuracy_m??'',reviewLabel(x),x.exception_reason||''
 ]);
 // Excel (German locale): REAL UTF-8 BOM, semicolon separator hint and real CRLF.
 // Do not escape the backslash twice here: otherwise literal "\\uFEFF" and "\\r\\n"
 // corrupt the exported file, shifting rows and breaking umlauts.
 const crlf=String.fromCharCode(13,10);
 const csv=String.fromCharCode(0xFEFF)+'sep=;'+crlf
   +[header,...values].map(row=>row.map(safe).join(';')).join(crlf)+crlf;
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
 const a=document.createElement('a');a.href=url;
 a.download='duschl-'+(demo?'TEST-':'PRODUKTIV-')+'zeitereignisse-'+new Date().toISOString().slice(0,10)+'.csv';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
 if(excluded)notice(excluded+' ungeprüfte/abgelehnte Ausnahmebuchung(en) nicht in Produktiv-CSV enthalten.');
}

// Personalverwaltung: separated roles, contract terms and absences.
function mountPersonnel(){
 if(el('dstPersonnel'))return;
 const nav=el('navEmployeeTime');if(!nav)return;
 const b=document.createElement('button');b.id='navPersonnel';b.type='button';b.className='hidden';
 b.innerHTML='<span class="nav-icon">♧</span><span>Personalmanagement</span>';
 nav.insertAdjacentElement('afterend',b);
 const section=document.createElement('section');section.id='dstPersonnel';section.className='section';
 section.innerHTML='<h2>Personalmanagement</h2><p>Beschäftigungsverhältnisse, Vertragsdaten und Abwesenheiten</p>'+
 '<div id="dstPersonnelMessage" role="status"></div>'+
 '<div class="dst-box"><h3>Beschäftigungsstatus</h3><label>Mitarbeiter auswählen <select id="dstPersonId"><option value="">Benutzer auswählen …</option></select></label>'+
 '<label>Verhältnis <select id="dstRelation"><option value="employee">Arbeitnehmer</option><option value="external_contractor">Externer Dienstleister</option><option value="freelancer">Freier Mitarbeiter</option><option value="business_partner">Geschäftspartner</option><option value="test_account">Testzugang</option></select></label>'+
 '<button id="dstSaveRelation" type="button">Zuordnung speichern</button></div>'+
 '<div class="dst-box"><h3>Vertrag für Arbeitnehmer</h3>'+
 '<label>Gültig ab <input type="date" id="dstContractFrom"></label>'+
 '<label>Wochenstunden <input type="number" step="0.5" id="dstWeeklyHours"></label>'+
 '<label>Arbeitstage / Woche <input type="number" step="0.5" min="1" max="7" id="dstWorkDays"></label>'+
 '<label>Urlaubstage / Jahr <input type="number" step="0.5" id="dstVacationDays"></label>'+
 '<label>Beschäftigungsform <select id="dstEmploymentType"><option value="full_time">Vollzeit</option><option value="part_time">Teilzeit</option><option value="minijob">Minijob</option><option value="other">Sonstige</option></select></label>'+
 '<button id="dstSaveContract" type="button">Vertragsstand speichern</button></div>'+
 '<div class="dst-box"><h3>Abwesenheit beantragen</h3>'+
 '<label>Art <select id="dstAbsenceType"><option value="vacation">Urlaub</option><option value="sick">Krankheit</option><option value="time_off_in_lieu">Überstundenabbau</option><option value="training">Fortbildung</option><option value="special_leave">Sonderurlaub</option><option value="unpaid_leave">Unbezahlter Urlaub</option><option value="other">Sonstige</option></select></label>'+
 '<label>Von <input type="date" id="dstAbsFrom"></label><label>Bis <input type="date" id="dstAbsUntil"></label>'+
 '<button type="button" id="dstRequestAbsence">Antrag speichern</button><div id="dstAbsences"></div></div>'+
 '<div class="dst-box"><h3>Manuelle Zeitnachtragung (Mandantenverwaltung)</h3>'+
 '<p>Nachträge werden separat von GPS-Buchungen dokumentiert und sind nur durch Stornierung korrigierbar.</p>'+
 '<label>Beginn <input id="dstManualStart" type="datetime-local"></label>'+
 '<label>Ende <input id="dstManualEnd" type="datetime-local"></label>'+
 '<label>Pause (Minuten) <input id="dstManualBreak" type="number" min="0" value="0"></label>'+
 '<label>Begründung <textarea id="dstManualReason" placeholder="Grund der Nachtragung"></textarea></label>'+
 '<button id="dstSaveManual" type="button">Zeit nachtragen</button>'+
 '<div id="dstManualHistory"></div></div>'+ 
 '<div class="dst-box"><h3>Feiertage und Arbeitsort</h3><p>Feiertagsabzug bei Sollstunden erst nach Festlegung des Arbeitsortes aktivieren.</p>'+
 '<label>Arbeitsort <select id="dstHolidayPlace"><option value="UNSET">Nicht festgelegt</option><option value="MUNICH">München</option><option value="AUGSBURG">Augsburg</option><option value="OTHER_CATHOLIC">Bayern · Mariä Himmelfahrt gilt</option><option value="OTHER_NON_CATHOLIC">Bayern · Mariä Himmelfahrt gilt nicht</option></select></label>'+
 '<label><input type="checkbox" id="dstHolidayActive"> Gesetzliche Feiertage bei der Sollzeit berücksichtigen</label>'+
 '<button type="button" id="dstSaveHoliday">Feiertagsregel speichern</button></div>'+'<div class="dst-box"><h3>Überstunden freigeben</h3><label>Von <input id="dstOverFrom" type="date"></label><label>Bis <input id="dstOverTo" type="date"></label><label>Stunden <input id="dstOverHours" type="number" step="0.25" min="0"></label><label>Grund <input id="dstOverReason"></label><button id="dstApproveOvertime" type="button">Freigeben</button></div>'+'<div class="dst-box"><h3>Jahresurlaub freigeben</h3><p>Jahresanspruch nach arbeitsrechtlicher Prüfung einmalig buchen. Unterjähriger Eintritt oder Vertragswechsel muss gesondert geprüft werden.</p>'+
 '<label>Jahr <input id="dstLeaveYear" type="number" min="2020" max="2100"></label>'+
 '<label>Freigegebene Urlaubstage <input id="dstLeaveGrantDays" type="number" min="0" max="100" step="0.5"></label>'+
 '<label>Begründung <textarea id="dstLeaveGrantReason" placeholder="Vertrag, Eintritt, Sonderregelung"></textarea></label>'+
 '<button id="dstPreviewLeave" type="button">Anteiliges Urlaubskontingent schätzen</button><div id="dstLeavePreview"></div><button id="dstGrantLeave" type="button">Jahresanspruch einmalig buchen</button><div id="dstLeaveGrants"></div></div>'+'<div class="dst-box"><h3>Resturlaub übertragen</h3><p>Nur nach Prüfung des tatsächlichen Restanspruchs. Ein Übertrag ist eine neue Kontogutschrift.</p>'+
 '<label>Aus Jahr <input id="dstCarryFrom" type="number" min="2020" max="2100"></label>'+
 '<label>Nach Jahr <input id="dstCarryTo" type="number" min="2021" max="2101"></label>'+
 '<label>Tage <input id="dstCarryDays" type="number" step="0.5" min="0"></label>'+
 '<label>Übertrag gültig bis <input id="dstCarryExpiry" type="date"></label>'+
 '<label>Begründung <textarea id="dstCarryReason"></textarea></label>'+
 '<button id="dstSaveCarry" type="button">Übertrag freigeben</button><div id="dstCarryHistory"></div></div>'+'<div class="dst-box"><h3>Arbeitszeit- und Urlaubskonten</h3><p class="dst-muted">Buchungskonten mit nachvollziehbarer Historie. Urlaubsgutschriften und Überstunden müssen explizit geprüft und gebucht werden.</p><div id="dstAccounts"></div></div>'+ 
 '<div class="dst-box"><h3>Einsatzkonflikte Winterdienst</h3><button type="button" id="dstLoadConflicts">Konflikte der nächsten 30 Tage prüfen</button><div id="dstConflicts" role="status"></div></div>'+
 '<div class="dst-box"><h3>Personalberechtigungen</h3><p class="dst-muted">Berechtigung für die oben eingetragene Benutzer-ID verwalten. Nur Mandanten-Administratoren.</p>'+
 '<label>Berechtigung <select id="dstGrantType"><option value="hr_manage">Personalverwaltung</option><option value="hr_approve">Genehmigungen</option><option value="workforce_schedule">Einsatzplanung</option></select></label>'+
 '<button type="button" id="dstGrantPermission">Recht erteilen</button><button type="button" id="dstRevokePermission">Recht entziehen</button><div id="dstPermissions"></div></div>';
 document.querySelector('main')?.appendChild(section);
 // Compact personnel workspace: identity always visible, all other modules grouped by task.
 section.classList.add('dst-personnel-workspace');
 const boxes=[...section.querySelectorAll('.dst-box')];
 const groups=[
  ['Vertrag & Beschäftigung',[0,1]],
  ['Abwesenheiten & Urlaub',[2,6,7]],
  ['Zeiterfassung & Stundenkonto',[3,8,9]],
  ['Administration & Einsatzplanung',[4,5,10,11]]
 ];
 const tabs=document.createElement('div');tabs.className='dst-personnel-tabs';tabs.setAttribute('role','tablist');
 const present=new Set();
 const headings=['Beschäftigung','Abwesenheiten','Arbeitszeit','Administration'];
 groups.forEach((item,index)=>{
  const panel=document.createElement('div');panel.className='dst-personnel-panel';panel.dataset.group=String(index);
  item[1].forEach(i=>{if(boxes[i]){panel.appendChild(boxes[i]);present.add(i)}});
  section.appendChild(panel);
  const tab=document.createElement('button');tab.type='button';tab.className='dst-personnel-tab';tab.textContent=headings[index];tab.dataset.group=String(index);
  tab.onclick=()=>{section.querySelectorAll('.dst-personnel-tab').forEach(x=>{x.classList.toggle('active',x===tab);x.setAttribute('aria-selected',String(x===tab))});section.querySelectorAll('.dst-personnel-panel').forEach(x=>x.hidden=x.dataset.group!==String(index))};
  tabs.appendChild(tab);
 });
 boxes.forEach((box,i)=>{if(!present.has(i)){const panel=section.querySelector('.dst-personnel-panel[data-group="3"]');panel?.appendChild(box)}});
 const identity=boxes[0];if(identity){identity.classList.add('dst-personnel-identity');section.insertBefore(identity,section.querySelector('.dst-personnel-panel'));}
 section.insertBefore(tabs,section.querySelector('.dst-personnel-panel'));
 tabs.querySelector('button')?.click();

 const feedback=t=>{el('dstPersonnelMessage').textContent=t};
 b.onclick=()=>{if(typeof showSection==='function')showSection('dstPersonnel');void loadPersonnelNames().then(()=>loadPersonnel())};
 const employeeId=()=>String(el('dstPersonId').value||'').trim();
 const selectedId=()=>roleAdmin()?employeeId():uid();
 const make=async(endpoint,data)=>cloudRequest(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 for(const action of ['dstGrantPermission','dstRevokePermission'])el(action).onclick=async()=>{
  if(!roleAdmin())return;
  const person=employeeId(),permission=el('dstGrantType').value;
  if(!VALID_ID.test(person)){feedback('Gültige Benutzer-ID erforderlich.');return;}
  try{
   if(action==='dstGrantPermission')await make('employee_hr_permissions',{organization_id:org(),user_id:person,permission,granted_by:uid()});
   else await cloudRequest('employee_hr_permissions?organization_id=eq.'+encodeURIComponent(org())+'&user_id=eq.'+encodeURIComponent(person)+'&permission=eq.'+encodeURIComponent(permission),{method:'DELETE'});
   feedback(action==='dstGrantPermission'?'Berechtigung vergeben.':'Berechtigung entzogen.');
   void loadPersonnel();
  }catch(e){feedback('Berechtigung nicht geändert: '+e.message);}
 };
 el('dstLoadConflicts').onclick=async()=>{try{
  const from=new Date(),to=new Date(from);to.setDate(from.getDate()+30);
  const date=d=>d.toISOString().slice(0,10);
  const r=await cloudRequest('rpc/personnel_assignment_conflicts_v1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_org:org(),p_from:date(from),p_to:date(to)})});
  el('dstConflicts').textContent=Array.isArray(r)&&r.length?r.length+' Einsatzkonflikte: '+r.map(x=>x.service_date+' · '+(typeof profileDisplayName==='function'?profileDisplayName(x.assigned_user_id):x.assigned_user_id)).join('; '):'Keine Konflikte im geprüften Zeitraum.';
 }catch(e){el('dstConflicts').textContent='Prüfung nicht möglich: '+e.message}};
 el('dstSaveHoliday').onclick=async()=>{if(!roleAdmin())return;try{
  const location=el('dstHolidayPlace').value,enabled=el('dstHolidayActive').checked;
  if(enabled&&location==='UNSET')throw Error('Zuerst gültigen Arbeitsort auswählen');
  await cloudRequest('employee_holiday_settings?on_conflict=organization_id',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},body:JSON.stringify({organization_id:org(),state_code:'BY',municipality_code:location,enabled,updated_by:uid(),updated_at:new Date().toISOString()})});
  feedback('Feiertagsregel gespeichert.');void loadPersonnel();
 }catch(e){feedback('Feiertagsregel nicht gespeichert: '+e.message)}};
 el('dstApproveOvertime').onclick=async()=>{if(!roleAdmin())return;try{
  const id=employeeId(),from=el('dstOverFrom').value,to=el('dstOverTo').value,hours=Number(el('dstOverHours').value),reason=el('dstOverReason').value.trim();
  if(!VALID_ID.test(id)||!from||!to||to<from||hours<=0||hours>200||reason.length<8)throw Error('Eingaben prüfen');
  const check=await cloudRequest('rpc/employee_time_comparison_v1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_org:org(),p_user:id,p_from:from,p_to:to})});
  const delta=Number((Array.isArray(check)?check[0]:check)?.difference_hours||0);
  if(hours>delta)throw Error('Freigabe überschreitet nachgewiesene Mehrarbeit ('+delta.toFixed(2)+' h).');
  await make('employee_overtime_approvals',{organization_id:org(),user_id:id,from_date:from,to_date:to,approved_hours:hours,justification:reason});
  feedback('Überstunden freigegeben.');void loadPersonnel();
 }catch(e){feedback('Fehler: '+e.message)}};
 el('dstSaveCarry').onclick=async()=>{if(!roleAdmin())return;try{
 const id=employeeId(),from=Number(el('dstCarryFrom').value),to=Number(el('dstCarryTo').value),days=Number(el('dstCarryDays').value),reason=el('dstCarryReason').value.trim(),expiry=el('dstCarryExpiry').value;
 if(!VALID_ID.test(id)||!Number.isInteger(from)||to!==from+1||!(days>0&&days<=100)||reason.length<8)throw Error('Mitarbeiter, Jahre, Tage und Begründung prüfen.');
 if(!confirm('Resturlaub '+days+' Tage nach '+to+' übertragen? Vorher prüfen, ob der Saldo bereits Überträge enthält.'))return;
 await make('employee_leave_carryovers',{organization_id:org(),user_id:id,from_year:from,to_year:to,days,expires_on:expiry||null,rationale:reason});
 feedback('Urlaubsübertrag verbucht.');void loadPersonnel();
 }catch(e){feedback('Übertrag fehlgeschlagen: '+e.message)}};
 el('dstPreviewLeave').onclick=async()=>{try{
  const id=employeeId(),year=Number(el('dstLeaveYear').value);
  if(!VALID_ID.test(id)||!Number.isInteger(year))throw Error('Mitarbeiter und Jahr auswählen');
  const response=await cloudRequest('rpc/employee_leave_proration_preview_v1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_org:org(),p_user:id,p_year:year})});
  const v=Array.isArray(response)?response[0]:response;
  el('dstLeavePreview').textContent='Rechnerische Orientierung: '+(v?.approx_days??0)+' Tage aus '+(v?.calendar_days??0)+' vertraglich abgedeckten Kalendertagen. Keine automatische Freigabe: gesetzlicher Mindesturlaub, Wartezeit und vertragliche Sonderregeln sind gesondert zu prüfen.';
 }catch(e){feedback('Urlaubsschätzung fehlgeschlagen: '+e.message)}};
 el('dstGrantLeave').onclick=async()=>{if(!roleAdmin())return;try{
  const id=employeeId(),year=Number(el('dstLeaveYear').value),days=Number(el('dstLeaveGrantDays').value),reason=el('dstLeaveGrantReason').value.trim();
  if(!VALID_ID.test(id)||!Number.isInteger(year)||year<2020||year>2100||!Number.isFinite(days)||days<0||days>100||reason.length<8)throw Error('Mitarbeiter, Jahr, Urlaubstage und Begründung prüfen.');
  if(!confirm('Jahresurlaub '+days+' Tage für '+year+' einmalig buchen?'))return;
  await make('employee_annual_leave_grants',{organization_id:org(),user_id:id,calendar_year:year,granted_days:days,rationale:reason});
  feedback('Jahresurlaub verbucht.');void loadPersonnel();
 }catch(e){feedback('Jahresurlaubsbuchung fehlgeschlagen: '+e.message)}};
 el('dstSaveManual').onclick=async()=>{
  if(!roleAdmin())return;
  try{
   const person=employeeId(),start=el('dstManualStart').value,end=el('dstManualEnd').value,minutes=Number(el('dstManualBreak').value||0),reason=el('dstManualReason').value.trim();
   if(!VALID_ID.test(person))throw Error('Benutzer-ID auswählen');
   if(!start||!end||new Date(end)<=new Date(start))throw Error('Beginn und Ende prüfen');
   if(reason.length<8)throw Error('Begründung mit mindestens 8 Zeichen erforderlich');
   await make('employee_manual_time_entries',{organization_id:org(),user_id:person,starts_at:new Date(start).toISOString(),ends_at:new Date(end).toISOString(),break_minutes:minutes,reason});
   feedback('Manuelle Zeit dokumentiert.');void loadPersonnel();
  }catch(e){feedback('Zeitnachtrag fehlgeschlagen: '+e.message)}
 };
 el('dstManualHistory').onclick=async e=>{
  const b=e.target.closest('button[data-void-time]');if(!b||!roleAdmin())return;
  if(!confirm('Zeitnachtrag stornieren?'))return;
  try{await cloudRequest('employee_manual_time_entries?id=eq.'+encodeURIComponent(b.dataset.voidTime),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'void',voided_by:uid(),voided_at:new Date().toISOString()})});feedback('Nachtrag storniert.');void loadPersonnel()}
  catch(err){feedback('Stornierung fehlgeschlagen: '+err.message)}
 };
 el('dstPersonId').addEventListener('change',()=>void loadPersonnel());
 el('dstSaveRelation').onclick=async()=>{if(!roleAdmin())return;try{
  if(!VALID_ID.test(employeeId()))throw Error('Gültige Benutzer-ID erforderlich');
  await make('personnel_relationships',{organization_id:org(),user_id:employeeId(),relationship_type:el('dstRelation').value,effective_from:new Date().toISOString().slice(0,10)});
  feedback('Beschäftigungsstatus gespeichert.');void loadPersonnel();
 }catch(e){feedback('Fehler: '+e.message)}};
 el('dstSaveContract').onclick=async()=>{if(!roleAdmin())return;try{
  if(!VALID_ID.test(employeeId()))throw Error('Gültige Benutzer-ID erforderlich');
  await make('employee_contract_terms',{organization_id:org(),user_id:employeeId(),valid_from:el('dstContractFrom').value,weekly_hours:Number(el('dstWeeklyHours').value),working_days_per_week:Number(el('dstWorkDays').value),annual_vacation_days:Number(el('dstVacationDays').value),employment_type:el('dstEmploymentType').value});
  feedback('Vertragsstand gespeichert.');void loadPersonnel();
 }catch(e){feedback('Fehler: '+e.message)}};
 el('dstRequestAbsence').onclick=async()=>{try{
  if(!VALID_ID.test(selectedId()))throw Error('Gültige Benutzer-ID erforderlich');
  if(!roleAdmin()&&selectedId()!==uid())throw Error('Nur eigene Anträge erlaubt');
  await make('employee_absences',{organization_id:org(),user_id:selectedId(),absence_type:el('dstAbsenceType').value,starts_on:el('dstAbsFrom').value,ends_on:el('dstAbsUntil').value});
  feedback('Abwesenheit beantragt.');void loadPersonnel();
 }catch(e){feedback('Fehler: '+e.message)}};
 el('dstAbsences').onclick=async e=>{const btn=e.target.closest('button[data-review]');if(!btn||!roleAdmin())return;try{
  const id=btn.dataset.review,decision=btn.dataset.decision;
  if(decision==='cancelled'&&!confirm('Genehmigte Abwesenheit stornieren? Die Kontobuchung wird durch eine Gegenbuchung ausgeglichen.'))return;
  await cloudRequest('employee_absences?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:decision,reviewed_by:uid(),reviewed_at:new Date().toISOString()})});
  feedback('Entscheidung gespeichert.');void loadPersonnel();
 }catch(err){feedback('Fehler: '+err.message)}};
}
async function loadPersonnelNames(){
 const box=el('dstPersonId');if(!box||!org())return;
 const previous=box.value;box.innerHTML='<option value="">Benutzer auswählen …</option>';
 try{
  const members=await cloudRequest('organization_memberships?select=user_id,role&organization_id=eq.'+encodeURIComponent(org())+'&limit=500');
  const ids=[...new Set((members||[]).map(x=>x.user_id).filter(x=>VALID_ID.test(x)))];
  if(!ids.length)return;
  let profiles=[];
  try{profiles=await cloudRequest('profiles?select=id,full_name,email,active,deleted_at&id=in.('+ids.join(',')+')&limit=500')}catch(_){}
  const labels=new Map((profiles||[]).filter(p=>p.active!==false&&!p.deleted_at).map(p=>[p.id,p.full_name||p.email||p.id]));
  const options=(members||[]).filter(m=>labels.size===0||labels.has(m.user_id));
  options.sort((a,b)=>String(labels.get(a.user_id)||a.user_id).localeCompare(String(labels.get(b.user_id)||b.user_id),'de'));
  for(const m of options){const opt=document.createElement('option');opt.value=m.user_id;opt.textContent=(labels.get(m.user_id)||'Benutzer '+m.user_id.slice(0,8))+' · '+(m.role||'');box.appendChild(opt)}
  if(ids.includes(previous))box.value=previous;
 }catch(e){el('dstPersonnelMessage').textContent='Benutzerliste konnte nicht geladen werden: '+e.message}
}
async function loadPersonnel(){
 if(!cloudSession?.access_token||!org())return;
 const admin=roleAdmin(),person=String(el('dstPersonId')?.value||'').trim();
 for(const id of ['dstSaveRelation','dstSaveContract','dstSaveManual','dstGrantLeave','dstSaveCarry','dstPreviewLeave','dstSaveHoliday','dstApproveOvertime','dstGrantPermission','dstRevokePermission','dstLoadConflicts'])el(id).disabled=!admin;
 el('dstPersonId').disabled=!admin;
 const q='organization_id=eq.'+encodeURIComponent(org());
 try{
  const target=admin?person:uid();
  if(!VALID_ID.test(target)){el('dstPersonnelMessage').textContent='Bitte zuerst einen Benutzer auswählen.';return;}
  if(admin){
   try{
    const configs=await cloudRequest('employee_holiday_settings?select=municipality_code,enabled&'+q+'&limit=1');
    if(configs?.length){el('dstHolidayPlace').value=configs[0].municipality_code;el('dstHolidayActive').checked=!!configs[0].enabled;}
   }catch(e){el('dstPersonnelMessage').textContent='Feiertagsregel konnte nicht geladen werden: '+e.message;}
  }
  if(admin){
   try{
    const [relationships,contracts]=await Promise.all([
     cloudRequest('personnel_relationships?select=relationship_type,effective_from&'+q+'&user_id=eq.'+encodeURIComponent(target)+'&order=effective_from.desc&limit=1'),
     cloudRequest('employee_contract_terms?select=valid_from,weekly_hours,working_days_per_week,annual_vacation_days,employment_type&'+q+'&user_id=eq.'+encodeURIComponent(target)+'&order=valid_from.desc&limit=1')
    ]);
    const relation=relationships?.[0]?.relationship_type||'';
    if(relation)el('dstRelation').value=relation;
    const contract=contracts?.[0];
    for(const [id,key] of [['dstContractFrom','valid_from'],['dstWeeklyHours','weekly_hours'],['dstWorkDays','working_days_per_week'],['dstVacationDays','annual_vacation_days'],['dstEmploymentType','employment_type']])
     if(contract&&el(id))el(id).value=contract[key]??'';
    el('dstSaveContract').disabled=relation!=='employee';
   }catch(e){el('dstPersonnelMessage').textContent='Vertragsstammdaten konnten nicht geladen werden: '+e.message;}
  }
  const manual=await cloudRequest('employee_manual_time_entries?select=id,user_id,starts_at,ends_at,break_minutes,reason,status,created_by,created_at&'+q+'&user_id=eq.'+encodeURIComponent(target)+'&order=starts_at.desc&limit=100');
  el('dstManualHistory').innerHTML='<h4>Manuelle Nachträge</h4>'+(manual.length?manual.map(x=>
   '<div class="dst-row"><span>'+h(fmt(x.starts_at))+' – '+h(fmt(x.ends_at))+' · Pause '+h(x.break_minutes)+' min · '+h(x.reason)+' · '+h(x.status)+' · erfasst '+h(fmt(x.created_at))+'</span>'+
   (admin&&x.status==='approved'?'<button type="button" data-void-time="'+h(x.id)+'">Stornieren</button>':'')+'</div>').join(''):'Keine manuellen Nachträge.');
  const rows=await cloudRequest('employee_absences?select=id,user_id,absence_type,starts_on,ends_on,status&'+q+'&order=starts_on.desc&limit=100');
  const selected=target;
  if(admin){
   const grants=await cloudRequest('employee_annual_leave_grants?select=calendar_year,granted_days,approved_at&'+q+'&user_id=eq.'+encodeURIComponent(selected)+'&order=calendar_year.desc&limit=20');
   el('dstLeaveGrants').textContent=grants.length?grants.map(x=>x.calendar_year+': '+x.granted_days+' Tage').join(' · '):'Noch kein Jahresanspruch gebucht.';
   if(!el('dstLeaveYear').value)el('dstLeaveYear').value=new Date().getFullYear();
  }
  if(admin){
   const transfers=await cloudRequest('employee_leave_carryovers?select=from_year,to_year,days,expires_on&'+q+'&user_id=eq.'+encodeURIComponent(selected)+'&order=to_year.desc&limit=20');
   el('dstCarryHistory').textContent=transfers.length?transfers.map(x=>x.from_year+' → '+x.to_year+': '+x.days+' Tage'+(x.expires_on?' (Frist: '+x.expires_on+')':'')).join(' · '):'Noch keine Überträge.';
  }
  const account=await cloudRequest('employee_account_entries?select=account_type,amount,effective_date,source_type,comment&'+q+'&user_id=eq.'+encodeURIComponent(selected)+'&order=effective_date.desc&limit=500');
  const sum=kind=>account.filter(x=>x.account_type===kind).reduce((a,x)=>a+Number(x.amount||0),0);
  const yr=new Date().getFullYear(),start=yr+'-01-01';
  let contractual='';
  try{
   const compare=await cloudRequest('rpc/employee_time_comparison_v1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_org:org(),p_user:selected,p_from:start,p_to:new Date().toISOString().slice(0,10)})});
   const item=Array.isArray(compare)?compare[0]:compare;
   contractual='<p class="dst-muted">Soll: '+h(Number(item?.target_hours??0).toFixed(2))+' h · Ist (Stempel): '+h(Number(item?.clocked_hours||0).toFixed(2))+' h · Ist (manuell): '+h(Number(item?.manual_hours??0).toFixed(2))+' h · Differenz: '+h(Number(item?.difference_hours||0).toFixed(2))+' h. Keine automatische Überstundenfreigabe.</p>';
  }catch(_){contractual='<p class="dst-muted">Sollstunden noch nicht berechenbar.</p>';}
  el('dstAccounts').innerHTML='<strong>Urlaub: '+h(sum('vacation_days').toFixed(2))+' Tage · Zeitkonto: '+h(sum('time_hours').toFixed(2))+' Stunden</strong>'+
   contractual+'<p class="dst-muted">Gebuchte Salden, keine automatisch errechneten arbeitsrechtlichen Ansprüche. Jahresansprüche, Ist/Soll und Freizeitausgleich bedürfen weiterer Logik.</p>'+
   (account.length?account.slice(0,15).map(x=>'<div class="dst-row"><span>'+h(x.effective_date)+' · '+h(x.source_type)+' · '+h(x.account_type)+'</span><strong>'+h(x.amount)+'</strong></div>').join(''):'Noch keine Kontobuchungen.');
  if(admin){
   const perms=await cloudRequest('employee_hr_permissions?select=user_id,permission&'+q+'&limit=200');
   el('dstPermissions').textContent=perms.length?perms.map(x=>(typeof profileDisplayName==='function'?profileDisplayName(x.user_id):x.user_id)+' · '+x.permission).join(' | '):'Keine delegierten Personalrechte.';
  }else el('dstPermissions').textContent='Nur für Mandanten-Administratoren sichtbar.';
  const current=rows.filter(x=>x.user_id===selected);
  el('dstAbsences').innerHTML='<h4>Abwesenheiten</h4>'+(current.length?current.map(r=>'<div class="dst-row"><span>'+h(r.absence_type)+' · '+h(r.starts_on)+' – '+h(r.ends_on)+' · '+h(r.status)+'</span>'+
    (admin&&r.status==='requested'?'<button data-review="'+h(r.id)+'" data-decision="approved">Genehmigen</button><button data-review="'+h(r.id)+'" data-decision="rejected">Ablehnen</button>':admin&&r.status==='approved'?'<button data-review="'+h(r.id)+'" data-decision="cancelled">Stornieren</button>':'')+'</div>').join(''):'Keine Einträge');
 }catch(err){el('dstPersonnelMessage').textContent='Abwesenheiten nicht geladen: '+err.message}
}

mount();
mountPersonnel();
installAdminTimePermissionEditor();
navSync();
setInterval(navSync,1800);
setInterval(()=>{if(document.visibilityState==='visible'&&el('dsTimeHub')?.classList.contains('active')&&roleTime()&&!state.busy)void loadRows();},30000);
})();