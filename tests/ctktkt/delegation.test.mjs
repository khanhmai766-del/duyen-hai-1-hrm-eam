import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageKtktInputs, isShiftInputCoordinator, validateDelegatedChange } from '../../modules/ctktkt/lib/auth/delegation-policy.ts';
import { emptyPositionGrants } from '../../modules/ctktkt/lib/auth/position-permissions.ts';
import { canEditCtktktField, canProposeCtktktCorrection } from '../../modules/ctktkt/lib/ctktkt-permissions.ts';
import { mapHostUser } from '../../modules/ctktkt/lib/auth/host-user.ts';
const user=(position,canDelegateInputs=['Trưởng kíp điện','Trưởng ca'].includes(position))=>({id:'fixture',username:'fixture',displayName:'Kiểm thử',position,role:'viewer',permissions:['view_all'],canDelegateInputs});
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

test('quyền phân công theo từng tài khoản (RBAC ctktkt-delegate), không theo cương vị',()=>{
 const host=(position,level,role='VIEWER')=>mapHostUser({id:'u',role,position},{'ctktkt-access':'read',...(level?{'ctktkt-delegate':level}:{})});
 assert.equal(canManageKtktInputs(host('Trưởng kíp điện')),false); // TKĐ chưa được cấp (vd Nguyễn Hữu Trung Nhân)
 assert.equal(canManageKtktInputs(host('Trưởng kíp điện','manage')),true);
 assert.equal(canManageKtktInputs(host('Kỹ thuật viên','read')),true); // KTV được chỉ định
 assert.equal(canManageKtktInputs(host('Kỹ thuật viên','none')),false);
 assert.equal(canManageKtktInputs(host('Kỹ thuật viên',null,'ADMIN')),true);
 // KTV được giao vẫn chỉ phân công được cho cương vị VHV
 const ktv=host('Kỹ thuật viên','manage'),before=emptyPositionGrants(),ok=structuredClone(before),bad=structuredClone(before);
 ok.ctktkt_may_nghien_coal_s1=['Máy nghiền'];bad.manage_permissions=['Máy nghiền'];
 assert.doesNotThrow(()=>validateDelegatedChange(ktv,before,ok));assert.throws(()=>validateDelegatedChange(ktv,before,bad));
 // Đề nghị sửa số liệu vẫn theo cương vị như cũ
 assert.equal(isShiftInputCoordinator(host('Trưởng ca')),true);assert.equal(isShiftInputCoordinator(ktv),false);
});
