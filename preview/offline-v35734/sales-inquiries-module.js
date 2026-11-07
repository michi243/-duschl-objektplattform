import {buildSalesOfferPrintHtml} from './sales-offer-document.js?v=3.57.27';
/**
 * Duschl Service – mandantengetrennte Geschäftsanfragen, Angebote und Auftragsübernahme.
 * Alle Zugriffe laufen über autorisierte Supabase-RPCs; keine lokale Ablage von Kundendaten.
 */
export function mountSalesInquiries({root,supabase,organizationId,onChange=()=>{}}){
 if(!root||!organizationId||!supabase)throw Error('Mandant und Anmeldung erforderlich');
 let inquiries=[], objects=[],activeEditor=null,disposed=false,templateCache=null;
 const n=(tag,content='',props={})=>{const e=document.createElement(tag);e.textContent=content;for(const [key,value] of Object.entries(props))e.setAttribute(key,value);return e;};
 const rpc=async(name,args)=>{const {data,error}=await supabase.rpc(name,args);if(error)throw error;return data;};
 const section=n('section');section.className='sales-intake';
 const header=n('div');header.className='row space';header.append(n('h2','Kundenanfragen & Angebote'));
 const add=n('button','+ Anfrage erfassen',{type:'button'});
 const templateButton=n('button','Mandanten bearbeiten',{type:'button'});
 header.append(templateButton,add);
 const summary=n('div');summary.className='muted';
 const bar=n('div');bar.className='sales-toolbar';
 const search=n('input','',{type:'search',placeholder:'Interessent, Leistung oder Adresse suchen','aria-label':'Kundenanfragen durchsuchen'});
 const filter=n('select');[['all','Alle Anfragen'],['open','Offen'],['offer','Angebotsphase'],['due','Wiedervorlage fällig'],['converted','Übernommen'],['lost','Abgelehnt']].forEach(([v,t])=>filter.append(n('option',t,{value:v})));
 bar.append(search,filter);
 const notice=n('div');notice.className='muted';notice.setAttribute('role','status');
 const list=n('div');const editor=n('div');editor.className='sales-editor';editor.hidden=true;
 section.append(header,summary,bar,notice,editor,list);root.append(section);

 const say=s=>{notice.textContent=s;};
 const inlineFeedback=(message,buttonElement)=>{
   // Feedback must remain visible at the action point, including on small screens.
   const previous=editor.querySelector('.sales-inline-feedback');
   if(previous)previous.remove();
   if(!message)return;
   const alert=n('div',message,{role:'alert','aria-live':'assertive'});
   alert.className='sales-inline-feedback';
   Object.assign(alert.style,{background:'rgba(136,39,39,.26)',border:'1px solid #da7777',color:'#ffe5e5',padding:'12px 14px',borderRadius:'10px',margin:'12px 0',fontWeight:'650'});
   if(editor.contains(buttonElement))buttonElement.after(alert);
   else if(!editor.hidden)editor.append(alert);
   else section.append(alert);
   alert.scrollIntoView?.({behavior:'smooth',block:'nearest'});
 };
 const button=(title,fn,confirmText)=>{const b=n('button',title,{type:'button'});b.addEventListener('click',async()=>{
   if(confirmText&&!window.confirm(confirmText))return;
   if(disposed)return;
   const priorLabel=b.textContent;
   b.disabled=true;b.textContent=title==='Anfrage speichern'?'Speichere Anfrage …':title;
   if(editor.contains(b)){const prior=editor.querySelector('.sales-inline-feedback');if(prior)prior.remove();}
   try{await fn();}
   catch(err){
     const message='Speichern / Aktion fehlgeschlagen: '+(err?.message||String(err));
     say(message);inlineFeedback(message,b);
   }
   finally{b.disabled=false;b.textContent=priorLabel;}
 });return b;};
 const field=(title,value='',type='text')=>{const label=n('label',title),input=n('input','',{type});input.value=value??'';label.append(input);return {label,input};};
 const area=(title,value='')=>{const label=n('label',title),input=n('textarea');input.value=value??'';label.append(input);return {label,input};};
 const select=(title,options,current)=>{const label=n('label',title),input=n('select');options.forEach(([v,t])=>input.append(n('option',t,{value:v})));input.value=current??options[0][0];label.append(input);return {label,input};};
 const row=()=>{const d=n('div');d.className='sales-grid';return d;};
 const close=()=>{activeEditor=null;editor.hidden=true;editor.replaceChildren();};
 const euros=v=>Number(v||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
 const date=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('de-DE'):'–';
 const due=q=>q.follow_up_date&&q.follow_up_date<=new Date().toLocaleDateString('en-CA')&&!['converted','lost'].includes(q.status);
 const statusName=s=>({new:'Neu',in_progress:'In Bearbeitung',offer:'Angebotsphase',won:'Angenommen',lost:'Abgelehnt',converted:'Übernommen'})[s]||s;
 function render(){
   list.replaceChildren();
   const today=new Date().toLocaleDateString('en-CA');
   const open=inquiries.filter(q=>!['lost','converted'].includes(q.status));
   const dueCount=open.filter(q=>q.follow_up_date&&q.follow_up_date<=today).length;
   summary.textContent=inquiries.length+' geschäftliche Anfragen · '+open.length+' offen · '+dueCount+' Wiedervorlagen fällig';
   const term=search.value.trim().toLocaleLowerCase('de-DE');
   const visible=inquiries.filter(q=>{
      const ok=filter.value==='all'||filter.value===q.status||(filter.value==='open'&&!['converted','lost'].includes(q.status))||(filter.value==='due'&&due(q));
      return ok&&[q.contact_name,q.company,q.service_category,q.description,q.street,q.city,q.object_name].join(' ').toLocaleLowerCase('de-DE').includes(term);
   });
   if(!visible.length)list.append(n('p','Keine passenden Anfragen.'));
   for(const q of visible){
     const card=n('article');card.className='sales-card';
     const h=n('h3',((q.company?q.company+' · ':'')+(q.contact_name||'Kontakt offen'))+' – '+(q.service_category||'Leistung offen'));card.append(h);
     const object=q.object_id?(q.object_name||'Bestehendes Objekt'):'Noch ohne Objekt';
     card.append(n('p',statusName(q.status)+' · '+object+' · '+date(q.created_at)));
     card.append(n('p',q.description||'Anliegen noch nicht dokumentiert.'));
     if(q.follow_up_date){const d=n('p',(due(q)?'Wiedervorlage fällig: ':'Wiedervorlage: ')+date(q.follow_up_date));if(due(q))d.className='sales-overdue';card.append(d);}
     if(q.phone||q.email)card.append(n('p',[q.phone,q.email].filter(Boolean).join(' · ')));
     if(q.status==='converted')card.append(n('p','Auftrag übernommen'+(q.converted_object_id?' · Objekt-ID: '+q.converted_object_id:' · Einzelauftrag')));
     if(q.status!=='converted'){
       card.append(button('Bearbeiten',()=>editInquiry(q)),button('Angebote',()=>showOffers(q)));
       if(!['lost','won'].includes(q.status))card.append(button('Abgelehnt',async()=>{await rpc('set_sales_inquiry_status_v1',{p_inquiry_id:q.id,p_status:'lost'});await load();},'Anfrage als abgelehnt abschließen?'));
       if(q.status==='lost')card.append(button('Wieder öffnen',async()=>{await rpc('set_sales_inquiry_status_v1',{p_inquiry_id:q.id,p_status:'new'});await load();}));
     }else card.append(button('Details',()=>editInquiry(q)));
     list.append(card);
   }
 }
 function editInquiry(q=null){
   activeEditor=q?.id||'new';editor.replaceChildren();editor.hidden=false;
   editor.append(n('h3',q?'Anfrage bearbeiten':'Neue Anfrage – Telefonannahme'));
   editor.append(n('p','Alle Angaben sind freiwillig. Die Anfrage kann sofort gespeichert und später vervollständigt werden.'));
   const channel=select('Eingang',[['phone','Telefon'],['email','E-Mail'],['website','Website'],['personal','Persönlich'],['other','Sonstige'],['resident','Bewohneranfrage']],q?.channel||'phone');
   const name=field('Ansprechpartner',q?.contact_name);
   const company=field('Firma / WEG',q?.company);
   const phone=field('Telefon',q?.phone,'tel');
   const email=field('E-Mail',q?.email,'email');
   const type=select('Kundengruppe',[['private','Privat'],['weg','WEG'],['business','Gewerbe'],['other','Sonstige']],q?.customer_type||'private');
   const category=field('Leistung',q?.service_category);
   const description=area('Anliegen / gewünschte Arbeiten',q?.description);
   const obj=select('Objektbezug',[['','Ohne Objektbezug'],...objects.map(o=>[o.id,o.name+' · '+[o.street,o.city].filter(Boolean).join(', ')])],q?.object_id||'');
   const street=field('Straße / Hausnummer',q?.street);
   const postal=field('PLZ',q?.postal_code);
   const city=field('Ort',q?.city);
   const desired=field('Gewünschter Termin',q?.desired_date,'date');
   const follow=field('Wiedervorlage / Rückruf',q?.follow_up_date,'date');
   const priority=select('Priorität',[['normal','Normal'],['high','Hoch']],q?.priority||'normal');
   for(const group of [[channel,type,obj],[name,company],[phone,email],[category,priority],[street,postal,city],[desired,follow]]){
     const r=row();group.forEach(x=>r.append(x.label));editor.append(r);
   }
   editor.append(description.label);
   const validate=(data)=>{
     const failures=[];
     // Keine Pflichtfelder: auch ein vollständig leerer Erstkontakt darf als Anfrage gespeichert werden.
     // Nur ausgefüllte Werte auf Format bzw. technische Feldlänge prüfen.
     const checkMax=(value,element,message,max)=>{
       if(String(value||'').length>max)failures.push({element,message});
     };
     checkMax(data.contact_name,name.input,'Ansprechpartner: maximal 120 Zeichen.',120);
     checkMax(data.service_category,category.input,'Leistung: maximal 120 Zeichen.',120);
     checkMax(data.description,description.input,'Anliegen: maximal 3000 Zeichen.',3000);
     if(data.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))failures.push({element:email.input,message:'Die E-Mail-Adresse ist ungültig.'});
     if(data.phone.length>80)failures.push({element:phone.input,message:'Telefonnummer ist zu lang.'});
     if(data.email.length>240)failures.push({element:email.input,message:'E-Mail-Adresse ist zu lang.'});
     if(data.company.length>200)failures.push({element:company.input,message:'Firmenname ist zu lang.'});
     [name.input,category.input,description.input,phone.input,email.input,company.input].forEach(x=>x.removeAttribute('aria-invalid'));
     if(failures.length){
       failures.forEach(x=>x.element.setAttribute('aria-invalid','true'));
       const first=failures[0];
       first.element.focus();
       throw Error(failures.map(x=>x.message).join(' '));
     }
   };
   editor.append(button('Anfrage speichern',async()=>{
      const data={channel:channel.input.value,contact_name:name.input.value.trim(),company:company.input.value.trim(),phone:phone.input.value.trim(),email:email.input.value.trim(),
       customer_type:type.input.value,service_category:category.input.value.trim(),description:description.input.value.trim(),object_id:obj.input.value||null,
       street:street.input.value.trim(),postal_code:postal.input.value.trim(),city:city.input.value.trim(),desired_date:desired.input.value||null,
       follow_up_date:follow.input.value||null,priority:priority.input.value};
      validate(data);
      const savedId=await rpc('save_sales_inquiry_v1',{p_organization_id:organizationId,p_inquiry_id:q?.id||null,p_details:data});
      // Do not erase the editor before the database acknowledged the operation.
      close();
      search.value='';filter.value='all';
      await load();
      say('Anfrage erfolgreich gespeichert · Referenz: '+String(savedId).slice(0,8).toUpperCase());
      list.scrollIntoView?.({behavior:'smooth',block:'start'});
   }),button('Abbrechen',close));
   editor.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
 async function showOffers(q){
   activeEditor=q.id;editor.hidden=false;editor.replaceChildren(n('h3','Angebote – '+(q.contact_name||'Kontakt offen')));
   const offers=await rpc('list_sales_offers_v1',{p_inquiry_id:q.id});
   if(!offers.length)editor.append(n('p','Für diese Anfrage wurde noch kein Angebot erstellt.'));
   for(const offer of offers){
     const card=n('article');card.className='sales-offer';
     card.append(n('strong',offer.offer_number+' · '+offer.title),n('p',euros(offer.gross_amount)+' · '+({draft:'Entwurf',ready:'Freigabebereit',sent:'Versendet',accepted:'Angenommen',rejected:'Abgelehnt',cancelled:'Storniert'}[offer.status]||offer.status)));
     card.append(button('PDF-Vorschau / Drucken',()=>previewOffer(q,offer)));
     if(['draft','ready'].includes(offer.status))card.append(button('Bearbeiten',()=>editOffer(q,offer)));
     if(offer.status==='draft')card.append(button('Zur Freigabe',async()=>{await rpc('set_sales_offer_status_v1',{p_offer_id:offer.id,p_status:'ready'});await showOffers(q);}));
     if(offer.status==='ready')card.append(button('Als versendet markieren',async()=>{await rpc('set_sales_offer_status_v1',{p_offer_id:offer.id,p_status:'sent'});await showOffers(q);},'Angebot wurde tatsächlich versendet? Eine E-Mail wird nicht automatisch verschickt.'));
     if(['ready','sent'].includes(offer.status))card.append(button('Annahme erfassen',async()=>{await rpc('set_sales_offer_status_v1',{p_offer_id:offer.id,p_status:'accepted'});await showOffers(q);await load();},'Liegt eine verbindliche Annahme durch den Kunden vor?'));
     if(['ready','sent'].includes(offer.status))card.append(button('Abgelehnt',async()=>{await rpc('set_sales_offer_status_v1',{p_offer_id:offer.id,p_status:'rejected'});await showOffers(q);},'Angebot als abgelehnt markieren?'));
     if(offer.status==='accepted'){
       card.append(button('Auftrag übernehmen',()=>convertOffer(q,offer)));
     }
     editor.append(card);
   }
   if(!['converted','lost'].includes(q.status))editor.append(button('+ Neues Angebot',()=>editOffer(q,null)));
   editor.append(button('Schließen',close));
 }

 async function getTemplate(){
   if(templateCache)return templateCache;
   const loaded=await rpc('get_sales_document_template_v1',{p_organization_id:organizationId});
   if(!loaded||typeof loaded!=='object')throw Error('Mandantenstammdaten konnten nicht geladen werden.');
   templateCache=loaded;return loaded;
 }
 async function previewOffer(inquiry,offer){
   // A browser popup must be opened synchronously during the user click, before the async RPC.
   const popup=window.open('about:blank','_blank');
   if(!popup)throw Error('Bitte Pop-ups für die Objektplattform erlauben, um die Angebotsvorschau zu öffnen.');
   try{
     popup.document.title='Angebotsvorschau wird erstellt';
     popup.document.body.textContent='Angebotsvorschau wird vorbereitet …';
     const template={...await getTemplate()};
     if(template.logo_path){const storage=window.dsTenantLogoStorageFor?.(organizationId);if(!storage)throw Error('Logo-Storage fehlt.');template.logo_data=await storage.imageData(template.logo_path);}
     const object=inquiry.object_id?objects.find(x=>x.id===inquiry.object_id)||null:null;
     const html=buildSalesOfferPrintHtml({offer,inquiry,template,object});
     popup.document.open();
     popup.document.write(html);
     popup.document.close();
     popup.focus();
     say('Angebotsvorschau geöffnet. Im neuen Fenster „Drucken / als PDF speichern“ wählen. Versand erfolgt manuell.');
   }catch(err){popup.close();throw err;}
 }
 async function editTemplate(){
   activeEditor='template';editor.hidden=false;editor.replaceChildren(n('h3','Mandanten bearbeiten · Stammdaten & Angebotsdesign'));
   editor.append(n('p','Mandantenstammdaten zentral pflegen. Diese Daten, das Logo und die CI-Farben werden automatisch in neuen Angebots-PDFs verwendet. Der Versand erfolgt weiterhin manuell.'));
   const current=await getTemplate();
   if(activeEditor!=='template'||disposed)return;
   const schema=[
     ['sender_name','Firmenname / rechtlicher Absender'],['sender_street','Straße / Hausnummer'],['sender_postal','Postleitzahl'],['sender_city','Ort'],
     ['sender_phone','Telefon'],['sender_email','E-Mail'],['sender_website','Website'],
     ['tax_number','Steuernummer / USt-IdNr.'],['managing_director','Geschäftsführung / Inhaber'],['commercial_register','Handelsregister (sofern vorhanden)'],['bank_name','Bank'],['account_holder','Kontoinhaber'],
     ['bank_iban','IBAN'],['bank_bic','BIC']
   ];
   const fields={};
   const group=row();
   for(const [key,label] of schema){
     const f=field(label,current[key]||'');
     fields[key]=f.input;
     group.append(f.label);
   }
   editor.append(group);
   const colors=row();
   const primary=field('CI Primärfarbe (Hex)',current.brand_primary||'#102d41');
   const accent=field('CI Akzentfarbe (Hex)',current.brand_accent||'#102d41');
   colors.append(primary.label,accent.label);editor.append(n('h4','Corporate Design'),colors);
   const validHex=x=>/^#[0-9a-fA-F]{6}$/.test(x);
   const tax=select('Steuerliche Behandlung',[
     ['unspecified','Noch nicht festgelegt (bei 0 % Prüfhinweis)'],
     ['small_business','Kleinunternehmer gemäß § 19 UStG'],
     ['standard','Regelbesteuerung']
   ],current.tax_mode||'unspecified');
   editor.append(tax.label);
   const texts=[
     ['intro_text','Einleitung'],
     ['closing_text','Abschlusstext'],
     ['payment_terms','Standard-Zahlungsbedingungen']
   ];
   for(const [key,label] of texts){
     const f=area(label,current[key]||'');
     fields[key]=f.input;editor.append(f.label);
   }
   let logoData=current.logo_data||null,logoPath=current.logo_path||null,pendingLogo=null;
   const storage=window.dsTenantLogoStorageFor?.(organizationId);
   if(logoPath&&storage)logoData=await storage.imageData(logoPath);
   const logoBox=n('div');logoBox.className='sales-template-logo';
   const img=n('img','',{alt:'Aktuelles PNG-Firmenlogo'});
   Object.assign(img.style,{maxWidth:'220px',maxHeight:'110px',objectFit:'contain',background:'white',padding:'6px',borderRadius:'7px'});
   const logoLabel=n('label','Logo hochladen · PNG/JPG/WebP bis 5 MB');
   const picker=n('input','',{type:'file',accept:'image/png,image/jpeg,image/webp'});
   logoLabel.append(picker);
   const renderLogo=()=>{img.hidden=!logoData;if(logoData)img.src=logoData;else img.removeAttribute('src');};
   renderLogo();
   picker.addEventListener('change',async()=>{
     try{
       const f=picker.files?.[0];
       if(!f)return;
       if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>5*1024*1024)throw Error('PNG, JPG oder WebP bis 5 MB erforderlich.');
       if(!storage)throw Error('Logo-Storage ist nicht verfügbar.');
       pendingLogo=f;
       const data=URL.createObjectURL(f);
       logoData=data;renderLogo();say('Logo ausgewählt. Zum Übernehmen bitte „Vorlage speichern“ klicken.');
     }catch(err){say('Logo: '+(err.message||err));picker.value='';}
   });
   logoBox.append(logoLabel,img,button('Logo entfernen',()=>{logoData=null;logoPath=null;pendingLogo=null;picker.value='';renderLogo();}));
   editor.append(logoBox);
   editor.append(n('p','Absenderanschrift und steuerliche Angaben vor dem Kundenversand prüfen. Fehlende Empfängerdaten werden im Ausdruck als Prüfhinweis angezeigt.'));
   editor.append(button('Mandantenstammdaten speichern',async()=>{
     if(pendingLogo){logoPath=await storage.upload(pendingLogo);pendingLogo=null;}
     const payload={...Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value.trim()])),
       tax_mode:tax.input.value,logo_data:!logoPath&&/^data:image\/png;base64,/.test(logoData||'')?logoData:null,logo_path:logoPath,brand_primary:primary.input.value.trim(),brand_accent:accent.input.value.trim()};
     if(!validHex(payload.brand_primary)||!validHex(payload.brand_accent))throw Error('CI-Farben müssen im Format #RRGGBB angegeben werden.');
     if(!payload.sender_name)throw Error('Für eine nutzbare Angebotsvorlage ist ein Firmenname erforderlich.');
     const saved=await rpc('save_sales_document_template_v1',{p_organization_id:organizationId,p_settings:payload});
     templateCache=saved;
     close();say('Mandantenstammdaten und Angebotsdesign gespeichert.');
   }),button('Abbrechen',close));
   editor.scrollIntoView?.({behavior:'smooth',block:'start'});
 }
 function editOffer(q,offer=null){
   activeEditor=q.id;editor.hidden=false;editor.replaceChildren(n('h3',offer?'Angebot bearbeiten':'Neues Angebot – '+(q.contact_name||'Kontakt offen')));
   const title=field('Titel *',offer?.title||q.service_category||'Leistungsangebot');
   const suggestedVat=offer?String(offer.vat_rate):(templateCache?.tax_mode==='small_business'?'0':templateCache?.tax_mode==='standard'?'19':'');
   const vat=select('Umsatzsteuer',[['','Bitte Steuerbehandlung auswählen'],['0','0 %'],['7','7 %'],['19','19 %']],suggestedVat);
   const valid=field('Gültig bis',offer?.valid_until,'date');
   const terms=area('Konditionen',offer?.terms);
   const r=row();r.append(title.label,vat.label,valid.label);editor.append(r,terms.label);
   editor.append(n('p','Die Angebotsvorlage bestimmt, ob bei 0 % ein Hinweis auf § 19 UStG ausgegeben wird. Preis- und Steuerangaben vor dem Versand prüfen.'));
   const items=n('div');editor.append(items);
   const total=n('strong','');editor.append(total);
   const rows=[];
   const calc=()=>{let net=0;for(const x of rows){if(!x.container.isConnected)continue;net+=(Number(x.quantity.value)||0)*(Number(x.price.value)||0);}total.textContent=vat.input.value===''?'Netto '+euros(net)+' · Umsatzsteuer noch auswählen':'Netto '+euros(net)+' · Brutto '+euros(net*(1+Number(vat.input.value)/100));};
   const addItem=(item={})=>{
     const c=row();c.className+=' sales-line';
     const d=field('Leistung',item.description||''),qty=field('Menge',item.quantity??1,'number'),price=field('Einzelpreis netto',item.unit_price??0,'number');
     qty.input.min='0.001';qty.input.step='0.001';price.input.min='0';price.input.step='0.01';
     c.append(d.label,qty.label,price.label);
     c.append(button('Entfernen',()=>{c.remove();calc();}));
     items.append(c);rows.push({container:c,description:d.input,quantity:qty.input,price:price.input});
     [qty.input,price.input].forEach(x=>x.addEventListener('input',calc));calc();
   };
   (offer?.items?.length?offer.items:[{description:q.service_category||'Leistungsangebot',quantity:1,unit_price:0}]).forEach(addItem);
   vat.input.addEventListener('change',calc);calc();
   editor.append(button('+ Position',()=>addItem()));
   editor.append(button('Angebot speichern',async()=>{
     const data=rows.filter(x=>x.container.isConnected).map(x=>({description:x.description.value.trim(),quantity:x.quantity.value,unit_price:x.price.value}));
     if(!data.length||data.some(x=>!x.description||Number(x.quantity)<=0||Number(x.unit_price)<0))throw Error('Mindestens eine gültige Angebotsposition erforderlich.');
     if(vat.input.value==='')throw Error('Bitte Umsatzsteuer bzw. steuerliche Behandlung für dieses Angebot auswählen.');
     await rpc('save_sales_offer_v1',{p_inquiry_id:q.id,p_offer_id:offer?.id||null,p_title:title.input.value,p_items:data,p_vat_rate:Number(vat.input.value),p_valid_until:valid.input.value||null,p_terms:terms.input.value});
     say('Angebot gespeichert; kein automatischer Versand.');await showOffers(q);await load();
   }),button('Zurück',()=>showOffers(q)));
 }
 function convertOffer(q,offer){
   editor.hidden=false;editor.replaceChildren(n('h3','Auftragsübernahme – '+offer.offer_number),n('p','Angenommenes Angebot: '+euros(offer.gross_amount)));
   const mode=select('Übernahmeart',[['new_object','Neues Objekt anlegen'],['existing_object','Bestehendem Objekt zuordnen'],['standalone','Einzelauftrag ohne Objekt']],q.object_id?'existing_object':'new_object');
   const obj=select('Bestehendes Objekt',objects.map(o=>[o.id,o.name+' · '+[o.street,o.city].filter(Boolean).join(', ') ]),q.object_id||objects[0]?.id||'');
   const help=n('p');help.className='muted';
   const update=()=>{
     obj.label.hidden=mode.input.value!=='existing_object';
     help.textContent=mode.input.value==='new_object'?'Die in der Anfrage hinterlegte Adresse wird für das neue Objekt verwendet. Bei vorhandener Adresse stoppt die Dublettenprüfung.':
     mode.input.value==='standalone'?'Es wird ein eigenständiger Auftrag gespeichert – kein dauerhaftes Objekt angelegt.':'Der Auftrag wird mit einem vorhandenen Objekt verknüpft.';
   };
   mode.input.addEventListener('change',update);editor.append(mode.label,obj.label,help);update();
   editor.append(button('Verbindlich übernehmen',async()=>{
     const result=await rpc('convert_sales_offer_v1',{p_offer_id:offer.id,p_mode:mode.input.value,p_object_id:mode.input.value==='existing_object'?obj.input.value||null:null});
     close();say('Auftrag übernommen. '+(result.object_id?'Objekt angelegt/zugeordnet: '+result.object_id:'Einzelauftrag gespeichert.')+' Auftrags-ID: '+result.order_id);
     await load();
   },'Das angenommene Angebot wird verbindlich als Auftrag übernommen. Fortfahren?'),button('Zurück',()=>showOffers(q)));
 }
 async function load(){
   if(disposed)return;
   try{
     const [q,o]=await Promise.all([rpc('list_sales_inquiries_v1',{p_organization_id:organizationId}),rpc('list_sales_objects_v1',{p_organization_id:organizationId})]);
     if(disposed)return;
     inquiries=Array.isArray(q)?q:[];objects=Array.isArray(o)?o:[];render();onChange();
   }catch(err){say('Kundenanfragen konnten nicht geladen werden: '+(err.message||err));}
 }
 add.addEventListener('click',()=>editInquiry());
 templateButton.addEventListener('click',()=>editTemplate().catch(err=>{say('Mandantenstammdaten konnten nicht geöffnet werden: '+(err.message||err));inlineFeedback('Angebotsvorlage konnte nicht geladen werden: '+(err.message||err),templateButton);}));
 search.addEventListener('input',render);filter.addEventListener('change',render);
 load();
 return {refresh:load,destroy:()=>{disposed=true;close();section.remove();},openNew:()=>editInquiry()};
}
