import {mountSalesInquiries} from './sales-inquiries-module.js?v=3.57.18';

/**
 * Duschl Service – private resident inquiries & offers.
 * Integrate into the authenticated admin workspace:
 *   import { mountPrivateOffers } from './private-offers-module.js';
 *   mountPrivateOffers({ root: document.querySelector('#private-offers'), supabase, organizationId });
 * Requires the existing authenticated Supabase client. Does not create a new login.
 */
export function mountPrivateOffers({root, supabase, organizationId}) {
  if (!root || !supabase || !organizationId) throw new Error('root, supabase and organizationId required');
  const el=(name,text='',attrs={})=>{const e=document.createElement(name);e.textContent=text;for(const [k,v] of Object.entries(attrs)) e.setAttribute(k,v);return e;};
  const message=el('p'); message.setAttribute('role','status');
  const salesRoot=el('div');
  const heading=el('h2','Bestehende private Bewohneranfragen');
  const list=el('div');const editor=el('div');let cached=[];
  const notify=(m)=>{message.textContent=m;};
  const api=async(name,args)=>{const {data,error}=await supabase.rpc(name,args); if(error)throw error;return data;};
  const action=(label,fn)=>{const b=el('button',label,{type:'button'});b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(err){notify('Fehler: '+(err.message||err));}finally{b.disabled=false;}});return b;};
  const input=(label,value='',type='text')=>{const wrap=el('label',label+' '), e=el('input','',{type});e.value=value;wrap.append(e);return {wrap,e};};
  const textArea=(label,value='')=>{const wrap=el('label',label+' '),e=el('textarea');e.value=value;wrap.append(e);return {wrap,e};};
  const filters=el('div');const search=input('Suche');const status=el('select');[['all','Alle'],['new','Neu'],['in_progress','In Bearbeitung'],['closed','Abgeschlossen']].forEach(([v,t])=>status.append(el('option',t,{value:v})));filters.append(search.wrap,status);root.replaceChildren(salesRoot,heading,message,filters,list,editor);
  const salesInstance=mountSalesInquiries({root:salesRoot,supabase,organizationId});
  async function showMessages(inquiry){
    editor.replaceChildren(el('h3','Nachrichten · '+inquiry.resident_name));
    const messages=await api('list_resident_private_messages_v1',{p_inquiry_id:inquiry.id});
    for(const m of messages||[])editor.append(el('p',new Date(m.created_at).toLocaleString('de-DE')+' · '+(m.audience==='resident'?'An Bewohner (intern vorgemerkt)':'An Admin (intern)')+': '+m.body));
    const body=textArea('Nachricht');editor.append(el('p','E-Mail-Adresse des Bewohners: '+(inquiry.resident_email||'nicht hinterlegt')+'. Nachrichten werden derzeit ausschließlich intern dokumentiert.'));const audience=el('select');[['resident','Nachricht an Bewohner'],['admin','Nachricht an Admin']].forEach(([v,t])=>audience.append(el('option',t,{value:v})));
    editor.append(audience,body.wrap,action('Nachricht speichern',async()=>{
      await api('create_resident_private_message_v1',{p_inquiry_id:inquiry.id,p_audience:audience.value,p_body:body.e.value});
      notify(audience.value==='resident'?'Nachricht intern gespeichert – E-Mail-Versand noch nicht aktiv.':'Admin-Nachricht intern gespeichert.');await showMessages(inquiry);
    }));
    editor.append(action('Zurück',()=>editor.replaceChildren()));
  }
  async function showOffers(inquiry){
    editor.replaceChildren(el('h3','Angebote für '+inquiry.resident_name),el('p',inquiry.description));
    const offers=await api('list_resident_private_offers_v1',{p_inquiry_id:inquiry.id});
    const rows=el('div');editor.append(rows);
    for(const offer of offers||[]){
      const line=el('p',offer.offer_number+' – '+offer.title+' – '+offer.gross_amount+' EUR – '+offer.status);
      rows.append(line);
      if(offer.status==='draft'||offer.status==='ready'){
        line.append(action('Bearbeiten',()=>editOffer(inquiry,offer)));
        line.append(action(offer.status==='draft'?'Zur Freigabe vorbereiten':'Als Entwurf zurücksetzen',async()=>{
          await api('set_resident_private_offer_status_v1',{p_offer_id:offer.id,p_status:offer.status==='draft'?'ready':'draft'});
          await showOffers(inquiry);
        }));
      }
    }
    editor.append(action('Neues Angebot',()=>editOffer(inquiry,null)));
  }
  function editOffer(inquiry,offer){
    editor.replaceChildren(el('h3',offer?'Angebot bearbeiten':'Neues Angebot'));
    const title=input('Angebotstitel',offer?.title||'Leistungsangebot');
    const taxWrap=el('label','Steuerliche Behandlung ');const tax=el('select');[['0','Kleinunternehmer (§ 19 UStG) – ohne Umsatzsteuer'],['19','Regelbesteuerung – 19 % Umsatzsteuer'],['7','Regelbesteuerung – 7 % Umsatzsteuer']].forEach(([v,t])=>tax.append(el('option',t,{value:v})));tax.value=String(offer?.vat_rate??0);taxWrap.append(tax);
    const valid=input('Gültig bis',offer?.valid_until||'','date');
    const terms=textArea('Konditionen',offer?.terms||'');
    editor.append(title.wrap,taxWrap,valid.wrap,terms.wrap);
    const rows=el('div');rows.className='po-items';editor.append(rows);const total=el('div');total.className='po-total';editor.append(total);
    const calculate=()=>{const items=[...rows.children].map(e=>e.read());const amount=items.reduce((sum,i)=>sum+(Number(i.quantity)||0)*(Number(i.unit_price)||0),0);const vatAmount=amount*Number(tax.value)/100;total.textContent='Gesamtbetrag: '+(amount+vatAmount).toLocaleString('de-DE',{style:'currency',currency:'EUR'})+(Number(tax.value)===0?' · Keine Umsatzsteuer gemäß § 19 UStG':' · inkl. '+vatAmount.toLocaleString('de-DE',{style:'currency',currency:'EUR'})+' Umsatzsteuer');};tax.addEventListener('change',calculate); 
    const addRow=(item={})=>{
      const line=el('div');line.className='po-item';const description=input('Leistung',item.description||'');
      const quantity=input('Menge',String(item.quantity??1),'number');
      const price=input('Einzelpreis netto',String(item.unit_price??0),'number');
      quantity.e.step='0.001';quantity.e.min='0.001';price.e.step='0.01';price.e.min='0';
      line.append(description.wrap,quantity.wrap,price.wrap);
      line.append(action('Position entfernen',()=>{line.remove();calculate();}));rows.append(line);[description.e,quantity.e,price.e].forEach(e=>e.addEventListener('input',calculate));
      line.read=()=>({description:description.e.value.trim(),quantity:quantity.e.value,unit_price:price.e.value});
    };
    (offer?.items?.length?offer.items:[{}]).forEach(addRow);calculate();
    editor.append(action('Position hinzufügen',()=>addRow()));
    editor.append(action('Entwurf speichern',async()=>{
      const items=Array.from(rows.children).map(e=>e.read());
      await api('save_resident_private_offer_v1',{
        p_inquiry_id:inquiry.id,p_offer_id:offer?.id||null,
        p_title:title.e.value,p_items:items,p_vat_rate:Number(tax.value),
        p_valid_until:valid.e.value||null,p_terms:Number(tax.value)===0?['Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',terms.e.value].filter(Boolean).join('\n'):terms.e.value
      });
      notify('Angebot gespeichert. Versand noch nicht freigegeben.');
      await showOffers(inquiry);
    }));
    editor.append(action('Abbrechen',()=>showOffers(inquiry)));
  }
  function renderList(){
    list.replaceChildren();const query=search.e.value.trim().toLocaleLowerCase('de-DE');
    const filtered=cached.filter(q=>{
      const qStatus=String(q.status||'new').toLowerCase();
      const statusOk=status.value==='all'||(status.value==='new'&&['new','open','received'].includes(qStatus))||(status.value==='closed'&&['closed','completed','rejected','cancelled'].includes(qStatus))||(status.value==='in_progress'&&!['new','open','received','closed','completed','rejected','cancelled'].includes(qStatus));
      return statusOk&&[q.resident_name,q.object_name,q.service_category,q.description].join(' ').toLocaleLowerCase('de-DE').includes(query);
    });
    for(const inquiry of filtered){
      const card=el('article');card.append(el('h3',inquiry.resident_name+' – '+inquiry.service_category));
      card.append(el('p',inquiry.object_name+' · '+new Date(inquiry.created_at).toLocaleDateString('de-DE')+' · '+(inquiry.status||'Neu')));
      card.append(el('p',inquiry.description));
      card.append(action('Angebote öffnen',()=>showOffers(inquiry)),action('Nachrichten',()=>showMessages(inquiry)));
      card.append(action('In Kundenanfragen übernehmen',async()=>{
        const id=await api('import_resident_private_inquiry_v1',{p_resident_inquiry_id:inquiry.id});
        await salesInstance.refresh();notify('Bewohneranfrage und vorhandene Angebote als Geschäftsanfrage übernommen ('+String(id).slice(0,8)+').');
      }));
      list.append(card);
    }
    notify(filtered.length+' von '+cached.length+' Privatanfragen');
  }
  search.e.addEventListener('input',renderList);status.addEventListener('change',renderList);
  async function load(){
    notify('Lade Privatanfragen…');
    cached=await api('list_resident_private_inquiries_v1',{p_organization_id:organizationId})||[];
    const outstanding=cached.filter(q=>!['closed','completed','rejected','cancelled'].includes(String(q.status||'new').toLowerCase())).length;
    const combined=await api('count_open_all_inquiries_v1',{p_organization_id:organizationId});
    if(typeof window.dsPrivateBadgeSet==='function'){window.dsPrivateBadgeSet(Math.max(0,Number(combined)||0));}
    else{const count=document.getElementById('privateOffersNavCount');if(count)count.textContent=String(combined);}
    renderList();
  }
  load().catch(err=>notify('Zugriff oder Laden fehlgeschlagen: '+err.message));
  return {refresh:()=>Promise.all([load(),salesInstance.refresh()]),destroy:()=>{salesInstance.destroy();root.replaceChildren();}};
}
