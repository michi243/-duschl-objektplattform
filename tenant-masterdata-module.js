/**
 * Standalone tenant master data administration.
 * Mount inside an authenticated, tenant-authorized administration view:
 *   mountTenantMasterdata({root, supabase, organizationId})
 * Shares the exact same RPC storage as the offer renderer.
 * Never writes to localStorage and never bypasses server-side authorization.
 */
export function mountTenantMasterdata({root,supabase,organizationId}){
  if(!root||!supabase||!organizationId)throw Error('Mandant, Anmeldung und Zielbereich erforderlich');
  const el=(tag,txt='')=>{const node=document.createElement(tag);node.textContent=txt;return node};
  const panel=el('section');panel.className='tenant-masterdata';
  const heading=el('h2','Mandantenstammdaten bearbeiten');
  const state=el('p');state.setAttribute('role','status');
  const form=el('form');
  const fields={};
  let disposed=false,logoData=null,logoPath=null,pendingFile=null;
  const storage=window.dsTenantLogoStorageFor?.(organizationId);
  const groups=[
    ['Unternehmen',[['sender_name','Firmenname / rechtlicher Absender'],['managing_director','Inhaber / Geschäftsführung'],['commercial_register','Handelsregister (sofern vorhanden)']]],
    ['Anschrift & Kontakt',[['sender_street','Straße / Hausnummer'],['sender_postal','PLZ'],['sender_city','Ort'],['sender_phone','Telefon'],['sender_email','E-Mail'],['sender_website','Website']]],
    ['Steuern & Bank',[['tax_number','Steuernummer / USt-IdNr.'],['bank_name','Bank'],['account_holder','Kontoinhaber'],['bank_iban','IBAN'],['bank_bic','BIC']]],
    ['Corporate Design',[['brand_primary','CI-Primärfarbe (#RRGGBB)'],['brand_accent','CI-Akzentfarbe (#RRGGBB)']]],
    ['Angebotstexte',[['intro_text','Einleitung'],['closing_text','Abschlusstext'],['payment_terms','Zahlungsbedingungen']]]
  ];
  for(const [title,list] of groups){
    const section=el('fieldset'),legend=el('legend',title);section.append(legend);
    for(const [key,label] of list){
      const wrapper=el('label',label),input=['intro_text','closing_text','payment_terms'].includes(key)?el('textarea'):el('input');
      input.name=key;input.maxLength=1500;wrapper.append(input);fields[key]=input;section.append(wrapper);
    }
    form.append(section);
  }
  const tax=el('select');for(const [value,label] of [['unspecified','Steuerliche Behandlung noch offen'],['small_business','Kleinunternehmer (§ 19 UStG)'],['standard','Regelbesteuerung']]){
    const option=el('option',label);option.value=value;tax.append(option);
  }
  const taxLabel=el('label','Steuerliche Behandlung');taxLabel.append(tax);form.append(taxLabel);
  const fileLabel=el('label','Firmenlogo (PNG, JPG, WebP – maximal 5 MB; automatische Optimierung)');
  const picker=el('input');picker.type='file';picker.accept='image/png,image/jpeg,image/webp';fileLabel.append(picker);
  const logo=el('img');logo.alt='Gespeichertes Firmenlogo';logo.style.maxWidth='220px';logo.style.maxHeight='110px';
  const removeLogo=el('button','Logo entfernen');removeLogo.type='button';
  const save=el('button','Mandantenstammdaten speichern');save.type='submit';
  form.append(fileLabel,logo,removeLogo,save);panel.append(heading,state,form);root.append(panel);
  const notify=(message)=>{if(!disposed)state.textContent=message};
  const api=async(name,args)=>{const {data,error}=await supabase.rpc(name,args);if(error)throw error;return data};
  const paintLogo=()=>{logo.hidden=!logoData;if(logoData)logo.src=logoData;else logo.removeAttribute('src')};
  function loadValues(data){
    for(const [key,input] of Object.entries(fields))input.value=data?.[key]??(key==='brand_primary'?'#102d41':key==='brand_accent'?'#ccab55':'');
    tax.value=data?.tax_mode||'unspecified';logoPath=data?.logo_path||null;logoData=data?.logo_data||null;pendingFile=null;paintLogo();
    if(logoPath&&storage)storage.imageData(logoPath).then(value=>{if(!disposed&&logoPath===data.logo_path){logoData=value;paintLogo()}}).catch(error=>notify('Logo konnte nicht geladen werden: '+error.message));
  }
  const refresh=async()=>{notify('Lade Stammdaten …');const data=await api('get_sales_document_template_v1',{p_organization_id:organizationId});if(!disposed){loadValues(data);notify('Mandantenstammdaten geladen.')}return data};
  picker.addEventListener('change',async()=>{
    const file=picker.files?.[0];if(!file)return;
    try{
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('PNG, JPG oder WebP bis 5 MB erforderlich.');
      if(!storage)throw Error('Logo-Storage nicht verfügbar.');
      pendingFile=file;
      logoData=URL.createObjectURL(file);
      paintLogo();notify('Logo ausgewählt – bitte speichern.');
    }catch(error){picker.value='';notify(error.message)}
  });
  removeLogo.addEventListener('click',()=>{logoData=null;logoPath=null;pendingFile=null;picker.value='';paintLogo();notify('Logo zur Entfernung vorgemerkt – bitte speichern.')});
  form.addEventListener('submit',async event=>{
    event.preventDefault();save.disabled=true;
    try{
      const payload=Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value.trim()]));
      if(!payload.sender_name)throw Error('Firmenname erforderlich.');
      if(!/^#[a-fA-F0-9]{6}$/.test(payload.brand_primary)||!/^#[a-fA-F0-9]{6}$/.test(payload.brand_accent))throw Error('CI-Farben müssen im Format #RRGGBB sein.');
      payload.tax_mode=tax.value;
      if(pendingFile){logoPath=await storage.upload(pendingFile);pendingFile=null;}
      payload.logo_path=logoPath;payload.logo_data=null;
      const saved=await api('save_sales_document_template_v1',{p_organization_id:organizationId,p_settings:payload});
      if(!disposed){loadValues(saved);notify('Mandantenstammdaten erfolgreich gespeichert.')}
    }catch(error){notify('Speichern fehlgeschlagen: '+(error.message||error))}
    finally{save.disabled=false}
  });
  refresh().catch(e=>notify('Laden fehlgeschlagen: '+e.message));
  return {refresh,destroy:()=>{disposed=true;panel.remove()}};
}
