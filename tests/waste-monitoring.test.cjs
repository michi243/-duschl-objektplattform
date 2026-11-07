const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const moduleText=fs.readFileSync('waste-monitoring.js','utf8');
const standaloneModuleText=moduleText.replace(/^import \{[\s\S]*?\} from '\.\/offline-waste-core\.js';\s*/,'');
const sql=fs.readFileSync('sql/20261107_waste_bin_qr_monitoring_v35730.sql','utf8');
const index=fs.readFileSync('index.html','utf8');
const release=JSON.parse(fs.readFileSync('release.json','utf8'));

async function loadSummary(){
  const url='data:text/javascript;base64,'+Buffer.from(standaloneModuleText).toString('base64');
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
  assert.equal(release.version,'3.57.34');
  assert.ok(index.includes("let APP_VERSION='3.57.34'"));
  assert.ok(index.includes('waste-monitoring.js?v=3.57.34'));
  assert.doesNotMatch(index,/id="navWasteManagement"/);
  assert.doesNotMatch(index,/showSection\('wasteManagement'\)/);
  assert.match(index,/dsOpenWasteForObject/);
  assert.match(index,/data-ds-waste-object/);
  assert.match(index,/Müllmanagement · Tonnen & Auswertung/);
  assert.match(index,/window\.dsWasteQrMaybeOpen/);
  assert.match(index,/rpc\/ds_list_commissioned_waste_objects_v1/);
  assert.match(index,/fixedObjectId:objectId/);
  assert.match(moduleText,/if\(fixedObjectId\)/);
  assert.match(index,/readOnly:isPropertyManagerRole\(\)/);
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


test('label formats and high-resolution graphic contain exactly object, QR image and bin number',async()=>{
  const url='data:text/javascript;base64,'+Buffer.from(standaloneModuleText).toString('base64');
  const {drawWasteQrLabel,WASTE_QR_LABEL_FORMATS}=await import(url);
  assert.deepEqual(Object.keys(WASTE_QR_LABEL_FORMATS),['62x40','50x30']);
  for(const [format,w,h] of [['62x40',744,480],['50x30',600,360]]){
    const textDrawn=[],images=[];
    const ctx={
      fillStyle:'',textAlign:'',textBaseline:'',font:'',imageSmoothingEnabled:true,
      fillRect(){},
      measureText(t){return {width:String(t).length*14}},
      fillText(t){textDrawn.push(t)},
      drawImage(...args){images.push(args)}
    };
    const target={width:0,height:0,getContext:()=>ctx};
    const qrSource={id:'test-qr'};
    const result=drawWasteQrLabel(target,qrSource,'Musterstraße 12','RM001',format);
    assert.equal(target.width,w);assert.equal(target.height,h);
    assert.deepEqual(textDrawn,['Musterstraße 12','RM001']);
    assert.equal(images.length,1);
    assert.equal(images[0][0],qrSource);
    assert.ok(result.qrSizePx>=190,'QR must remain large enough for mobile scan');
  }
  assert.doesNotMatch(moduleText,/DUSCHL SERVICE · MÜLLMONITORING<\/div>/);
  assert.doesNotMatch(moduleText,/<p>QR scannen und Füllstand erfassen/);
});
test('printed media size equals selected physical QR label size, not A4',async()=>{
  const url='data:text/javascript;base64,'+Buffer.from(standaloneModuleText).toString('base64');
  const {wasteQrLabelPrintHtml}=await import(url);
  const png='data:image/png;base64,AAAA';
  for(const [format,mm] of [['62x40','62mm 40mm'],['50x30','50mm 30mm']]){
    const html=wasteQrLabelPrintHtml(png,format);
    assert.ok(html.includes('@page{size:'+mm+';margin:0}'));
    assert.ok(html.includes('<img id="wasteLabelImage"'));
    assert.doesNotMatch(html,/DUSCHL SERVICE|Restmüll|Liter|QR scannen/);
  }
  assert.throws(()=>wasteQrLabelPrintHtml('javascript:alert(1)','62x40'));
  assert.throws(()=>wasteQrLabelPrintHtml(png,'A4'));
});

test('object-scoped waste discovery keeps tenant/object and active service gates',()=>{
  const sqlNavigation=fs.readFileSync('sql/20261107_waste_object_navigation_v35732.sql','utf8');
  assert.match(sqlNavigation,/create or replace function public\.ds_list_commissioned_waste_objects_v1\(p_organization_id uuid\)/i);
  assert.match(sqlNavigation,/private\.ds_waste_can_access\(p_organization_id,o\.id,false\)/i);
  assert.match(sqlNavigation,/private\.ds_waste_service_commissioned\(p_organization_id,o\.id\)/i);
  assert.match(sqlNavigation,/o\.active is true/i);
  assert.match(sqlNavigation,/revoke all on function public\.ds_list_commissioned_waste_objects_v1\(uuid\) from public, anon/i);
  assert.match(sqlNavigation,/grant execute on function public\.ds_list_commissioned_waste_objects_v1\(uuid\) to authenticated/i);
  const hardened=fs.readFileSync('sql/20261107_waste_object_navigation_harden_v35732.sql','utf8');
  assert.match(hardened,/create or replace function private\.ds_list_commissioned_waste_objects_impl_v1/i);
  assert.match(hardened,/security invoker/i);
  assert.match(hardened,/security definer/i);
  assert.match(hardened,/revoke all on function public\.ds_list_commissioned_waste_objects_v1\(uuid\) from public, anon/i);
  assert.match(index,/dsWasteGetCommissionedObjectIds\(true\)/,'the object is re-authorized before opening');
  assert.match(index,/commissionedWasteIds\.has\(String\(objectId\)\)/,'service card must use server-validated commission');
  assert.match(index,/originalTenant!==String\(currentOrganizationId\(\)\|\|''\)/,'tenant switch blocks stale navigation');
  assert.match(index,/qr_token:'eq\.'\+token/,'QR still identifies individual bin');
  assert.match(index,/window\.dsWasteMountObject\(objectId\)/);
  assert.match(moduleText,/selected = String\(fixedObjectId\|\|''\)/);
  assert.match(moduleText,/if\(fixedObjectId && String\(b\.object_id\)!==String\(fixedObjectId\)\)/);
  assert.doesNotMatch(index,/id="dsWasteRoot"/);
  assert.doesNotMatch(index,/id="wasteManagement"/);
});

test('mobile waste modal is unobstructed and annual data remains legible',()=>{
  assert.match(index,/#modalRoot \.ds-waste-dialog>\.ds-global-modal-close\{display:none!important\}/);
  assert.match(index,/\.ds-waste-modal-head\{[\s\S]*?position:sticky/);
  assert.match(index,/dialog\.classList\.add\('ds-waste-dialog'\)/);
  assert.match(index,/\.waste-report \.waste-table\{display:none\}/);
  assert.match(index,/\.waste-report-mobile\{display:grid/);
  assert.match(moduleText,/waste-report-metrics/);
  assert.match(moduleText,/Erläuterung zur Bewertung/);
  assert.match(moduleText,/Ist-Gebühren nicht hinterlegt/);
  assert.match(moduleText,/scans\.length===1\?'Erfassung':'Erfassungen'/);
  assert.doesNotMatch(moduleText,/Hinterlegte Ist-Gebühren: '\+fmtEuro\(total\)/);
  assert.match(index,/waste-monitoring\.js\?v=3\.57\.33/);
});
