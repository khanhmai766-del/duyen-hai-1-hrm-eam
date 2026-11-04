import test from 'node:test';
import assert from 'node:assert/strict';
import {mapHostUser} from '../../modules/ctktkt/lib/auth/host-user.ts';
import {DEFAULT_POSITIONS} from '../../modules/ctktkt/lib/auth/default-positions.ts';
import {migrateLegacyPermissions} from '../../modules/ctktkt/lib/auth/permission-migration.ts';
import {defaultPositionGrants,emptyPositionGrants,validatePositionGrants,permissionsForPosition,ctktktPositionKey,positionPermissionOptions,CTKTKT_PERMISSION_GROUPS,POSITION_PERMISSION_IDS} from '../../modules/ctktkt/lib/auth/position-permissions.ts';
import {PERMISSIONS,hasPermission,isAdminUser} from '../../modules/ctktkt/lib/auth/session.ts';
import {canEditCtktktField,canEditCtktktGroup,CTKTKT_GROUP_META} from '../../modules/ctktkt/lib/ctktkt-permissions.ts';
import {canEditWaterField} from '../../modules/ctktkt/lib/water-report/permissions.ts';
import {canEnterChemical,CHEMICAL_CATALOG} from '../../modules/ctktkt/lib/chemical-usage/catalog.ts';
import {CTKTKT_DEFAULT_MATRIX} from '../../modules/ctktkt/permissions.ts';

