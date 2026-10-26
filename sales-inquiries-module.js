/**
 * Duschl Service – mandantengetrennte Geschäftsanfragen, Angebote und Auftragsübernahme.
 * Alle Zugriffe laufen über autorisierte Supabase-RPCs; keine lokale Ablage von Kundendaten.
 */
export function mountSalesInquiries({root,supabase,organizationId,onChange=()=>{}}){
 if(!root||!organizationId||!supabase)throw Error('Mandant und Anmeldung erforderlich');
 let inquiries=[], objects=[],activeEditor=null,disposed=false;
 const n=(tag,content='',props={})=>{const e=document.createElement(tag);e.textContent=content;for(const [key,value] of Object.entries(props))e.setAttribute(key,value);return e;};
 const rpc=async(name,args)=>{const {data,error}=await supabase.rpc(name,args);if(error)throw error;return data;};
 const section=n('section');section.className='sales-intake';
 const header=n('div');header.className='row space';header.append(n('h2','Kundenanfragen & Angebote'));
 const add=n('button','+ Anfrage erfassen',{type:'button'});header.append(add);
 const summary=n('div');summary.className='muted';
 const bar=n('div');bar.className='sales-toolbar';
 const search=n('input','',{type:'search',placeholder:'Interessent, Leistung oder Adresse suchen','aria-label':'Kundenanfragen durchsuchen'});
 const filter=n('select');[['all','Alle Anfragen'],['open','Offen'],['offer','Angebotsphase'],['due','Wiedervorlage fällig'],['converted','Übernommen'],['lost','Abgelehnt']].forEach(([v,t])=>filter.append(n('option',t,{value:v})));
 bar.append(search,filter);
 const notice=n('div');notice.className='muted';notice.setAttribute('role','status');
 const list=n('div');const editor=n('div');editor.className='sales-editor';editor.hidden=true;
 section.append(header,summary,bar,notice,editor,list);root.append(section);
 const say=s=>{notice.textContent=s;};
 const button=(title,fn,confirmText)=>{const b=n('button',title,{type:'button'});b.addEventListener('click',async()=>{
   if(confirmText&&!window.confirm(confirmText))return;
   b.disabled=true;try{await fn();}catch(err){say('Fehler: '+(err.message||err));}finally{b.disabled=false;}
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
     const h=n('h3',((q.company?q.company+' · ':'')+q.contact_name)+' – '+q.service_category);card.append(h);
     const object=q.object_id?(q.object_name||'Bestehendes Objekt'):'Noch ohne Objekt';
     card.append(n('p',statusName(q.status)+' · '+object+' · '+date(q.created_at)));
     card.append(n('p',q.description));
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
   const channel=select('Eingang',[['phone','Telefon'],['email','E-Mail'],['website','Website'],['personal','Persönlich'],['other','Sonstige'],['resident','Bewohneranfrage']],q?.channel||'phone');
   const name=field('Ansprechpartner *',q?.contact_name);
   const company=field('Firma / WEG',q?.company);
   const phone=field('Telefon',q?.phone,'tel');
   const email=field('E-Mail',q?.email,'email');
   const type=select('Kundengruppe',[['private','Privat'],['weg','WEG'],['business','Gewerbe'],['other','Sonstige']],q?.customer_type||'private');
   const category=field('Leistung *',q?.service_category);
   const description=area('Anliegen / gewünschte Arbeiten *',q?.description);
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
   editor.append(button('Anfrage speichern',async()=>{
      const data={channel:channel.input.value,contact_name:name.input.value.trim(),company:company.input.value.trim(),phone:phone.input.value.trim(),email:email.input.value.trim(),
       customer_type:type.input.value,service_category:category.input.value.trim(),description:description.input.value.trim(),object_id:obj.input.value||null,
       street:street.input.value.trim(),postal_code:postal.input.value.trim(),city:city.input.value.trim(),desired_date:desired.input.value||null,
       follow_up_date:follow.input.value||null,priority:priority.input.value};
      if(!data.contact_name||!data.service_category||!data.description||(!data.email&&!data.phone))throw Error('Name, Kontaktmöglichkeit, Leistung und Anliegen sind erforderlich.');
      await rpc('save_sales_inquiry_v1',{p_organization_id:organizationId,p_inquiry_id:q?.id||null,p_details:data});
      close();say('Anfrage gespeichert.');await load();
   }),button('Abbrechen',close));
   editor.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
 async function showOffers(q){
   activeEditor=q.id;editor.hidden=false;editor.replaceChildren(n('h3','Angebote – '+q.contact_name));
   const offers=await rpc('list_sales_offers_v1',{p_inquiry_id:q.id});
   if(!offers.length)editor.append(n('p','Für diese Anfrage wurde noch kein Angebot erstellt.'));
   for(const offer of offers){
     const card=n('article');card.className='sales-offer';
     card.append(n('strong',offer.offer_number+' · '+offer.title),n('p',euros(offer.gross_amount)+' · '+({draft:'Entwurf',ready:'Freigabebereit',sent:'Versendet',accepted:'Angenommen',rejected:'Abgelehnt',cancelled:'Storniert'}[offer.status]||offer.status)));
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
 function editOffer(q,offer=null){
   activeEditor=q.id;editor.hidden=false;editor.replaceChildren(n('h3',offer?'Angebot bearbeiten':'Neues Angebot – '+q.contact_name));
   const title=field('Titel *',offer?.title||q.service_category);
   const vat=select('Umsatzsteuer',[['0','0 % (z. B. § 19 UStG)'],['7','7 %'],['19','19 %']],String(offer?.vat_rate??0));
   const valid=field('Gültig bis',offer?.valid_until,'date');
   const terms=area('Konditionen',offer?.terms);
   const r=row();r.append(title.label,vat.label,valid.label);editor.append(r,terms.label);
   const items=n('div');editor.append(items);
   const total=n('strong','');editor.append(total);
   const rows=[];
   const calc=()=>{let net=0;for(const x of rows){if(!x.container.isConnected)continue;net+=(Number(x.quantity.value)||0)*(Number(x.price.value)||0);}total.textContent='Netto '+euros(net)+' · Brutto '+euros(net*(1+Number(vat.input.value)/100));};
   const addItem=(item={})=>{
     const c=row();c.className+=' sales-line';
     const d=field('Leistung',item.description||''),qty=field('Menge',item.quantity??1,'number'),price=field('Einzelpreis netto',item.unit_price??0,'number');
     qty.input.min='0.001';qty.input.step='0.001';price.input.min='0';price.input.step='0.01';
     c.append(d.label,qty.label,price.label);
     c.append(button('Entfernen',()=>{c.remove();calc();}));
     items.append(c);rows.push({container:c,description:d.input,quantity:qty.input,price:price.input});
     [qty.input,price.input].forEach(x=>x.addEventListener('input',calc));calc();
   };
   (offer?.items?.length?offer.items:[{description:q.service_category,quantity:1,unit_price:0}]).forEach(addItem);
   vat.input.addEventListener('change',calc);calc();
   editor.append(button('+ Position',()=>addItem()));
   editor.append(button('Angebot speichern',async()=>{
     const data=rows.filter(x=>x.container.isConnected).map(x=>({description:x.description.value.trim(),quantity:x.quantity.value,unit_price:x.price.value}));
     if(!data.length||data.some(x=>!x.description||Number(x.quantity)<=0||Number(x.unit_price)<0))throw Error('Mindestens eine gültige Angebotsposition erforderlich.');
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
 search.addEventListener('input',render);filter.addEventListener('change',render);
 load();
 return {refresh:load,destroy:()=>{disposed=true;close();section.remove();},openNew:()=>editInquiry()};
}
