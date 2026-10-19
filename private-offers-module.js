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
  const heading=el('h2','Private Bewohneranfragen');
  const list=el('div');const editor=el('div');root.replaceChildren(heading,message,list,editor);
  const notify=(m)=>{message.textContent=m;};
  const api=async(name,args)=>{const {data,error}=await supabase.rpc(name,args); if(error)throw error;return data;};
  const action=(label,fn)=>{const b=el('button',label,{type:'button'});b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(err){notify('Fehler: '+(err.message||err));}finally{b.disabled=false;}});return b;};
  const input=(label,value='',type='text')=>{const wrap=el('label',label+' '), e=el('input','',{type});e.value=value;wrap.append(e);return {wrap,e};};
  const textArea=(label,value='')=>{const wrap=el('label',label+' '),e=el('textarea');e.value=value;wrap.append(e);return {wrap,e};};
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
    const vat=input('Umsatzsteuer in %',String(offer?.vat_rate??19),'number');
    const valid=input('Gültig bis',offer?.valid_until||'','date');
    const terms=textArea('Konditionen',offer?.terms||'');
    editor.append(title.wrap,vat.wrap,valid.wrap,terms.wrap);
    const rows=el('div');editor.append(rows);
    const addRow=(item={})=>{
      const line=el('div');const description=input('Leistung',item.description||'');
      const quantity=input('Menge',String(item.quantity??1),'number');
      const price=input('Einzelpreis netto',String(item.unit_price??0),'number');
      quantity.e.step='0.001';quantity.e.min='0.001';price.e.step='0.01';price.e.min='0';
      line.append(description.wrap,quantity.wrap,price.wrap);
      line.append(action('Position entfernen',()=>line.remove()));rows.append(line);
      line.read=()=>({description:description.e.value.trim(),quantity:quantity.e.value,unit_price:price.e.value});
    };
    (offer?.items?.length?offer.items:[{}]).forEach(addRow);
    editor.append(action('Position hinzufügen',()=>addRow()));
    editor.append(action('Entwurf speichern',async()=>{
      const items=Array.from(rows.children).map(e=>e.read());
      await api('save_resident_private_offer_v1',{
        p_inquiry_id:inquiry.id,p_offer_id:offer?.id||null,
        p_title:title.e.value,p_items:items,p_vat_rate:Number(vat.e.value),
        p_valid_until:valid.e.value||null,p_terms:terms.e.value
      });
      notify('Angebot gespeichert. Versand noch nicht freigegeben.');
      await showOffers(inquiry);
    }));
    editor.append(action('Abbrechen',()=>showOffers(inquiry)));
  }
  async function load(){
    notify('Lade Privatanfragen…');
    const inquiries=await api('list_resident_private_inquiries_v1',{p_organization_id:organizationId});
    list.replaceChildren();
    for(const inquiry of inquiries||[]){
      const card=el('article');card.append(el('h3',inquiry.resident_name+' – '+inquiry.service_category));
      card.append(el('p',inquiry.object_name+' · '+new Date(inquiry.created_at).toLocaleDateString('de-DE')));
      card.append(el('p',inquiry.description));
      card.append(action('Angebote öffnen',()=>showOffers(inquiry)));
      list.append(card);
    }
    notify((inquiries||[]).length+' private Anfragen');
  }
  load().catch(err=>notify('Zugriff oder Laden fehlgeschlagen: '+err.message));
  return {refresh:load,destroy:()=>root.replaceChildren()};
}
