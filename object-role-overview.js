/* Duschl Service · Objektplattform 3.57.29
 * Personen und Rollen in eigenen Objekten (nur Mandanten-/Plattformadministration).
 * Lesende Übersicht; Rollenaenderung ausschliesslich ueber bestehende Benutzerverwaltung.
 */
(function(){
  'use strict';
  const OBJECT_ROLE_NAMES={
    object_responsible:'Objektverantwortung',
    object_deputy:'Objektvertretung',
    object_operator:'Objektbetreuung · operativ'
  };
  const TENANT_WIDE_ROLES=new Set(['tenant_admin','admin_delegate']);
  const escapeHtml=value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  function localIsoDate(){
    const d=new Date();
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  }
  function assignmentStatus(user,assignment,today){
    const tenantWide=TENANT_WIDE_ROLES.has(String(user.membership_role||''));
    if(user.active===false)return 'Benutzer inaktiv';
    if(assignment.active===false)return tenantWide?'Objektzuweisung inaktiv · mandantenweiter Zugriff':'Objektzuweisung inaktiv';
    if(assignment.valid_from && String(assignment.valid_from).slice(0,10)>today)
      return tenantWide?'Objektrolle erst künftig gültig · mandantenweiter Zugriff':'Gültig ab '+String(assignment.valid_from).slice(0,10);
    if(assignment.valid_until && String(assignment.valid_until).slice(0,10)<today)
      return tenantWide?'Objektrolle abgelaufen · mandantenweiter Zugriff':'Abgelaufen am '+String(assignment.valid_until).slice(0,10);
    return tenantWide?'Aktiv · mandantenweiter Zugriff':'Aktiv';
  }
  function personRow(user,assignment,today,objectId,organizationId){
    const name=String(user.full_name||user.email||'Benutzer ohne Anzeigenamen');
    const role=typeof roleLabel==='function'?roleLabel(user.membership_role):user.membership_role||'Nicht festgelegt';
    const objectRole=assignment
      ?(OBJECT_ROLE_NAMES[String(assignment.object_role||'')]||'Keine Objektrolle (prüfen)')
      :'Keine Objektrolle (mandantenweite Berechtigung)';
    const status=assignment?assignmentStatus(user,assignment,today):(user.active===false?'Benutzer inaktiv':'Aktiv · mandantenweiter Zugriff');
    return '<div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.10);display:flex;gap:14px;justify-content:space-between;flex-wrap:wrap">'+
      '<div style="min-width:170px"><strong>'+escapeHtml(name)+'</strong>'+
      (user.full_name&&user.email?'<div class="muted">'+escapeHtml(user.email)+'</div>':'')+'</div>'+
      '<div style="display:grid;gap:3px;min-width:230px">'+
      '<div><strong>Mandantenrolle:</strong> '+escapeHtml(role)+'</div>'+
      '<div><strong>Objektrolle:</strong> '+escapeHtml(objectRole)+'</div>'+
      '<div class="muted"><strong>Status:</strong> '+escapeHtml(status)+'</div>'+
      '<div style="margin-top:9px"><button type="button" data-user-id="'+escapeHtml(user.user_id)+'" data-object-id="'+escapeHtml(objectId)+'" data-organization-id="'+escapeHtml(organizationId)+'" onclick="dsOpenObjectRoleEditor(this)">Rollen bearbeiten</button></div>'+
      '</div></div>';
  }
  // Eine Person im bestehenden Rollen-Editor vorauswaehlen. Keine Rollenmutation in der Objektansicht.
  window.dsOpenObjectRoleEditor=function(button){
    if(typeof canManageUsersUI!=='function'||!canManageUsersUI())return;
    const userId=String(button?.dataset?.userId||'');
    const objectId=String(button?.dataset?.objectId||'');
    const orgId=String(button?.dataset?.organizationId||'');
    const sameTenant=orgId && orgId===String(currentOrganizationId()||'');
    const ownObject=sameTenant && (db.objects||[]).some(o=>
      String(o.id)===objectId && !o.externalManaged && String(o.organizationId||'')===orgId
    );
    if(!userId||!objectId||!ownObject)return;
    if(typeof showSection!=='function')return;
    window.dsPendingObjectRoleEditor={userId,objectId,orgId};
    showSection('users'); // laedt die Benutzerverwaltung serverseitig und ruft den Fokus-Hook auf
  };

  window.dsFocusObjectRoleEditorSelection=function(){
    const pending=window.dsPendingObjectRoleEditor;
    if(!pending)return;
    window.dsPendingObjectRoleEditor=null;
    if(!canManageUsersUI()||String(currentOrganizationId()||'')!==pending.orgId)return;
    const sel=document.getElementById('userAdminSelect');
    const ed=document.getElementById('userAdminEditor');
    if(!sel||!ed)return;
    const candidate=[...sel.options].find(o=>o.value===pending.userId);
    if(!candidate){
      console.warn('Rollenbearbeitung: Benutzer im aktiven Mandanten nicht gefunden.');
      return;
    }
    sel.value=pending.userId;
    if(typeof loadUserAdminEditor==='function')loadUserAdminEditor();

    const controls=[...ed.querySelectorAll('.userObjectRole')];
    const roleControl=controls.find(el=>String(el.dataset.objectId||'')===pending.objectId);
    const mandantControl=ed.querySelector('#userAdminRole');
    const object=(db.objects||[]).find(o=>String(o.id)===pending.objectId);
    const notice=document.createElement('div');
    notice.setAttribute('role','status');
    notice.style.cssText='padding:10px 12px;margin-bottom:12px;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.05)';
    notice.textContent='Rollenbearbeitung: '+String(object?.name||'Objekt')+
      ' · '+String(candidate.textContent||'Benutzer')+
      '. Objektrolle und Mandantenrolle sind getrennt. Änderungen mit „Berechtigungen speichern“ bestätigen.';
    ed.prepend(notice);
    const target=roleControl||mandantControl;
    if(target){
      setTimeout(()=>{
        if(String(currentOrganizationId()||'')!==pending.orgId||sel.value!==pending.userId||!target.isConnected)return;
        target.scrollIntoView({block:'center',behavior:'smooth'});
        target.focus({preventScroll:true});
      },0);
    }
  };

  window.dsLoadObjectRoleOverview=async function(event,objectId){
    const details=event&&event.currentTarget;
    if(!details||!details.open)return;
    const host=details.querySelector('[data-ds-object-roles]');
    if(!host)return;
    if(typeof canManageUsersUI!=='function'||!canManageUsersUI()){
      host.textContent='Keine Berechtigung zur Einsicht in Benutzer- und Objektrollen.';
      return;
    }
    const orgId=String(currentOrganizationId()||'');
    const oid=String(objectId||'');
    const isOwn=(db.objects||[]).some(o=>
      String(o.id)===oid && !o.externalManaged && String(o.organizationId||'')===orgId
    );
    if(!orgId||!oid||!isOwn){
      host.textContent='Dieses Objekt gehört nicht zum aktuell verwalteten Mandanten.';
      return;
    }
    host.textContent='Personen und Objektrollen werden aktualisiert …';
    try{
      const [rawUsers,rawAssignments]=await Promise.all([
        cloudRequest('rpc/get_tenant_users',{
          method:'POST',body:JSON.stringify({p_organization_id:orgId})
        }),
        cloudRequest('object_user_assignments?select=user_id,active,object_role,valid_from,valid_until&object_id=eq.'+encodeURIComponent(oid))
      ]);
      // Kein stale-data-Leak bei Mandantenwechsel oder erneutem Rendern der Objektliste.
      if(!details.isConnected||!details.open||String(currentOrganizationId()||'')!==orgId)return;
      const users=(Array.isArray(rawUsers)?rawUsers:[])
        .filter(u=>String(u.organization_id||'')===orgId);
      const byUser=new Map(users.map(u=>[String(u.user_id||''),u]));
      const assignments=new Map();
      let unassignedTenantUsers=0;
      for(const a of (Array.isArray(rawAssignments)?rawAssignments:[])){
        const uid=String(a.user_id||'');
        if(!byUser.has(uid)){unassignedTenantUsers++;continue;}
        const old=assignments.get(uid);
        if(!old || (old.active===false && a.active!==false))assignments.set(uid,a);
      }
      const direct=[...assignments.entries()]
        .map(([uid,a])=>({user:byUser.get(uid),assignment:a}))
        .sort((a,b)=>String(a.user.full_name||a.user.email||'').localeCompare(String(b.user.full_name||b.user.email||''),'de'));
      const inherited=users
        .filter(u=>TENANT_WIDE_ROLES.has(String(u.membership_role||''))&&!assignments.has(String(u.user_id||'')))
        .sort((a,b)=>String(a.full_name||a.email||'').localeCompare(String(b.full_name||b.email||''),'de'));
      const today=localIsoDate();
      let html='<p class="muted" style="margin:0 0 8px">Objektzuweisungen und Mandantenrollen sind getrennte Berechtigungen. Mandanten-Admins und Admin-Vertretungen haben auch ohne Objektrolle Zugriff.</p>';
      html+='<div style="font-weight:750;margin-top:12px">Direkte Objektzuweisungen ('+direct.length+')</div>';
      html+=direct.length
        ?direct.map(x=>personRow(x.user,x.assignment,today,oid,orgId)).join('')
        :'<div class="muted" style="margin-top:8px">Keine personenbezogene Objektrolle vergeben.</div>';
      html+='<div style="font-weight:750;margin-top:16px">Mandantenweiter Zugriff ohne Objektzuweisung ('+inherited.length+')</div>';
      html+=inherited.length
        ?inherited.map(u=>personRow(u,null,today,oid,orgId)).join('')
        :'<div class="muted" style="margin-top:8px">Keine weiteren mandantenweit berechtigten Personen.</div>';
      if(unassignedTenantUsers)html+='<p class="muted">Hinweis: '+unassignedTenantUsers+' Objektzuordnung(en) ohne lesbare Mandantenzugehörigkeit. Berechtigungen in der Benutzerverwaltung prüfen.</p>';
      html+='<p class="muted" style="margin:12px 0 0">Änderungen erfolgen ausschließlich in der Benutzerverwaltung. Plattformadministratoren ohne Mandantenmitgliedschaft sind hier nicht aufgeführt.</p>';
      host.innerHTML=html;
      const summary=details.querySelector('summary');
      if(summary)summary.textContent='Personen & Rollen ('+(direct.length+inherited.length)+')';
    }catch(error){
      if(!details.isConnected||String(currentOrganizationId()||'')!==orgId)return;
      console.warn('Objekt-Personen/Rollen konnten nicht geladen werden',error);
      host.textContent='Personen und Rollen konnten nicht geladen werden. Bitte erneut aufklappen oder die Berechtigungen prüfen.';
    }
  };
})();
