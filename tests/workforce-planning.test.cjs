'use strict';
const assert=require('node:assert/strict');
const {assessAssignment}=require('../workforce-planning.js');
const org='tenant-a',user='staff-a',date='2026-11-02';
const base=()=>({organizationId:org,userId:user,date,startTime:'08:00:00',endTime:'12:00:00',
 relationships:[{organization_id:org,user_id:user,relationship_type:'employee',effective_from:'2026-01-01'}],
 workPatterns:[{organization_id:org,user_id:user,weekday:1,planned_hours:8}],
 absences:[],availabilityBlocks:[],existingAssignments:[],qualifications:[],requiredQualifications:[]});
const codes=r=>r.issues.map(x=>x.code);
assert.equal(assessAssignment(base()).assignable,true);
let p=base();p.absences=[{organization_id:org,user_id:user,starts_on:date,ends_on:date,status:'approved'}];
assert.deepEqual(codes(assessAssignment(p)),['APPROVED_ABSENCE']);
p=base();p.absences=[{organization_id:org,user_id:user,starts_on:date,ends_on:date,status:'pending'}];
assert.equal(assessAssignment(p).assignable,true);
p=base();p.absences=[{organization_id:'tenant-b',user_id:user,starts_on:date,ends_on:date,status:'approved'}];
assert.equal(assessAssignment(p).assignable,true);
p=base();p.availabilityBlocks=[{organization_id:org,user_id:user,starts_at:'2026-11-02T09:00:00',ends_at:'2026-11-02T10:00:00'}];
assert.ok(codes(assessAssignment(p)).includes('UNAVAILABLE'));
p=base();p.requiredQualifications=['winter'];assert.ok(codes(assessAssignment(p)).includes('QUALIFICATION_MISSING'));
p=base();p.workPatterns=[];assert.ok(codes(assessAssignment(p)).includes('WORK_PATTERN_UNKNOWN'));
p=base();p.existingAssignments=[{organization_id:org,user_id:user,assignment_date:date,start_time:'09:00:00',end_time:'11:00:00',status:'planned'}];
assert.ok(codes(assessAssignment(p)).includes('TIME_CONFLICT'));
p=base();p.relationships=[];assert.ok(codes(assessAssignment(p)).includes('NO_ACTIVE_PERSONNEL_RELATIONSHIP'));
console.log('workforce-planning smoke tests passed');
