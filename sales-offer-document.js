/**
 * Duschl Service offer print renderer: A4 white paper, browser "Print / Save as PDF".
 * All dynamic fields are HTML-escaped; preview has no remote resources.
 */
export function buildSalesOfferPrintHtml({offer,inquiry,template={},object=null}){
  if(!offer || !inquiry)throw Error('Angebot und Anfrage fehlen.');
  const esc=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const block=x=>esc(x).replace(/\r\n?|\n/g,'<br>');
  const trim=x=>String(x??'').trim();
  const eur=x=>Number(x??0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
  const num=x=>Number(x??0).toLocaleString('de-DE',{maximumFractionDigits:3});
  const date=x=>x?new Date(String(x).slice(0,10)+'T12:00:00').toLocaleDateString('de-DE'):'–';
  const sender=trim(template.sender_name);
  const recipient=trim(inquiry.company)||trim(inquiry.contact_name);
  const logo=typeof template.logo_data==='string' && template.logo_data.length<=280000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(template.logo_data)?template.logo_data:'';
  const warnings=[];
  if(!sender||!trim(template.sender_street)||!trim(template.sender_city))warnings.push('Absenderanschrift vervollständigen');
  if(!recipient)warnings.push('Empfänger ergänzen');
  if(!trim(inquiry.street)||!trim(inquiry.city))warnings.push('Empfängeradresse prüfen');
  if(Number(offer.gross_amount)<=0)warnings.push('Angebotsbetrag prüfen');
  if(Number(offer.vat_rate)===0&&template.tax_mode!=='small_business')warnings.push('Steuerliche Behandlung bei 0 % prüfen');
  const invalidStatus=['draft','cancelled','rejected'].includes(offer.status);
  const draft=invalidStatus || warnings.length>0;
  const status=offer.status==='cancelled'?'STORNIERT':offer.status==='rejected'?'ABGELEHNT':draft?'ENTWURF / PRÜFEN':'ANGEBOT';
  const safeTitle=[trim(offer.offer_number),trim(inquiry.contact_name||inquiry.company)].filter(Boolean).join(' – ').replace(/[^\wäöüÄÖÜß -]/g,'').slice(0,90) || 'Angebot';
  const items=Array.isArray(offer.items)?offer.items:[];
  const rows=items.map((i,ix)=>{
    const qty=Number(i.quantity)||0,price=Number(i.unit_price)||0;
    return '<tr><td class="pos">'+(ix+1)+'</td><td>'+block(i.description)+'</td><td class="right">'+esc(num(qty))+'</td><td class="right">'+esc(eur(price))+'</td><td class="right">'+esc(eur(Math.round(qty*price*100)/100))+'</td></tr>';
  }).join('');
  const addr=([trim(inquiry.company),trim(inquiry.contact_name),trim(inquiry.street),[trim(inquiry.postal_code),trim(inquiry.city)].filter(Boolean).join(' ')]
    .filter(Boolean).map(x=>esc(x)).join('<br>')||'<span class="placeholder">Empfängerangaben fehlen</span>');
  const companyAddress=[trim(template.sender_street),[trim(template.sender_postal),trim(template.sender_city)].filter(Boolean).join(' ')].filter(Boolean).map(esc).join('<br>');
  const senderContact=[template.sender_phone,template.sender_email,template.sender_website].map(trim).filter(Boolean).map(esc).join(' · ');
  const serviceLocation=object?([trim(object.name),trim(object.street),[trim(object.postal_code),trim(object.city)].filter(Boolean).join(' ')].filter(Boolean).join(', ')):'';
  const taxRate=Number(offer.vat_rate)||0;
  const taxAmt=Number(offer.gross_amount||0)-Number(offer.net_amount||0);
  const taxNote=taxRate===0&&template.tax_mode==='small_business'?'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.':'';
  const css='@page{size:A4;margin:16mm 17mm 18mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#e6eaf0;color:#142635;font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;line-height:1.48}body{padding:27px}.toolbar{max-width:210mm;margin:0 auto 16px;background:#0c2436;color:white;padding:13px 20px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;gap:12px}.toolbar button{cursor:pointer;border:0;background:#e1b449;color:#142635;padding:10px 16px;border-radius:7px;font-weight:700}.paper{background:white;max-width:210mm;min-height:297mm;margin:auto;padding:16mm 17mm 18mm;box-shadow:0 5px 28px #a4b0ba55}.letterhead{display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:2px solid #ccab55;padding-bottom:15px}.logo{max-height:76px;max-width:185px;object-fit:contain}.companyname{font-weight:800;letter-spacing:.4px;font-size:20pt;color:#102d41}.senderinfo{font-size:9pt;text-align:right;color:#506270}.kicker{font-size:8pt;color:#6e8290;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:5px}.columns{display:grid;grid-template-columns:1fr 1fr;gap:25px;margin-top:32px;min-height:105px}.address{font-size:10pt}.meta{text-align:right;font-size:9.5pt}.meta div{margin:2px 0}.meta strong{min-width:108px;display:inline-block}.offerheading{margin-top:24px}.offerheading h1{font-size:23pt;font-weight:800;margin:0 0 8px;color:#0d2a3c}.offerheading .subject{font-weight:700;font-size:13pt;margin:0 0 14px}.intro{margin:12px 0 22px;white-space:normal}.caption{font-size:9pt;font-weight:700;color:#496173;margin:16px 0 5px}table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:10px}thead th{background:#102c3e;color:white;text-align:left;font-size:9pt;padding:11px 7px}td{border-bottom:1px solid #dce4ea;padding:10px 7px;vertical-align:top;overflow-wrap:anywhere}.pos{width:7%}.right{text-align:right;white-space:nowrap}th:nth-child(1){width:7%}th:nth-child(2){width:43%}th:nth-child(3){width:10%}th:nth-child(4){width:20%}th:nth-child(5){width:20%}.totals{width:53%;margin:23px 0 22px auto;max-width:100%}.totals div{display:flex;justify-content:space-between;gap:10px;padding:5px 0}.totals .gross{border-top:2px solid #b58a32;margin-top:8px;padding-top:10px;font-size:13pt;font-weight:800}.conditions{margin-top:17px;white-space:normal}.closing{margin-top:27px}.footer{border-top:1px solid #d3dee4;margin-top:38px;padding-top:12px;font-size:8pt;color:#526676;display:flex;justify-content:space-between;gap:20px}.footer .col{max-width:49%;overflow-wrap:anywhere}.warning{border:1px solid #ae7b26;background:#fff6dc;padding:10px 12px;border-radius:5px;font-size:9pt;color:#71470f;margin:15px 0}.stamp{color:#a1662b;letter-spacing:2px;font-weight:700;margin-top:12px}.placeholder{color:#a6652b}.small{font-size:9pt;color:#506270}tr{break-inside:avoid}thead{display:table-header-group}@media print{html,body{background:white;padding:0}.toolbar{display:none!important}.paper{width:auto;min-height:0;box-shadow:none;margin:0;padding:0;max-width:none}@page{size:A4;margin:16mm 17mm 18mm}.letterhead,.totals .gross,thead th{-webkit-print-color-adjust:exact;print-color-adjust:exact}.warning{break-inside:avoid}}';
  return [
  '<!doctype html><html lang="de"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>',esc(safeTitle),'</title><style>',css,'</style></head><body>',
  '<div class="toolbar"><span>Vorschau · DIN A4 · Keine automatische E-Mail</span>',
  '<button type="button" onclick="window.print()">Drucken / als PDF speichern</button></div>',
  '<main class="paper" aria-label="Angebot">',
  '<header class="letterhead"><div>',
  logo?'<img class="logo" alt="Firmenlogo" src="'+esc(logo)+'">':'<div class="companyname">'+esc(sender||'Firmenname fehlt')+'</div>',
  '</div><div class="senderinfo"><strong>',esc(sender),'</strong><br>',companyAddress,
  senderContact?'<br>'+senderContact:'','</div></header>',
  '<div class="columns"><div><div class="kicker">Angebot an</div><div class="address">',addr,
  '</div></div><div class="meta"><div><strong>Angebotsnummer</strong> ',esc(offer.offer_number),'</div>',
  '<div><strong>Datum</strong> ',esc(date(offer.created_at)),'</div>',
  '<div><strong>Gültig bis</strong> ',esc(date(offer.valid_until)),'</div>',
  '</div></div>',
  draft?'<div class="stamp">'+esc(status)+'</div>':'',
  warnings.length?'<div class="warning"><strong>Vor dem Versand ergänzen:</strong> '+warnings.map(esc).join(' · ')+'</div>':'',
  '<section class="offerheading"><h1>Angebot</h1><div class="subject">',esc(offer.title),'</div></section>',
  '<p class="intro">',block(template.intro_text),'</p>',
  serviceLocation?'<p class="small"><strong>Leistungsort:</strong> '+esc(serviceLocation)+'</p>':'',
  '<table><thead><tr><th>Pos.</th><th>Leistungsbeschreibung</th><th class="right">Menge</th><th class="right">Einzelpreis netto</th><th class="right">Gesamt netto</th></tr></thead>',
  '<tbody>',rows,'</tbody></table>',
  '<section class="totals"><div><span>Nettobetrag</span><strong>',esc(eur(offer.net_amount)),'</strong></div>',
  '<div><span>Umsatzsteuer (',esc(num(taxRate)),' %)</span><strong>',esc(eur(taxAmt)),'</strong></div>',
  '<div class="gross"><span>Gesamtbetrag</span><strong>',esc(eur(offer.gross_amount)),'</strong></div></section>',
  taxNote?'<p class="small">'+esc(taxNote)+'</p>':'',
  offer.terms?'<div class="conditions"><div class="caption">Vereinbarte Konditionen</div>'+block(offer.terms)+'</div>':'',
  template.payment_terms?'<div class="conditions"><div class="caption">Zahlungsbedingungen</div>'+block(template.payment_terms)+'</div>':'',
  '<div class="closing">',block(template.closing_text),'<br><br>Mit freundlichen Grüßen<br><strong>',esc(sender),'</strong></div>',
  '<footer class="footer"><div class="col"><strong>',esc(sender),'</strong><br>',companyAddress,
  template.tax_number?'<br>Steuernummer / USt-IdNr.: '+esc(template.tax_number):'','</div>',
  '<div class="col">',
  template.bank_name?esc(template.bank_name)+'<br>':'',
  template.account_holder?esc(template.account_holder)+'<br>':'',
  template.bank_iban?'IBAN: '+esc(template.bank_iban)+'<br>':'',
  template.bank_bic?'BIC: '+esc(template.bank_bic):'',
  '</div></footer></main></body></html>'
  ].join('');
}
