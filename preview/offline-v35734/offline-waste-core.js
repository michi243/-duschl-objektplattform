/* Duschl Service · v3.57.34 · offline waste capture (only object/bin metadata).
 * No tokens, credentials, fees or tenant-wide data are stored here.
 * Server authorization is always repeated during upload.
 */
export const OFFLINE_WASTE_ACCESS_MS=72*60*60*1000;
export const OFFLINE_WASTE_DB='duschl-offline-waste-v1';
const STORE={snapshots:'snapshots',events:'events',settings:'settings'};
const scopeKey=(userId,organizationId,objectId)=>[userId,organizationId,objectId].join(':');
export function berlinDay(value){
  const d=new Date(value);
  if(!Number.isFinite(d.valueOf()))throw Error('Erfassungszeit ungültig.');
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(d).map(x=>[x.type,x.value]));
  return p.year+'-'+p.month+'-'+p.day;
}
export function isNetworkFailure(error){
  return error instanceof TypeError || /failed to fetch|networkerror|network request failed|load failed|offline/i.test(String(error?.message||''));
}
function dbOpen(){
  if(typeof indexedDB==='undefined')return Promise.reject(Error('Offline-Speicher in diesem Browser nicht verfügbar.'));
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(OFFLINE_WASTE_DB,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE.snapshots))db.createObjectStore(STORE.snapshots,{keyPath:'scope'});
      if(!db.objectStoreNames.contains(STORE.events))db.createObjectStore(STORE.events,{keyPath:'id'});
      if(!db.objectStoreNames.contains(STORE.settings))db.createObjectStore(STORE.settings,{keyPath:'key'});
    };
    request.onerror=()=>reject(request.error||Error('Lokaler Speicherfehler.'));
    request.onblocked=()=>reject(Error('Offline-Speicher durch anderen Tab blockiert.'));
    request.onsuccess=()=>resolve(request.result);
  });
}
async function operation(name,mode,action){
  const db=await dbOpen();
  try{return await new Promise((resolve,reject)=>{
    const transaction=db.transaction(name,mode);
    let result;
    transaction.oncomplete=()=>resolve(result);
    transaction.onerror=()=>reject(transaction.error||Error('Lokale Speicherung fehlgeschlagen.'));
    transaction.onabort=()=>reject(transaction.error||Error('Lokale Speicherung abgebrochen.'));
    try{
      const request=action(transaction.objectStore(name));
      if(request){
        request.onsuccess=()=>{result=request.result;};
        request.onerror=()=>{result=undefined;};
      }
    }catch(error){transaction.abort();reject(error);}
  });}finally{db.close();}
}
const get=(name,key)=>operation(name,'readonly',s=>s.get(key));
const all=name=>operation(name,'readonly',s=>s.getAll());
const put=(name,value)=>operation(name,'readwrite',s=>s.put(value));
const del=(name,key)=>operation(name,'readwrite',s=>s.delete(key));
export async function activeOfflineWaste(qrToken=''){
  const active=(await get(STORE.settings,'active'))?.value;
  if(!active||Date.now()>Number(active.expiresAt||0))return null;
  let snapshot;
  if(qrToken){
    // Resolve QR to previously provisioned objects of THIS user and tenant only.
    const candidates=await all(STORE.snapshots);
    snapshot=candidates.find(x=>x.userId===active.userId&&x.organizationId===active.organizationId &&
      x.expiresAt>Date.now()&&x.bins.some(b=>b.qr_token===qrToken));
  }else snapshot=await get(STORE.snapshots,active.scope);
  if(!snapshot||snapshot.userId!==active.userId||snapshot.organizationId!==active.organizationId
     ||Date.now()>snapshot.expiresAt)return null;
  return snapshot;
}
export async function provisionOfflineWaste({userId,organizationId,objectId,objectName,bins}){
  if(!userId||!organizationId||!objectId||!Array.isArray(bins))
    throw Error('Offline-Kontext unvollständig.');
  const now=Date.now(),scope=scopeKey(userId,organizationId,objectId);
  const snapshot={
    scope,userId,organizationId,objectId,objectName:String(objectName||'Objekt').slice(0,140),
    savedAt:now,expiresAt:now+OFFLINE_WASTE_ACCESS_MS,
    bins:bins.filter(b=>b.active!==false && String(b.object_id)===String(objectId))
      .map(b=>({id:String(b.id),code:String(b.code).slice(0,32),
        waste_type:String(b.waste_type),qr_token:String(b.qr_token||'')}))
  };
  await put(STORE.snapshots,snapshot);
  await put(STORE.settings,{key:'active',value:{scope,userId,organizationId,objectId,expiresAt:snapshot.expiresAt}});
  return snapshot;
}
export async function lockOfflineWaste(){
  await del(STORE.settings,'active');
  // Queued measurements stay in the database; never discard unsynced work on sign-out.
}
export async function reconcileOfflineWasteUser(userId){
  const active=(await get(STORE.settings,'active'))?.value;
  if(active&&(!userId||active.userId!==userId))await lockOfflineWaste();
}
export async function offlineWasteEvents(userId,organizationId){
  return (await all(STORE.events)).filter(e=>
    (!userId||e.userId===userId)&&(!organizationId||e.organizationId===organizationId))
    .sort((a,b)=>a.observedAt.localeCompare(b.observedAt));
}
export async function captureOfflineWaste({snapshot,binId,fillPercent,note=''}){
  if(!snapshot||Date.now()>snapshot.expiresAt)throw Error('Offline-Freigabe abgelaufen. Online erneut öffnen.');
  const bin=snapshot.bins.find(b=>b.id===binId);
  if(!bin)throw Error('Behälter nicht für diesen Offline-Kontext freigegeben.');
  if(![0,25,50,75,100].includes(fillPercent))throw Error('Füllstand ungültig.');
  if(String(note).length>500)throw Error('Bemerkung zu lang.');
  const observedAt=new Date().toISOString(),observedDate=berlinDay(observedAt);
  const events=await offlineWasteEvents(snapshot.userId,snapshot.organizationId);
  if(events.some(e=>e.binId===binId && e.observedDate===observedDate && e.status!=='sent'))
    throw Error('Für diese Tonne wurde heute bereits offline erfasst.');
  if(!globalThis.crypto?.randomUUID)throw Error('Sichere Ereignis-ID nicht verfügbar.');
  const record={
    id:globalThis.crypto.randomUUID(),userId:snapshot.userId,organizationId:snapshot.organizationId,
    objectId:snapshot.objectId,binId,binCode:bin.code,fillPercent,
    note:String(note).trim()||null,observedAt,observedDate,status:'pending',lastError:''
  };
  await put(STORE.events,record);
  return record;
}
const inFlight=new Set();
export async function syncOfflineWaste({userId,organizationId,api}){
  if(!userId||!organizationId||typeof api!=='function')throw Error('Angemeldeter Benutzer und Mandant erforderlich.');
  const lock=userId+':'+organizationId;
  if(inFlight.has(lock))return {skipped:true};
  inFlight.add(lock);
  let sent=0,conflicts=0,error='';
  try{
    const items=await offlineWasteEvents(userId,organizationId);
    for(const item of items){
      if(item.status==='conflict')continue;
      if(typeof navigator!=='undefined'&&navigator.onLine===false)break;
      try{
        await api('rpc/ds_record_offline_waste_scan_v1',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            p_organization_id:item.organizationId,p_bin_id:item.binId,
            p_fill_percent:item.fillPercent,p_note:item.note,
            p_observed_at:item.observedAt,p_client_event_id:item.id
          })
        });
        await del(STORE.events,item.id);
        sent++;
      }catch(e){
        error=String(e.message||e);
        if(/OFFLINE_WASTE_CONFLICT|OFFLINE_WASTE_DENIED|OFFLINE_WASTE_EXPIRED|PGRST202|function.*not found|permission denied|403|401/i.test(error)){
          item.status='conflict';item.lastError=error.slice(0,250);
          await put(STORE.events,item);
          conflicts++;
          continue;
        }
        break; // Ambiguous network response: preserve ID and retry idempotently.
      }
    }
    const remaining=await offlineWasteEvents(userId,organizationId);
    return {sent,conflicts,pending:remaining.filter(e=>e.status==='pending').length,
      blocked:remaining.filter(e=>e.status==='conflict').length,error};
  }finally{inFlight.delete(lock);}
}
