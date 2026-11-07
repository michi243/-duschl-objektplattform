'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync('offline-waste-core.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('offline-waste-app.js','utf8');
const sql=fs.readFileSync('sql/20261107_offline_waste_sync_v35734.sql','utf8');
const manifest=JSON.parse(fs.readFileSync('release.json','utf8'));
const load=()=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

function fakeIndexedDB(){
  const tables=new Map();
  return {open(){
    const request={};
    queueMicrotask(()=>{
      const db={
        objectStoreNames:{contains:n=>tables.has(n)},
        createObjectStore(name){tables.set(name,new Map());},
        transaction(name){
          const t={oncomplete:null,onerror:null,onabort:null,error:null,abort() {queueMicrotask(()=>t.onabort?.());}};
          t.objectStore=()=>{
            const store=tables.get(name);
            const act=(f)=>{
              const r={};
              queueMicrotask(()=>{
                try{r.result=f();r.onsuccess?.();t.oncomplete?.();}
                catch(err){t.error=err;r.onerror?.();t.onerror?.();}
              });
              return r;
            };
            return {
              get:key=>act(()=>store.get(key)),
              getAll:()=>act(()=>[...store.values()]),
              put:record=>act(()=>{store.set(record.key||record.scope||record.id,record);return record;}),
              delete:key=>act(()=>{store.delete(key);})
            };
          };
          return t;
        },
        close(){}
      };
      request.result=db;
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  }};
}
const UUID_A='11111111-1111-4111-8111-111111111111';
const UUID_B='22222222-2222-4222-8222-222222222222';
const UUID_OBJ='33333333-3333-4333-8333-333333333333';
test('Berlin day survives UTC and DST transitions',async()=>{
  const m=await load();
  assert.equal(m.berlinDay('2026-11-07T23:30:00Z'),'2026-11-08');
  assert.equal(m.berlinDay('2026-03-29T00:30:00Z'),'2026-03-29');
  assert.equal(m.berlinDay('2026-03-29T22:30:00Z'),'2026-03-30');
});
test('offline storage: scope, daily deduplication, replay, and no data loss on network failure',async()=>{
  globalThis.indexedDB=fakeIndexedDB();
  if(!globalThis.crypto)globalThis.crypto=webcrypto;
  const m=await load();
  const s=await m.provisionOfflineWaste({userId:UUID_A,organizationId:UUID_B,objectId:UUID_OBJ,objectName:'Teststraße 7',
    bins:[{id:'bin1',object_id:UUID_OBJ,code:'RM-1',active:true,qr_token:'token1',annual_fee_eur:987},
      {id:'bin2',object_id:UUID_OBJ,code:'PA-2',active:true,qr_token:'token2'},
      {id:'bad',object_id:'somewhere-else',code:'X',active:true}]});
  assert.equal(s.bins.length,2);
  assert.ok(!JSON.stringify(s).includes('987'),'fee data must not enter offline snapshot');
  assert.equal((await m.activeOfflineWaste()).userId,UUID_A);
  await assert.rejects(m.captureOfflineWaste({snapshot:s,binId:'bad',fillPercent:25}),/nicht/);
  await m.captureOfflineWaste({snapshot:s,binId:'bin1',fillPercent:75});
  await assert.rejects(m.captureOfflineWaste({snapshot:s,binId:'bin1',fillPercent:50}),/bereits/);
  let pending=await m.offlineWasteEvents(UUID_A,UUID_B);
  assert.equal(pending.length,1);
  assert.equal((await m.offlineWasteEvents('another-user',UUID_B)).length,0);
  const calls=[];
  const fail=await m.syncOfflineWaste({userId:UUID_A,organizationId:UUID_B,
    api:async(path,options)=>{calls.push(JSON.parse(options.body));throw new TypeError('Failed to fetch');}});
  assert.equal(fail.pending,1,'ambiguous response must not drop record');
  const success=await m.syncOfflineWaste({userId:UUID_A,organizationId:UUID_B,
    api:async(path,options)=>{calls.push(JSON.parse(options.body));return {id:'server-id'};}});
  assert.equal(success.sent,1);
  assert.equal(success.pending,0);
  assert.equal(calls[0].p_client_event_id,calls[1].p_client_event_id,'same idempotency key on retry');
  assert.equal(calls[0].p_observed_at,calls[1].p_observed_at);
  await m.captureOfflineWaste({snapshot:s,binId:'bin2',fillPercent:25});
  const conflict=await m.syncOfflineWaste({userId:UUID_A,organizationId:UUID_B,
    api:async()=>{throw Error('OFFLINE_WASTE_DENIED: No permission');}});
  assert.equal(conflict.blocked,1);
  pending=await m.offlineWasteEvents(UUID_A,UUID_B);
  assert.equal(pending[0].status,'conflict','authorization failure retains record');
  // Previously prepared objects remain accessible only via their own QR in this tenant.
  const second=await m.provisionOfflineWaste({
    userId:UUID_A,organizationId:UUID_B,objectId:'44444444-4444-4444-8444-444444444444',
    objectName:'Zweites Objekt',
    bins:[{id:'bin3',object_id:'44444444-4444-4444-8444-444444444444',code:'BIO-3',active:true,qr_token:'token3'}]
  });
  assert.equal((await m.activeOfflineWaste('token1')).objectId,UUID_OBJ);
  assert.equal((await m.activeOfflineWaste('token3')).objectId,second.objectId);
  assert.equal(await m.activeOfflineWaste('wrong-token'),null);
  await m.lockOfflineWaste();
  assert.equal(await m.activeOfflineWaste(),null);
  assert.equal((await m.offlineWasteEvents(UUID_A,UUID_B)).length,1,'signout must not discard work');
});
test('PWA shell never caches tokens or external Supabase API; export still gated',()=>{
  assert.match(sw,/url.origin!==self.location.origin/);
  assert.match(sw,/ASSETS=\[.*offline-waste/);
  assert.doesNotMatch(sw,/caches\.open\(.*SUPABASE_URL/);
  assert.match(html,/navigator\.serviceWorker\.register\('\.\/sw\.js'/);
  assert.match(html,/userId:currentUserId\(\)/);
  assert.match(html,/window\.dsWasteLockOffline/);
  assert.match(app,/auth\/v1\/user/);
  assert.match(app,/user\.id!==expectedUser/);
  assert.match(app,/window\.addEventListener\('online'/);
  assert.equal(manifest.version,'3.57.34');
  assert.ok(html.includes("let APP_VERSION='3.57.34'"));
});
test('RPC preserves observation day, guards every write and prevents duplicate events',()=>{
  assert.match(sql,/add column if not exists client_event_id uuid/i);
  assert.match(sql,/unique index if not exists waste_bin_scans_client_event_unique/i);
  assert.match(sql,/private\.ds_waste_can_access\(p_organization_id,v_object,true\)/i);
  assert.match(sql,/private\.ds_waste_service_commissioned\(p_organization_id,v_object\)/i);
  assert.match(sql,/b\.organization_id = p_organization_id/i);
  assert.match(sql,/b\.active is true/i);
  assert.match(sql,/v_actor uuid := \(select auth\.uid\(\)\)/i);
  assert.match(sql,/at time zone 'Europe\/Berlin'/i);
  assert.match(sql,/on conflict do nothing/i);
  assert.match(sql,/revoke all on function public\.ds_record_offline_waste_scan_v1/i);
  assert.match(sql,/from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.ds_record_offline_waste_scan_v1/i);
  assert.doesNotMatch(sql,/grant insert.*client_event_id.*to authenticated/is);
});
