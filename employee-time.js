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
   <p class="dst-muted">Mandanteninterne Übersicht aus Dienstbeginn, Dienstende und Pausen. Fehlende gesetzliche Mindestpause wird für die vorläufige Netto-Anzeige rechnerisch berücksichtigt und ausdrücklich zur Prüfung markiert; sie gilt nicht als nachgewiesene Pause. Keine Lohnabrechnung.</p>
   <div class="dst-actions">
    <label>Mitarbeiter <select id="dstHoursEmployee"><option value="">Alle Mitarbeiter</option></select></label>
    <label>Zeitraum <select id="dstHoursPeriod"><option value="week">Diese Woche</option><option value="month" selected>Dieser Monat</option><option value="all">Alle geladenen Buchungen</option></select></label>
    <button type="button" id="dstHoursCsv">Arbeitszeitübersicht CSV</button>
   </div>
   <div id="dstHoursSummary" class="dst-muted" style="margin-top:14px"></div>
   <div id="dstHoursTable" style="overflow-x:auto;margin-top:12px"></div>
   <div class="dst-internal-note">Hinweis: Pausenautomatik ist nur eine rechnerische Annahme: Nicht tatsächlich genommene Pausen dürfen nicht als nachgewiesen gelten. Die Übersicht basiert auf maximal 1.000 zuletzt geladenen Ereignissen. Bei älteren Zeiträumen und periodenübergreifenden Schichten sind die Stunden nicht vollständig. Ausschließlich der aktive Mandant wird angezeigt.</div>
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
function statutoryBreakMinutes(spanMs,recordedMs){
 // Model assumption for preliminary reporting, NOT evidence of an actual break.
 // Determine the legal threshold from effective working time; avoid circular boundary at 6/9h.
 const span=Math.max(0,spanMs)/60000,recorded=Math.max(0,recordedMs)/60000;
 let minimum=0;
 if(span-recorded>360)minimum=30;
 if(span-Math.max(recorded,30)>540)minimum=45;
 return Math.max(recorded,minimum);
}
function summarizeHours(){
 // Sequential pairing, not sum of object visits. Unmatched events are explicitly flagged.
 const grouped=new Map();
 for(const x of currentHoursRows().slice().sort((a,b)=>new Date(a.occurred_at)-new Date(b.occurred_at))){
  const id=String(x.user_id);if(!grouped.has(id))grouped.set(id,[]);
  grouped.get(id).push(x);
 }
 const result=[];
 for(const [id,events] of grouped){
  let shift=null,breakAt=null,breakMs=0,issue=false,exceptions=0;
  let minutes=0,completed=0;
  for(const e of events){
   const when=new Date(e.occurred_at).getTime();
   if(!Number.isFinite(when)){issue=true;continue;}
   if(e.review_status==='pending_review'&&!timeReview(e.id) || timeReview(e.id)?.decision==='rejected')exceptions++;
   if(e.event_type==='shift_start'){
    if(shift!==null)issue=true;
    shift=when;breakAt=null;breakMs=0;
   }else if(e.event_type==='break_start'){
    if(shift===null||breakAt!==null)issue=true;
    else breakAt=when;
   }else if(e.event_type==='break_end'){
    if(breakAt===null)issue=true;
    else {breakMs+=Math.max(0,when-breakAt);breakAt=null;}
   }else if(e.event_type==='shift_end'){
    if(shift===null){issue=true;continue;}
    if(breakAt!==null){issue=true;breakMs+=Math.max(0,when-breakAt);}
    if(when<shift)issue=true;
    else {minutes+=Math.max(0,when-shift-statutoryBreakMinutes(when-shift,breakMs)*60000)/60000;completed++;}
    shift=null;breakAt=null;breakMs=0;
   }
  }
  if(shift!==null)issue=true;
  result.push({id,name:timeEmployeeName(id),hours:minutes/60,completed,open:shift!==null,issue,exceptions,events:events.length});
 }
 return result.sort((a,b)=>a.name.localeCompare(b.name,'de'));
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
   const pause=shift.breakMs+(shift.pauseAt!==null&&end?Math.max(0,end-shift.pauseAt):0);
   const issues=[...shift.issues];
   if(open)issues.push('Gehen fehlt');
   if(shift.pauseAt!==null)issues.push('Pausenende fehlt');
   const effectivePause=duration===null?pause/60000:statutoryBreakMinutes(duration,pause);
   if(duration!==null&&effectivePause>pause/60000)issues.push('Pausenabzug rechnerisch · tatsächliche Pause prüfen');
   const net=duration===null?null:Math.max(0,duration-effectivePause*60000)/3600000;
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
    if(shift){if(shift.pauseAt===null)shift.issues.push('Pausenbeginn fehlt');else {shift.breakMs+=Math.max(0,t-shift.pauseAt);shift.pauseAt=null;}}
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
mount();
installAdminTimePermissionEditor();
navSync();
setInterval(navSync,1800);
setInterval(()=>{if(document.visibilityState==='visible'&&el('dsTimeHub')?.classList.contains('active')&&roleTime()&&!state.busy)void loadRows();},30000);
})();