/* Duschl Service – Personal ↔ Ressourcen: reine, mandantensichere Planungslogik.
 * Keine HR-Rohdaten persistieren oder an ungeprüfte Rollen ausgeben.
 * Der Aufrufer MUSS Datensätze zuvor anhand von Organisation und Berechtigung laden.
 * Release candidate 3.57.1 – kein automatisches Deployment.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.DSWorkforcePlanning=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const isoDay=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):'';
const dayTime=(date,time)=>time?Date.parse(date+'T'+time):NaN;
const inRange=(date,from,to)=>Boolean(date&&from&&date>=from&&(!to||date<=to));
const sameOrg=(r,org)=>String(r?.organization_id||'')===String(org||'');
const active=(r,date)=>r?.active!==false&&inRange(date,r?.valid_from||r?.effective_from||'0001-01-01',r?.valid_until||r?.effective_until||'');
const isApprovedAbsence=a=>['approved','accepted','confirmed','genehmigt'].includes(String(a?.status||'').toLowerCase());
const normalizeDateTime=v=>{const n=Date.parse(v||'');return Number.isFinite(n)?n:NaN;};
const overlaps=(a,b,c,d)=>Number.isFinite(a)&&Number.isFinite(b)&&Number.isFinite(c)&&Number.isFinite(d)&&a<d&&c<b;
function assessAssignment(input){
 const org=String(input?.organizationId||''),user=String(input?.userId||''),date=isoDay(input?.date);
 if(!org||!user||!date)return {assignable:false,issues:[{code:'INVALID_INPUT',severity:'block'}],availableHours:null};
 const select=key=>(Array.isArray(input?.[key])?input[key]:[]).filter(r=>sameOrg(r,org)&&String(r.user_id||'')===user);
 const issues=[];
 const relationships=select('relationships');
 if(!relationships.some(r=>active(r,date)&&['employee','staff','minijob','contractor'].includes(String(r.relationship_type||'').toLowerCase())))issues.push({code:'NO_ACTIVE_PERSONNEL_RELATIONSHIP',severity:'block'});
 const absence=select('absences').filter(a=>isApprovedAbsence(a)&&inRange(date,a.starts_on,a.ends_on));
 if(absence.length)issues.push({code:'APPROVED_ABSENCE',severity:'block'}); // Typ/Grund bewusst nicht exponieren
 const start=dayTime(date,input.startTime),end=dayTime(date,input.endTime);
 const withHours=Number.isFinite(start)&&Number.isFinite(end)&&end>start;
 for(const b of select('availabilityBlocks')){
  const s=normalizeDateTime(b.starts_at),e=normalizeDateTime(b.ends_at);
  if(withHours?overlaps(start,end,s,e):(Number.isFinite(s)&&Number.isFinite(e)&&s<Date.parse(date+'T23:59:59')&&e>Date.parse(date+'T00:00:00')))
   {issues.push({code:'UNAVAILABLE',severity:'block'});break}
 }
 const booked=select('existingAssignments').filter(a=>a.status!=='cancelled'&&a.status!=='canceled'&&a.id!==input.assignmentId&&a.assignment_date===date);
 if(booked.some(a=>withHours&&overlaps(start,end,dayTime(date,a.starts_at||a.start_time),dayTime(date,a.ends_at||a.end_time))))
   issues.push({code:'TIME_CONFLICT',severity:'block'});
 else if(booked.length)issues.push({code:'SAME_DAY_ASSIGNMENT_REVIEW',severity:'warning'});
 const required=[...new Set((input.requiredQualifications||[]).map(String))];
 const granted=new Set(select('qualifications').filter(q=>active(q,date)).map(q=>String(q.qualification_code)));
 if(required.some(q=>!granted.has(q)))issues.push({code:'QUALIFICATION_MISSING',severity:'block'});
 const patterns=select('workPatterns').filter(p=>inRange(date,p.valid_from||'0001-01-01',p.valid_until||''));
 const weekday=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7+1;
 const pattern=patterns.find(p=>Number(p.weekday)===weekday);
 const availableHours=pattern?Math.max(0,Number(pattern.planned_hours)||0):null;
 if(availableHours===null)issues.push({code:'WORK_PATTERN_UNKNOWN',severity:'warning'});
 if(withHours&&availableHours!==null&&(end-start)/3600000>availableHours)issues.push({code:'DAILY_CAPACITY_EXCEEDED',severity:'warning'});
 return {assignable:!issues.some(i=>i.severity==='block'),issues,availableHours};
}
return Object.freeze({assessAssignment});
});
