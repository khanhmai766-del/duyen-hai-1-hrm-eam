import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageKtktInputs, isShiftInputCoordinator, validateDelegatedChange } from '../../modules/ctktkt/lib/auth/delegation-policy.ts';
import { emptyPositionGrants } from '../../modules/ctktkt/lib/auth/position-permissions.ts';
import { canEditCtktktField, canProposeCtktktCorrection } from '../../modules/ctktkt/lib/ctktkt-permissions.ts';
const user=position=>({id:'fixture',username:'fixture',displayName:'Kiểm thử',position,role:'viewer',permissions:['view_all']});
for(const position of ['Trưởng kíp điện','Trưởng ca']){
 test(position+' can assign operator input without acquiring direct edit',()=>{
  const u=user(position),before=emptyPositionGrants(),next=structuredClone(before);
  assert.equal(canManageKtktInputs(u),true);next.ctktkt_may_nghien_coal_s1=['Máy nghiền'];
  assert.doesNotThrow(()=>validateDelegatedChange(u,before,next));
  assert.equal(canEditCtktktField(u,'Z27'),false);assert.equal(canProposeCtktktCorrection(u,'Z27'),true);
 });
 for(const permission of ['manage_users','manage_permissions','restore_data','backup_data','sync_google_sheet'])test(position+' cannot delegate '+permission,()=>{
  const before=emptyPositionGrants(),next=structuredClone(before);next[permission]=['Máy nghiền'];assert.throws(()=>validateDelegatedChange(user(position),before,next));
 });
 test(position+' cannot assign to self or leadership',()=>{
  for(const target of [position,'Quản đốc','Kỹ thuật viên']){const before=emptyPositionGrants(),next=structuredClone(before);next.ctktkt_tkd_trend=[target];assert.throws(()=>validateDelegatedChange(user(position),before,next));}
 });
}
test('operator cannot manage assignments or propose another group',()=>{
 const u=user('Máy nghiền');assert.equal(isShiftInputCoordinator(u),false);assert.equal(canManageKtktInputs(u),false);assert.equal(canProposeCtktktCorrection(u,'W13'),false);assert.throws(()=>validateDelegatedChange(u,emptyPositionGrants(),emptyPositionGrants()));
});
test('coordinator cannot propose calculated/linked opening NH3',()=>assert.equal(canProposeCtktktCorrection(user('Trưởng ca'),'P73'),false));