const host=(position,role='VIEWER')=>({id:'fixture-user',name:'Kiểm thử',position,role});
const access={'ctktkt-access':'read'};
test('25 cương vị × 4 vai trò có quyền nghiệp vụ giống chính sách mặc định nguồn',()=>{
 const grants=defaultPositionGrants();
 for(const policy of DEFAULT_POSITIONS) {
  const original={id:'reference',username:'reference',displayName:'reference',position:policy.position,role:policy.role,permissions:[...policy.permissions]};
  original.permissions=migrateLegacyPermissions(original);
  for(const role of ['VIEWER','TECHNICIAN','SUPERVISOR','MANAGER']) {
   const user=mapHostUser(host(policy.position,role),access,grants);
   for(const permission of PERMISSIONS.filter(p=>p!=='ctktkt_other_fields')) assert.equal(hasPermission(user,permission),hasPermission(original,permission),`${policy.position}/${role}/${permission}`);
   for(const group of Object.keys(CTKTKT_GROUP_META)) assert.equal(canEditCtktktGroup(user,group),canEditCtktktGroup(original,group),`${policy.position}/${group}`);
   assert.equal(canEditCtktktField(user,'UNGROUPED-FIXTURE'),canEditCtktktField(original,'UNGROUPED-FIXTURE'),`${policy.position}/ô ngoài nhóm`);
   for(const group of ['meta','electricity','water_intake','resin_water'])assert.equal(canEditWaterField(user,group),canEditWaterField(original,group),`${policy.position}/${group}`);
   for(const item of CHEMICAL_CATALOG)assert.equal(canEnterChemical(user,item.code),canEnterChemical(original,item.code),`${policy.position}/${item.code}`);
  }
 }
});
test('bỏ toàn bộ cương vị không khôi phục quyền kể cả Quản đốc/Trưởng ca/KTV',()=>{
 const empty=validatePositionGrants(emptyPositionGrants());
 for(const position of ['Quản đốc','Phó Quản đốc','Kỹ thuật viên','Thống kê','Trưởng ca','Trưởng kíp điện']) {
  const user=mapHostUser(host(position,'SUPERVISOR'),access,empty);
  assert.equal(isAdminUser(user),false,position);
  for(const permission of PERMISSIONS.filter(p=>p!=='view_all'))assert.equal(hasPermission(user,permission),false,position+'/'+permission);
 }
});
test('bỏ một nhóm KTKT/nước/hóa chất không bị quyền nhập toàn bộ cấp lại',()=>{
 for(const [id,position,check] of [
  ['ctktkt_tkd_trend','Kỹ thuật viên',u=>canEditCtktktGroup(u,'tkd_trend')],
  ['water_electricity','Trưởng ca',u=>canEditWaterField(u,'electricity')],
  ['chemical_HCL_31','XLN hỗn hợp',u=>canEnterChemical(u,'HCL_31')],
 ]) {
  const grants=defaultPositionGrants();const before=mapHostUser(host(position),access,grants);assert.equal(check(before),true);
  grants[id]=grants[id].filter(p=>p!==position);
  const after=mapHostUser(host(position),access,grants);assert.equal(check(after),false,id);
  assert.ok(after.permissions.length>1);
 }
});
test('sao lưu/nạp/nhật ký/phân quyền là các quyền độc lập, không nâng thành quản trị',()=>{
 const grants=emptyPositionGrants();grants.backup_data=['Máy nghiền'];
 let user=mapHostUser(host('Máy nghiền'),access,grants);
 assert.equal(hasPermission(user,'backup_data'),true);assert.equal(hasPermission(user,'restore_data'),false);assert.equal(hasPermission(user,'manage_permissions'),false);assert.equal(isAdminUser(user),false);
 grants.manage_permissions=['Trợ thủ'];user=mapHostUser(host('Trợ thủ'),access,grants);
 assert.equal(hasPermission(user,'manage_permissions'),true);assert.equal(canEditCtktktGroup(user,'tkd_trend'),false);assert.equal(isAdminUser(user),false);
});
test('đổi cương vị đổi quyền; chuẩn hóa tên và hậu tố tổ máy',()=>{
 const grants=defaultPositionGrants();
 assert.equal(ctktktPositionKey('3. Trưởng kíp điện S1'),ctktktPositionKey('Trưởng kíp điện'));
 assert.ok(permissionsForPosition('TKĐ',grants).includes('ctktkt_tkd_trend'));
 assert.ok(!permissionsForPosition('Máy nghiền',grants).includes('ctktkt_tkd_trend'));
});
test('giám sát/vai trò tùy chỉnh không cấp thêm quyền; RBAC cũ không tác động nghiệp vụ',()=>{
 for(const role of ['SUPERVISOR','MANAGER','CUSTOM_ROLE']) {
  const user=mapHostUser(host('Máy nghiền',role),{...access,'ctktkt:edit_ppa':'full','ctktkt:manage_users':'full'});
  assert.equal(hasPermission(user,'edit_ppa'),false);assert.equal(isAdminUser(user),false);assert.equal(canEditCtktktGroup(user,'may_nghien_coal_s1'),true);
 }
 assert.deepEqual(Object.keys(CTKTKT_DEFAULT_MATRIX),['ctktkt-access']);
});
test('cửa vào RBAC, tài khoản tra cứu và buộc đổi mật khẩu vẫn được chặn',()=>{
 assert.equal(mapHostUser(host('Quản đốc'),{'ctktkt-access':'none'}),null);
 assert.equal(mapHostUser({...host('Quản đốc'),accessMode:'DEFECT_READ_ONLY'},access),null);
 assert.equal(mapHostUser({...host('Quản đốc'),mustChangePassword:true},access),null);
});
test('ADMIN đang bật chế độ quản trị có thể khôi phục khi mọi cương vị bị thu hồi',()=>{
 const user=mapHostUser(host('Máy nghiền','ADMIN'),access,emptyPositionGrants());
 assert.equal(isAdminUser(user),true);assert.equal(hasPermission(user,'manage_permissions'),true);
 const manager=mapHostUser(host('Máy nghiền','MANAGER'),access,emptyPositionGrants());assert.equal(isAdminUser(manager),false);
});
test('kiểm cấu trúc đầy đủ, từ chối khóa lạ và tên cương vị lỗi',()=>{
 assert.throws(()=>validatePositionGrants({}),/đủ/);
 assert.throws(()=>validatePositionGrants({...emptyPositionGrants(),unknown:[]}),/đủ/);
 assert.throws(()=>validatePositionGrants({...emptyPositionGrants(),backup_data:['']}),/không hợp lệ/);
 assert.throws(()=>validatePositionGrants({...emptyPositionGrants(),backup_data:['x'.repeat(121)]}),/không hợp lệ/);
 assert.throws(()=>validatePositionGrants({...emptyPositionGrants(),backup_data:'Quản đốc'}),/không hợp lệ/);
 const value=validatePositionGrants({...emptyPositionGrants(),backup_data:['TKĐ','Trưởng kíp điện']});assert.deepEqual(value.backup_data,['Trưởng kíp điện']);
});
test('cấu hình mặc định độc lập; cương vị đã được cấp không biến mất khỏi bảng chọn',()=>{
 const first=defaultPositionGrants();first.backup_data=[];
 assert.ok(defaultPositionGrants().backup_data.length>0);
 first.backup_data=['Cương vị bổ sung'];const options=positionPermissionOptions(['TKĐ','Trưởng kíp điện'],first);
 assert.equal(options.filter(p=>p==='Trưởng kíp điện').length,1);assert.ok(options.includes('Cương vị bổ sung'));
 assert.deepEqual([...new Set(CTKTKT_PERMISSION_GROUPS.flatMap(g=>g.ids))].sort(),[...POSITION_PERMISSION_IDS].sort());
});
