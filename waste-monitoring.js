/**
 * Duschl Service v3.57.30 – QR-Müllmonitoring.
 * Authenticated-only, object/tenant scope is enforced by server-side RLS.
 */
export function summarizeWasteBins(relevant, scans) {
  return relevant.map(bin => {
    const values=scans.filter(s=>s.bin_id===bin.id).map(s=>Number(s.fill_percent)).sort((a,b)=>a-b);
    const count=values.length;
    const average=count ? values.reduce((sum,value)=>sum+value,0)/count : null;
    const p90=count ? values[Math.ceil(count*0.9)-1] : null;
    return {bin,count,average,p90,probe:count>=8 && p90<=50};
  });
}


/**
 * Einheitliches, minimalistisches Tonnenetikett für Etikettendruck und PNG:
 * ausschließlich Straße/Objekt, QR-Code und Behälterkennung.
 * 12 px/mm entspricht rund 305 dpi, damit QR-Module scharf bleiben.
 */
export const WASTE_QR_LABEL_FORMATS = Object.freeze({
  '62x40': Object.freeze({widthMm:62,heightMm:40}),
  '50x30': Object.freeze({widthMm:50,heightMm:30})
});

export function drawWasteQrLabel(canvas, qrCanvas, objectLabel, binCode, format='62x40') {
  const spec=WASTE_QR_LABEL_FORMATS[format];
  if(!spec)throw Error('Unbekanntes Etikettenformat.');
  if(!canvas || !qrCanvas)throw Error('QR-Bild für das Etikett fehlt.');
  const mm=n=>Math.round(n*12);
  const width=mm(spec.widthMm),height=mm(spec.heightMm);
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Etikett kann nicht gezeichnet werden.');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#000000';ctx.textAlign='center';ctx.textBaseline='middle';
  const compact=format==='50x30';
  const edge=mm(compact?0.9:1.2);
  const top=mm(compact?3.4:4);
  const bottom=mm(compact?3.4:4.2);
  const gap=mm(0.3);
  const maxTextWidth=width-2*edge;
  function fittedText(value,y,maxPx,minPx){
    const original=String(value||'').trim().replace(/\s+/g,' ') || '–';
    let label=original,fontPx=maxPx;
    ctx.font='700 '+fontPx+'px Arial, Helvetica, sans-serif';
    while(fontPx>minPx && ctx.measureText(label).width>maxTextWidth){
      fontPx--;
      ctx.font='700 '+fontPx+'px Arial, Helvetica, sans-serif';
    }
    if(ctx.measureText(label).width>maxTextWidth){
      while(label.length>1 && ctx.measureText(label+'…').width>maxTextWidth)label=label.slice(0,-1);
      label+='…';
    }
    ctx.fillText(label,width/2,y);
  }
  fittedText(objectLabel,edge+top/2,compact?36:42,compact?23:26);
  const qrSize=Math.floor(Math.min(width-2*edge,height-2*edge-top-bottom-2*gap));
  if(qrSize<mm(16))throw Error('Etikett für den QR-Code zu klein.');
  const qrTop=edge+top+gap;
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(qrCanvas,Math.floor((width-qrSize)/2),qrTop,qrSize,qrSize);
  fittedText(binCode,height-edge-bottom/2,compact?38:46,compact?26:30);
  return {...spec,widthPx:width,heightPx:height,qrSizePx:qrSize};
}

export function wasteQrLabelPrintHtml(pngData,format='62x40'){
  const size=WASTE_QR_LABEL_FORMATS[format];
  if(!size)throw Error('Unbekanntes Etikettenformat.');
  if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(String(pngData||'')))throw Error('PNG-Etikett fehlt.');
  const {widthMm,heightMm}=size;
  return '<!doctype html><html lang="de"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>Tonnenetikett</title>'+
    '<style>@page{size:'+widthMm+'mm '+heightMm+'mm;margin:0}'+
    '*{box-sizing:border-box}html,body{width:'+widthMm+'mm;height:'+heightMm+'mm;margin:0;padding:0;'+
    'background:#fff;overflow:hidden}img{display:block;width:'+widthMm+'mm;height:'+heightMm+
    'mm;object-fit:contain;print-color-adjust:exact;-webkit-print-color-adjust:exact}</style>'+
    '</head><body><img id="wasteLabelImage" alt="" src="'+pngData+'"></body></html>';
}

