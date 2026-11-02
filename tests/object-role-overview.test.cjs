'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const ui=fs.readFileSync(require.resolve('../object-role-overview.js'),'utf8');
const index=fs.readFileSync(require.resolve('../index.html'),'utf8');
new vm.Script(ui,{filename:'object-role-overview.js'});
assert.match(index,/ontoggle="dsLoadObjectRoleOverview\(event,/);
assert.match(index,/object-role-overview\.js\?v=3\.57\.29/);
assert.match(index,/let APP_VERSION='3\.57\.29'/);
assert.match(ui,/canManageUsersUI\(\)/);
assert.match(index,/window\.dsFocusObjectRoleEditorSelection\(\)/,'user administration selects object after async load');
assert.match(ui,/String\(currentOrganizationId\(\)\|\|''\)!==orgId/);

(async()=>{
  let org='org-A',allowed=true,calls=[];
  const users=[
    {organization_id:'org-A',user_id:'staff',full_name:'<script>Anna</script>',email:'anna@example.invalid',active:true,membership_role:'object_manager'},
    {organization_id:'org-A',user_id:'admin',full_name:'Admin',active:true,membership_role:'tenant_admin'},
    {organization_id:'org-B',user_id:'foreign',full_name:'Fremder',active:true,membership_role:'tenant_admin'}
  ];
  const assignments=[
    {user_id:'staff',active:true,object_role:'object_operator'},
    {user_id:'foreign',active:true,object_role:'object_responsible'}
  ];
  const sandbox={
    window:{},console,
    db:{objects:[{id:'obj-1',organizationId:'org-A',externalManaged:false}]},
    currentOrganizationId:()=>org,
    canManageUsersUI:()=>allowed,
    cloudRequest:async(path,options)=>{
      calls.push({path,options});
      if(path==='rpc/get_tenant_users')return users;
      if(path.startsWith('object_user_assignments?'))return assignments;
      throw Error('Unexpected request: '+path);
    },
    roleLabel:r=>r
  };
  vm.createContext(sandbox);
  vm.runInContext(ui,sandbox);
  const host={textContent:'',innerHTML:''},summary={textContent:''};
  const details={open:true,isConnected:true,querySelector:selector=>
    selector==='summary'?summary:selector==='[data-ds-object-roles]'?host:null
  };
  await sandbox.window.dsLoadObjectRoleOverview({currentTarget:details},'obj-1');
  assert.equal(calls.length,2);
  assert.match(calls[1].path,/object_id=eq.obj-1/);
  assert.match(host.innerHTML,/&lt;script&gt;Anna&lt;\/script&gt;/);
  assert.match(host.innerHTML,/Objektbetreuung · operativ/);
  assert.match(host.innerHTML,/Mandantenweiter Zugriff ohne Objektzuweisung \(1\)/);
  assert.doesNotMatch(host.innerHTML,/Fremder/);
  assert.match(summary.textContent,/\(2\)/);
  assert.match(host.innerHTML,/Rollen bearbeiten<\/button>/,'action visible per person');
  assert.match(host.innerHTML,/data-user-id="staff"/);
  assert.match(host.innerHTML,/data-user-id="admin"/);

  // Navigation: richtige Person und eigenes Objekt, Mandantenwechsel blockiert.
  const sections=[];
  sandbox.showSection=id=>sections.push(id);
  sandbox.window.dsOpenObjectRoleEditor({
    dataset:{userId:'staff',objectId:'obj-1',organizationId:'org-A'}
  });
  assert.equal(sections[0],'users');
  assert.equal(sandbox.window.dsPendingObjectRoleEditor.userId,'staff');
  assert.equal(sandbox.window.dsPendingObjectRoleEditor.objectId,'obj-1');
  const focused=[];
  const roleControl={dataset:{objectId:'obj-1'},isConnected:true,
    scrollIntoView:()=>focused.push('scroll'),focus:()=>focused.push('focus')};
  const select={options:[{value:'staff',textContent:'Anna'},{value:'admin',textContent:'Admin'}],value:''};
  const notices=[];
  const editor={querySelectorAll:()=>[roleControl],querySelector:()=>null,prepend:x=>notices.push(x)};
  sandbox.document={
    getElementById:id=>id==='userAdminSelect'?select:id==='userAdminEditor'?editor:null,
    createElement:()=>({setAttribute(){},style:{},textContent:''})
  };
  sandbox.loadUserAdminEditor=()=>{};
  sandbox.setTimeout=fn=>fn();
  sandbox.window.dsFocusObjectRoleEditorSelection();
  assert.equal(select.value,'staff');
  assert.equal(sandbox.window.dsPendingObjectRoleEditor,null);
  assert.deepEqual(focused,['scroll','focus']);
  assert.match(notices[0].textContent,/Berechtigungen speichern/);

  // Navigation fuer Fremdmandanten darf keine zweite Benutzerverwaltung oeffnen.
  const before=sections.length;
  sandbox.window.dsOpenObjectRoleEditor({
    dataset:{userId:'staff',objectId:'obj-1',organizationId:'org-B'}
  });
  assert.equal(sections.length,before);

  allowed=false;calls=[];
  await sandbox.window.dsLoadObjectRoleOverview({currentTarget:details},'obj-1');
  assert.equal(calls.length,0,'Nicht-Admins duerfen keine Personendaten anfordern');

  allowed=true;org='org-B';calls=[];
  await sandbox.window.dsLoadObjectRoleOverview({currentTarget:details},'obj-1');
  assert.equal(calls.length,0,'Objekte anderer Mandanten duerfen nicht abgefragt werden');
  console.log('Object role overview syntax, UI integration and tenant scope gate passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
