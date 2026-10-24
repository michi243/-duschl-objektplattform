/* Duschl Service v3.57.15 · datensparsame HR-Schnittstelle zur Ressourcenplanung */
(function(){
'use strict';
const id=x=>document.getElementById(x);
const statusLabel={available:'Verfügbar',unavailable:'Gesperrt',not_configured:'Unvollständig'};
let requestSeq=0;
function monday(value){
 const d=value?new Date(value+'T12:00:00'):new Date();
 if(Number.isNaN(d.getTime()))return null;
 d.setDate(d.getDate()-((d.getDay()+6)%7));
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
function panel(){
 const section=id('resourcePlanning'),control=section?.querySelector('.rp-week-control');
 if(!control)return null;
 let box=id('rpPersonnelLink');
 if(!box){
  box=document.createElement('div');box.id='rpPersonnelLink';box.className='card';
  box.style.cssText='margin-top:14px;padding:16px;border:1px solid #37566d';
  const header=document.createElement('div');header.className='row space';
  header.style.cssText='display:flex;gap:12px;align-items:center;flex-wrap:wrap';
  const title=document.createElement('h3');title.textContent='Personalverfügbarkeit · Schnittstelle';title.style.margin='0';
  const btn=document.createElement('button');btn.type='button';btn.textContent='Personalmanagement öffnen';
  btn.onclick=()=>{if(typeof window.dsPersonnelOpen==='function')window.dsPersonnelOpen();else alert('Personalmanagement nicht verfügbar.');};
  header.append(title,btn);
  const description=document.createElement('p');description.className='muted';
  description.textContent='Genehmigte Abwesenheiten, Sperrzeiten und Arbeitszeitmuster aus dem Personalmanagement. Keine sensiblen Abwesenheitsgründe.';
  const info=document.createElement('div');info.id='rpPersonnelLinkInfo';info.className='muted';info.setAttribute('aria-live','polite');
  const wrap=document.createElement('div');wrap.style.overflowX='auto';
  const table=document.createElement('table');table.className='resource-table';
  table.style.width='100%';
  const thead=document.createElement('thead');const row=document.createElement('tr');
  ['Mitarbeiter','Mo','Di','Mi','Do','Fr','Sa','So','Wochenstunden'].forEach(t=>{const th=document.createElement('th');th.textContent=t;row.append(th);});
  thead.append(row);table.append(thead);
  const tbody=document.createElement('tbody');tbody.id='rpPersonnelLinkBody';table.append(tbody);wrap.append(table);
  box.append(header,description,info,wrap);
  control.parentNode.insertBefore(box,control);
 }
 return box;
}
async function refresh(){
 if(!panel())return;
 const info=id('rpPersonnelLinkInfo'),tbody=id('rpPersonnelLinkBody');
 if(!info||!tbody)return;
 const seq=++requestSeq;
 const org=typeof currentOrganizationId==='function'?currentOrganizationId():null;
 if(!org||typeof resourcePlanningCanAdmin!=='function'||!resourcePlanningCanAdmin()){
  tbody.replaceChildren();info.textContent='Keine Berechtigung für diese Übersicht.';return;
 }
 const week=monday(id('rpWeekStart')?.value);
 if(!week){info.textContent='Ungültige Kalenderwoche.';return;}
 info.textContent='Personalverfügbarkeit wird geladen …';tbody.replaceChildren();
 try{
  const rows=await cloudRequest('rpc/personnel_week_capacity_status_v1',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({p_org:org,p_monday:week})
  });
  if(seq!==requestSeq||org!==currentOrganizationId())return;
  if(!Array.isArray(rows))throw Error('Unerwartete Serverantwort');
  const users=typeof resourcePlanningState!=='undefined'?resourcePlanningState.users||[]:[];
  const byId=new Map();
  for(const item of rows){
   if(!byId.has(item.user_id))byId.set(item.user_id,[]);
   byId.get(item.user_id).push(item);
  }
  for(const [userId,days] of byId){
   days.sort((a,b)=>String(a.day).localeCompare(String(b.day)));
   const user=users.find(u=>String(u.user_id)===String(userId));
   const tr=document.createElement('tr');
   const name=document.createElement('td');name.textContent=user?.full_name||user?.email||'Mitarbeiter '+String(userId).slice(0,8);tr.append(name);
   for(const day of days){
    const td=document.createElement('td');td.textContent=day.availability==='available'?'✓':day.availability==='unavailable'?'–':'?';
    td.title=statusLabel[day.availability]||'Unbekannt';
    td.setAttribute('aria-label',td.title);tr.append(td);
   }
   const hours=document.createElement('td');
   const configured=days.every(d=>d.planned_hours!==null);
   const availableHours=days.reduce((sum,d)=>sum+(d.availability==='available'?Number(d.planned_hours)||0:0),0);
   hours.textContent=configured?availableHours.toLocaleString('de-DE',{maximumFractionDigits:1})+' h':'Nicht vollständig';
   tr.append(hours);tbody.append(tr);
  }
  info.textContent=rows.length?'✓ Verknüpft · '+byId.size+' Mitarbeiter · Woche ab '+week+' · ? = fehlende Personalplanung':'Keine aktiven Ressourcenprofile für diese Woche.';
 }catch(e){
  if(seq!==requestSeq||org!==currentOrganizationId())return;
  info.textContent='Personalstatus nicht verfügbar: '+(e.message||e)+'. Keine Freigabe aus fehlenden Daten ableiten.';
 }
}
function init(){
 if(typeof window.loadResourcePlanningOverview!=='function')return;
 const previous=window.loadResourcePlanningOverview;
 window.loadResourcePlanningOverview=async function(...args){
  const result=await previous.apply(this,args);
  await refresh();
  return result;
 };
 panel();
 if(id('resourcePlanning')?.classList.contains('active'))void refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
