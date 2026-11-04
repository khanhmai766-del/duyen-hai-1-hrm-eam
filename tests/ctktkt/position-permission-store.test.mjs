import test from 'node:test';
import assert from 'node:assert/strict';
import {readPositionPermissionConfig,savePositionPermissionConfig,PositionPermissionConflict,CTKTKT_POSITION_CONFIG_KEY} from '../../modules/ctktkt/lib/auth/position-permission-store.ts';
import {emptyPositionGrants,defaultPositionGrants} from '../../modules/ctktkt/lib/auth/position-permissions.ts';

function store(initial=null) {
 let value=initial,writes=0;
 return {
  db:{$queryRawUnsafe:async(sql,...args)=>{
   assert.equal(args[0],CTKTKT_POSITION_CONFIG_KEY);
   if(sql.startsWith('SELECT'))return value===null?[]:[{value,updatedAt:new Date('2026-11-05T00:00:00Z')}];
   assert.match(sql,/WHERE "RbacConfig"\.value = \$4/);
   const [,next,,expected]=args;
   if(value===null||value===expected){value=next;writes++;return [{value}];}
   return [];
  }},
  get value(){return value;},get writes(){return writes;},
 };
}
test('đọc lần đầu dùng mặc định nhưng không tự ghi cấu hình',async()=>{
 const fixture=store();const loaded=await readPositionPermissionConfig(fixture.db);
 assert.equal(loaded.config.version,0);assert.deepEqual(loaded.config.grants,defaultPositionGrants());assert.equal(fixture.value,null);assert.equal(fixture.writes,0);
});
test('cấu hình trống được lưu và đọc nguyên trạng, không quay về mặc định',async()=>{
 const fixture=store();const saved=await savePositionPermissionConfig(emptyPositionGrants(),0,'actor',fixture.db);
 assert.equal(saved.config.version,1);assert.equal(fixture.writes,1);
 const loaded=await readPositionPermissionConfig(fixture.db);assert.deepEqual(loaded.config.grants,emptyPositionGrants());assert.equal(loaded.config.version,1);
});
test('hai người cùng mở phiên bản 0: chỉ một người lưu được, người kia nhận xung đột',async()=>{
 const fixture=store();const grants=emptyPositionGrants();grants.backup_data=['Máy nghiền'];
 const results=await Promise.allSettled([savePositionPermissionConfig(grants,0,'first',fixture.db),savePositionPermissionConfig(defaultPositionGrants(),0,'second',fixture.db)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const failure=results.find(r=>r.status==='rejected');assert.ok(failure.reason instanceof PositionPermissionConflict);assert.equal(fixture.writes,1);
});
test('phiên bản cũ không ghi đè được, đọc mới rồi lưu tăng đúng phiên bản',async()=>{
 const fixture=store();await savePositionPermissionConfig(emptyPositionGrants(),0,'first',fixture.db);
 await assert.rejects(()=>savePositionPermissionConfig(defaultPositionGrants(),0,'second',fixture.db),PositionPermissionConflict);
 const saved=await savePositionPermissionConfig(defaultPositionGrants(),1,'second',fixture.db);assert.equal(saved.config.version,2);assert.equal(fixture.writes,2);
});
test('cấu hình hỏng không được âm thầm thay bằng quyền mặc định',async()=>{
 for(const value of ['not-json',JSON.stringify({schemaVersion:1,version:1,grants:{}}),JSON.stringify({schemaVersion:99,version:1,grants:defaultPositionGrants()})]) {
  const fixture=store(value);await assert.rejects(()=>readPositionPermissionConfig(fixture.db),/không hợp lệ/);assert.equal(fixture.writes,0);
 }
});
