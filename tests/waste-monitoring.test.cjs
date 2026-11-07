const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const moduleText=fs.readFileSync('waste-monitoring.js','utf8');
const sql=fs.readFileSync('sql/20261107_waste_bin_qr_monitoring_v35730.sql','utf8');
const index=fs.readFileSync('index.html','utf8');
const release=JSON.parse(fs.readFileSync('release.json','utf8'));

async function loadSummary(){
  const url='data:text/javascript;base64,'+Buffer.from(moduleText).toString('base64');
  return (await import(url)).summarizeWasteBins;
}
test('annual report uses observed P90 and minimum eight entries',async()=>{
  const summarize=await loadSummary();
  const bin={id:'b1',code:'RM-001'};
  const samples=(values)=>values.map((v,i)=>({bin_id:'b1',fill_percent:v,observed_date:'2026-11-'+String(i+1).padStart(2,'0')}));
  const tooFew=summarize([bin],samples([0,25,50,50,50,50,50]));
  assert.equal(tooFew[0].probe,false);
  assert.equal(tooFew[0].p90,50);
  const good=summarize([bin],samples([0,25,50,50,50,50,50,50,50,50]));
  assert.equal(good[0].count,10);
  assert.equal(good[0].p90,50);
  assert.equal(good[0].probe,true);
  const peak=summarize([bin],samples([0,25,50,50,50,50,50,50,100,100]));
  assert.equal(peak[0].p90,100);
  assert.equal(peak[0].probe,false);
  assert.deepEqual(summarize([bin],[])[0].average,null);
});
test('frontend enforces logged-in scan route and central release number',()=>{
  assert.equal(release.version,'3.57.30');
  assert.ok(index.includes("let APP_VERSION='3.57.30'"));
  assert.ok(index.includes('waste-monitoring.js?v=3.57.30'));
  assert.ok(index.includes("showSection('wasteManagement')"));
  assert.ok(index.includes('window.dsWasteQrMaybeOpen'));
  assert.ok(index.includes('cloudSession?.access_token'));
  assert.ok(moduleText.includes('waste_bin_scans'));
  assert.ok(moduleText.includes('muelltonne'));
  assert.ok(moduleText.includes('QRCode.toCanvas'));
});
test('SQL Q-Gate: append only, active commissioned service, restricted REST writes and RLS',()=>{
  assert.match(sql,/alter table public\.waste_bins enable row level security/i);
  assert.match(sql,/alter table public\.waste_bin_scans enable row level security/i);
  assert.match(sql,/private\.ds_waste_service_commissioned/i);
  assert.match(sql,/a\.active is true and t\.active is true/i);
  assert.match(sql,/auth\.uid\(\)/);
  assert.match(sql,/constraint waste_bin_scans_one_per_day unique\(bin_id,observed_date\)/);
  assert.match(sql,/grant select on public\.waste_bin_scans to authenticated/i);
  assert.doesNotMatch(sql,/grant (?:all|insert|select).*waste_bin_scans to anon/i);
  assert.doesNotMatch(sql,/create policy waste_bin_scans_update/i);
  assert.doesNotMatch(sql,/grant update.*waste_bin_scans/i);
  assert.match(sql,/grant update\(code,waste_type,volume_liters,pickups_per_week,annual_fee_eur,active\)/i);
});