export function mountWasteMonitoring(config) {
  const {root, api, organizationId, objects, admin, fixedObjectId='', readOnly=false} = config;
  if (!root || !organizationId) throw Error('Aktiven Mandanten auswählen.');
  let bins = [], scans = [], selected = String(fixedObjectId||''), chosen = '', year = new Date().getFullYear();
  let commissioned = null, busy = false, renderSerial = 0;
  const types = {rest:'Restmüll',paper:'Papier',bio:'Bio',plastic:'Wertstoffe',glass:'Glas',other:'Sonstige'};
  const fmtEuro = value => value == null ? 'nicht hinterlegt' :
    Number(value).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
  const localDate = value => value ? new Date(String(value).slice(0,10)+'T12:00:00').toLocaleDateString('de-DE') : '–';
  const node = (tag, label, css) => {
    const el = document.createElement(tag);
    if (label != null) el.textContent = String(label);
    if (css) el.className = css;
    return el;
  };
  const button = (label, fn, className) => {
    const b = node('button',label,className||'');
    b.type='button';
    b.addEventListener('click',async()=>{
      if (busy) return;
      busy=true; b.disabled=true;
      try {await fn();} catch(e) {message(e.message || String(e),true);}
      finally {busy=false;b.disabled=false;}
    });
    return b;
  };
  const labelInput = (caption, el) => {
    const l=node('label',caption); l.className='waste-field';l.append(el);return l;
  };
  const field = (type,value,placeholder) => {
    const i=node('input'); i.type=type; i.value=value==null?'':value;
    if (placeholder) i.placeholder=placeholder;return i;
  };
  const option = (value,title) => {
    const o=node('option',title);o.value=value;return o;
  };
  const card = () => node('div',null,'waste-card');
  const head = node('div',null,'waste-head');
  head.append(node('h3','Müllmanagement & QR-Erfassung'));
  const banner = node('div',null,'waste-message');banner.setAttribute('role','status');
  const controls = node('div',null,'waste-controls');
  const body = node('div',null,'waste-body');
  root.replaceChildren(head,banner,controls,body);
  function message(value,isError=false){banner.textContent=value;banner.classList.toggle('error',isError);}
  function urlFor(bin){return new URL(window.location.pathname+'?muelltonne='+encodeURIComponent(bin.qr_token),window.location.href).href;}
  const qs = (base,params) => base+'?'+new URLSearchParams(params).toString();
  const read = path => api(path);
  const post = (table,values) => api(table,{method:'POST',headers:{'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(values)});
  const patch = (table,id,values) => api(table+'?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(values)});
  const objectName = id => (objects.find(o=>o.id===id)||{}).name || 'Objekt';
  const eligible = () => objects.filter(o=>
    (!fixedObjectId || String(o.id)===String(fixedObjectId)) &&
    (commissioned === null || commissioned.has(o.id))
  ); // Server-RPC und RLS prüfen Beauftragung sowie Mandanten-/Objektzugriff.
  async function getCommissioned(){
    if (!admin) return;
    const [typesRows,assignments] = await Promise.all([
      read(qs('service_types',{select:'id,name,code,active',organization_id:'eq.'+organizationId})),
      read(qs('object_service_assignments',{select:'object_id,service_type_id,active,valid_from,valid_until',organization_id:'eq.'+organizationId,active:'is.true'}))
    ]);
    const allowedTypes = new Set((typesRows||[]).filter(s=>s.active && /müll|abfall|waste|muell/i.test((s.name||'')+' '+(s.code||''))).map(s=>s.id));
    const today=new Date().toLocaleDateString('sv-SE');
    commissioned=new Set((assignments||[]).filter(a=>allowedTypes.has(a.service_type_id) &&
      (!a.valid_from || a.valid_from<=today) && (!a.valid_until || a.valid_until>=today)).map(a=>a.object_id));
  }
  async function loadBins(){
    bins=(await read(qs('waste_bins',{select:'id,organization_id,object_id,code,waste_type,volume_liters,pickups_per_week,annual_fee_eur,active,qr_token,created_at',organization_id:'eq.'+organizationId,order:'object_id.asc,code.asc'})))||[];
  }
  async function loadScans(){
    scans=[];
    const ids=bins.filter(b=>b.object_id===selected).map(b=>b.id);
    if (!ids.length)return;
    const binFilter='in.('+ids.join(',')+')';
    for(let offset=0;offset<12000;offset+=1000){
      const chunk=await read(qs('waste_bin_scans',{select:'id,bin_id,fill_percent,note,observed_by,observed_at,observed_date',
        bin_id:binFilter,observed_date:'gte.'+year+'-01-01',order:'observed_at.desc',limit:'1000',offset:String(offset)}));
      scans.push(...(chunk||[]));
      if (!chunk || chunk.length<1000) break;
      if(offset===11000) message('Mehr als 12.000 Messwerte: Bitte Auswertung eingrenzen.',true);
    }
  }
  function layout(){
    controls.replaceChildren(); body.replaceChildren();
    if(fixedObjectId){
      // Der Objektname steht bereits im fixierten Modalkopf. Keine redundante zweite Objektkarte.
      if(!eligible().length){
        const info=card();info.append(node('p','Für dieses Objekt ist die Leistung „Abfall / Müllbereitstellung“ nicht aktiv oder nicht freigegeben.'));
        body.append(info);return;
      }
    }else{
      const select=node('select');select.setAttribute('aria-label','Objekt für Müllmanagement');
      select.append(option('','Objekt auswählen'));
      eligible().forEach(o=>select.append(option(o.id,o.name)));
      if(!eligible().some(o=>o.id===selected))selected='';
      select.value=selected;
      select.addEventListener('change',async()=>{
        selected=select.value;chosen='';const serial=++renderSerial;
        message('Lade Müllbehälter …');
        try{await loadScans();if(serial===renderSerial){message('');layout();}}
        catch(e){message('Auswertung fehlgeschlagen: '+e.message,true);}
      });
      controls.append(labelInput('Objekt',select));
    }
    const years=node('select');years.setAttribute('aria-label','Auswertungsjahr');
    for(let y=new Date().getFullYear();y>=2025;y--)years.append(option(String(y),String(y)));
    years.value=String(year);
    years.addEventListener('change',async()=>{
      year=Number(years.value);
      try{await loadScans();layout();}catch(e){message(e.message,true);}
    });
    controls.append(labelInput('Auswertungsjahr',years));
    controls.append(button('Aktualisieren',async()=>{await getCommissioned();await loadBins();await loadScans();layout();}));
    if(!selected){
      const info=card();info.append(node('p',admin && !eligible().length ?
        'Keine aktive Beauftragung „Abfall / Müllbereitstellung“ im gewählten Mandanten vorhanden. Zuerst die Leistung am Objekt hinterlegen.' :
        'Objekt auswählen oder einen individuellen Tonnen-QR-Code scannen. Anmeldung und Objektberechtigung sind erforderlich.'));
      body.append(info);return;
    }
    const relevant=bins.filter(b=>b.object_id===selected);
    if(admin && !readOnly)controls.append(button('+ Mülltonne',()=>editBin(),'waste-create-button'));
    if(!relevant.length){
      const empty=card();empty.append(node('p','Noch keine Mülltonnen für dieses Objekt angelegt.'));
      if(!admin)empty.append(node('p','Bitte die Objektverwaltung um die Anlage der Behälter bitten.'));
      body.append(empty);return;
    }
    if(chosen && !readOnly){
      const b=relevant.find(x=>x.id===chosen);
      if(b && b.active){showCapture(b);return;}
      chosen='';
    }
    body.append(node('h4','Behälter · '+objectName(selected)));
    for(const b of relevant){
      const el=card();el.classList.add('waste-bin');
      const bar=node('div',null,'waste-row');
      const desc=node('div');
      desc.append(node('strong',(types[b.waste_type]||'Abfall')+' · '+b.code));
      desc.append(node('div',b.volume_liters+' Liter'+(b.active?'':' · deaktiviert'),'waste-muted'));
      bar.append(desc);
      if(b.active && !readOnly)bar.append(button('Füllstand erfassen',()=>{chosen=b.id;layout();},'primary'));
      if(admin && !readOnly)bar.append(button('QR / Etikett',()=>showQr(b)));
      if(admin && !readOnly)bar.append(button('Bearbeiten',()=>editBin(b)));
      el.append(bar);body.append(el);
    }
    showReport(relevant);
  }
  function showCapture(bin){
    const wrap=card();
    wrap.append(node('h4',types[bin.waste_type]+' · '+bin.code));
    wrap.append(node('div',objectName(bin.object_id)+' · '+bin.volume_liters+' Liter','waste-muted'));
    wrap.append(node('p','Füllstand unmittelbar vor der Leerung auswählen:'));
    const row=node('div',null,'waste-fill');
    for(const pct of [0,25,50,75,100]){
      const b=button(pct===0?'Leer':pct+' %',async()=>{
        const existing=scans.find(s=>s.bin_id===bin.id && s.observed_date===new Date().toLocaleDateString('sv-SE'));
        if(existing)throw Error('Für diese Tonne wurde heute bereits ein Füllstand erfasst. Keine Doppelbuchung.');
        await post('waste_bin_scans',{bin_id:bin.id,fill_percent:pct,note:note.value.trim()||null});
        chosen='';await loadScans();message('Gespeichert: '+bin.code+' · '+pct+' %. Weiter mit der nächsten Tonne.');layout();
      },'waste-fill-button');
      row.append(b);
    }
    wrap.append(row);
    const note=field('text','','Optional: Auffälligkeit / Fehlbefüllung');note.maxLength=500;
    wrap.append(labelInput('Bemerkung (optional)',note));
    wrap.append(button('Zurück zur Tonnenliste',()=>{chosen='';layout();}));
    body.append(wrap);
  }
  function editBin(bin){
    if(!admin || readOnly)return;
    const existing=!!bin;
    const form=card();form.append(node('h4',existing?'Mülltonne bearbeiten':'Mülltonne anlegen'));
    const code=field('text',bin?.code||'','z. B. RM-001');code.maxLength=32;
    const kind=node('select');Object.entries(types).forEach(([k,v])=>kind.append(option(k,v)));
    kind.value=bin?.waste_type||'rest';
    const volume=field('number',bin?.volume_liters||1100);volume.min=20;volume.max=5000;volume.step=1;
    const pickups=field('number',bin?.pickups_per_week??'1');pickups.min=0.01;pickups.max=14;pickups.step=0.25;
    const fee=field('number',bin?.annual_fee_eur??'');fee.min=0;fee.step=0.01;
    const active=node('input');active.type='checkbox';active.checked=bin?.active!==false;
    for(const [l,v] of [['Kennung *',code],['Abfallart',kind],['Volumen in Liter',volume],['Leerungen pro Woche (optional)',pickups],['Jahresgebühr EUR (optional, Ist-Kosten)',fee],['Behälter aktiv',active]])
      form.append(labelInput(l,v));
    form.append(button('Speichern',async()=>{
      if(!code.value.trim() || !Number.isInteger(Number(volume.value)) || Number(volume.value)<20 || Number(volume.value)>5000)
        throw Error('Kennung und Behältervolumen prüfen.');
      const payload={code:code.value.trim(),waste_type:kind.value,volume_liters:Number(volume.value),
        pickups_per_week:pickups.value===''?null:Number(pickups.value),
        annual_fee_eur:fee.value===''?null:Number(fee.value),active:active.checked};
      if(payload.pickups_per_week!=null && !(payload.pickups_per_week>0 && payload.pickups_per_week<=14))throw Error('Leerungsfrequenz ungültig.');
      if(payload.annual_fee_eur!=null && !(payload.annual_fee_eur>=0))throw Error('Jahresgebühr ungültig.');
      if(existing)await patch('waste_bins',bin.id,payload);
      else await post('waste_bins',{...payload,organization_id:organizationId,object_id:selected});
      await loadBins();chosen='';message('Mülltonne gespeichert.');layout();
    },'primary'));
    form.append(button('Abbrechen',()=>layout()));
    body.replaceChildren(form);
  }
  function showQr(bin){
    const overlay=card();overlay.classList.add('waste-qr-sheet');
    overlay.append(node('h4','Tonnenetikett · '+bin.code));
    const formatSelect=node('select');
    formatSelect.setAttribute('aria-label','Etikettenformat');
    formatSelect.append(option('62x40','62 × 40 mm (empfohlen)'));
    formatSelect.append(option('50x30','50 × 30 mm'));
    formatSelect.value='62x40';
    overlay.append(labelInput('Etikettenformat',formatSelect));
    const qrCanvas=node('canvas'); // Nur Bildquelle: der QR-Code selbst wird nicht verändert.
    const labelCanvas=node('canvas');labelCanvas.className='waste-label-preview';
    labelCanvas.setAttribute('aria-label','Etikett mit Straße, QR-Code und Tonnennummer');
    labelCanvas.style.cssText='display:block;width:100%;max-width:320px;height:auto;margin:14px auto;background:white';
    overlay.append(labelCanvas);
    const object=objects.find(o=>o.id===bin.object_id)||{};
    const objectLabel=String(object.street||object.name||'Objekt').trim();
    let qrReady=false;
    const redraw=()=>{
      if(!qrReady)return;
      drawWasteQrLabel(labelCanvas,qrCanvas,objectLabel,bin.code,formatSelect.value);
    };
    formatSelect.addEventListener('change',redraw);
    const actions=node('div',null,'waste-row');
    actions.append(button('Etikett als PNG',()=>{
      if(!qrReady)throw Error('QR-Code wird noch erstellt.');
      redraw();
      const a=node('a');
      a.download='Tonnenetikett_'+formatSelect.value+'_'+bin.code.replace(/[^a-zA-Z0-9_-]/g,'_')+'.png';
      a.href=labelCanvas.toDataURL('image/png');
      document.body.append(a);a.click();a.remove();
    }));
    actions.append(button('Etikett drucken',()=>{
      if(!qrReady)throw Error('QR-Code wird noch erstellt.');
      redraw();
      const printWindow=window.open('','_blank');
      if(!printWindow)throw Error('Druckfenster blockiert.');
      printWindow.document.write(wasteQrLabelPrintHtml(labelCanvas.toDataURL('image/png'),formatSelect.value));
      printWindow.document.close();
      const image=printWindow.document.getElementById('wasteLabelImage');
      const printNow=()=>window.setTimeout(()=>{printWindow.focus();printWindow.print();},100);
      if(image?.complete)printNow();
      else image?.addEventListener('load',printNow,{once:true});
    }));
    actions.append(button('Link kopieren',()=>navigator.clipboard.writeText(urlFor(bin))));
    actions.append(button('Zurück',()=>layout()));
    overlay.append(actions);body.replaceChildren(overlay);
    if(!window.QRCode || typeof window.QRCode.toCanvas!=='function'){
      message('QR-Bibliothek nicht verfügbar.',true);return;
    }
    window.QRCode.toCanvas(qrCanvas,urlFor(bin),{
      width:512,margin:2,errorCorrectionLevel:'M',color:{dark:'#000000',light:'#ffffff'}
    }).then(()=>{qrReady=true;redraw();})
      .catch(e=>message('QR-Code konnte nicht erzeugt werden: '+e.message,true));
  }
  function safeText(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function summarize(relevant){return summarizeWasteBins(relevant,scans);}
  function showReport(relevant){
    const report=card();report.classList.add('waste-report');
    report.append(node('h4','Jahresauswertung '+year));
    const summary=summarize(relevant);
    const known=summary.filter(s=>s.bin.annual_fee_eur!=null);
    const total=known.reduce((v,s)=>v+Number(s.bin.annual_fee_eur),0);
    const feesComplete=known.length===summary.length;
    const feesLabel=known.length ? 'Ist-Gebühren: '+fmtEuro(total)+(feesComplete?'':' (teilweise erfasst)') : 'Ist-Gebühren nicht hinterlegt';
    report.append(node('p',scans.length+' '+(scans.length===1?'Erfassung':'Erfassungen')+' · '+summary.length+' '+(summary.length===1?'Behälter':'Behälter')+' · '+feesLabel,'waste-muted'));
    const table=node('table',null,'waste-table');
    const hr=node('tr');['Behälter','Messungen','Ø Füllung','P90','Prüfung'].forEach(x=>hr.append(node('th',x)));
    const th=node('thead');th.append(hr);table.append(th);
    const tb=node('tbody');
    summary.forEach(r=>{
      const tr=node('tr');
      [r.bin.code,r.count,r.average==null?'–':Math.round(r.average)+' %',
       r.p90==null?'–':r.p90+' %',
       r.probe?'Kapazität prüfen':r.count<8?'Datenbasis zu klein':'Keine Empfehlung'].forEach(x=>tr.append(node('td',x)));
      tb.append(tr);
    });
    table.append(tb);report.append(table);
    // Mobile Karten statt fünf unlesbarer Tabellenspalten auf dem iPhone.
    const mobile=node('div',null,'waste-report-mobile');
    for(const r of summary){
      const entry=node('div',null,'waste-report-entry');
      entry.append(node('strong',r.bin.code,'waste-report-code'));
      const metrics=node('div',null,'waste-report-metrics');
      for(const [label,value] of [
        ['Messungen',String(r.count)],
        ['Ø Füllstand',r.average==null?'–':Math.round(r.average)+' %'],
        ['P90',r.p90==null?'–':r.p90+' %']
      ]){
        const cell=node('div',null,'waste-report-metric');
        cell.append(node('span',label),node('strong',value));
        metrics.append(cell);
      }
      entry.append(metrics);
      entry.append(node('div',r.probe?'Kapazität prüfen':r.count<8?'Datenbasis zu klein':'Keine Empfehlung','waste-report-verdict'));
      mobile.append(entry);
    }
    report.append(mobile);
    const method=node('details',null,'waste-report-method');
    method.append(node('summary','Erläuterung zur Bewertung'));
    method.append(node('p','P90 ist das 90. Perzentil der beobachteten Füllstände. Ein Prüffall wird erst ab acht Messungen und P90 ≤ 50 % markiert. Vor einer Anpassung sind Spitzen, Reservekapazität, Mindestgrößen, Leerungsintervalle und tatsächliche Gebühren zu prüfen. Keine automatische Einsparzusage.','waste-muted'));
    report.append(method);
    const bar=node('div',null,'waste-row');
    bar.append(button('Jahresdaten CSV',()=>{
      const columns=['Objekt','Tonne','Abfallart','Volumen Liter','Datum','Füllstand %','Mitarbeiter-ID','Bemerkung'];
      const binMap=new Map(relevant.map(b=>[b.id,b]));
      const rows=[columns,...scans.map(s=>{const b=binMap.get(s.bin_id);return [
        objectName(selected),b?.code||'?',types[b?.waste_type]||'?',b?.volume_liters||'',s.observed_date,s.fill_percent,s.observed_by,s.note||''];})];
      const csv='\ufeffsep=;\r\n'+rows.map(r=>r.map(c=>'"'+String(c??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
      const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
      const href=URL.createObjectURL(blob);const a=node('a');a.href=href;a.download='Muellmonitoring_'+year+'.csv';
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);
    }));
    bar.append(button('Jahresbericht drucken / PDF',()=>{
      const html='<!doctype html><html lang="de"><meta charset="utf-8"><title>Müllmanagement Jahresbericht</title>'+
        '<style>body{font:14px Arial;margin:22mm;color:#18283b}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #bbb;text-align:left}h1{font-size:24px}p{line-height:1.5}</style>'+
        '<h1>Duschl Service · Müllmanagement</h1><h2>'+safeText(objectName(selected))+' · '+year+'</h2>'+
        '<p>'+scans.length+' Erfassungen; '+summary.length+' Behälter. '+safeText(feesLabel)+'</p>'+
        '<table><tr><th>Behälter</th><th>Typ</th><th>Volumen</th><th>N</th><th>Ø</th><th>P90</th><th>Bewertung</th></tr>'+
        summary.map(s=>'<tr><td>'+safeText(s.bin.code)+'</td><td>'+safeText(types[s.bin.waste_type])+'</td><td>'+s.bin.volume_liters+
        ' L</td><td>'+s.count+'</td><td>'+(s.average==null?'–':Math.round(s.average)+' %')+'</td><td>'+(s.p90==null?'–':s.p90+' %')+
        '</td><td>'+(s.probe?'Kapazität prüfen':s.count<8?'Datenbasis zu klein':'Keine Empfehlung')+'</td></tr>').join('')+'</table>'+
        '<p><strong>Hinweis:</strong> Füllstände sind Sichtschätzungen vor Leerung. P90 ist der beobachtete 90%-Wert. Die Angaben begründen keine automatische Kündigung oder Einsparzusage. Behälterbedarfe, Spitzenlasten, Satzungen und echte Tarifangebote prüfen.</p></html>';
      const win=window.open('','_blank');if(!win)throw Error('Druckfenster blockiert.');win.document.write(html);win.document.close();win.focus();win.print();
    }));
    report.append(bar);body.append(report);
  }
  async function start(){
    try{
      message('Müllmanagement wird geladen …');
      await Promise.all([getCommissioned(),loadBins()]);
      const urlToken=(new URLSearchParams(window.location.search).get('muelltonne')||'').trim();
      if(urlToken){
        const b=bins.find(x=>x.qr_token===urlToken);
        if(!b){message('QR-Code nicht zugänglich: Mandantenwechsel, Berechtigung oder Beauftragung prüfen.',true);}
        else if(fixedObjectId && String(b.object_id)!==String(fixedObjectId)){
          message('Der QR-Code gehört zu einem anderen Objekt.',true);
        }else {selected=b.object_id;chosen=readOnly?'':b.id;message('QR-Code erkannt: '+b.code);}
      }
      if(!selected && eligible().length===1)selected=eligible()[0].id;
      if(fixedObjectId && String(selected)!==String(fixedObjectId))throw Error('Objektkontext konnte nicht geprüft werden.');
      await loadScans();layout();
    }catch(e){message('Müllmonitoring nicht verfügbar: '+(e.message||String(e)),true);}
  }
  start();
}
