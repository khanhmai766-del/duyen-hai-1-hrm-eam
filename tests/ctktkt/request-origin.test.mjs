import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isCtktktSameOrigin} from '../../modules/ctktkt/lib/request-origin.ts';
const request=(origin,headers={})=>new Request('http://localhost:3000/api/ctktkt/daily-inputs',{headers:{...(origin===undefined?{}:{origin}),...headers}});
const previous=process.env.NEXT_PUBLIC_APP_URL;
test.after(()=>{if(previous===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=previous;});
test('accept the configured HTTPS public origin behind an internal HTTP proxy',()=>{
 process.env.NEXT_PUBLIC_APP_URL='https://duyenhai1.vn';
 assert.equal(isCtktktSameOrigin(request('https://duyenhai1.vn')),true);
 assert.equal(isCtktktSameOrigin(request('https://duyenhai1.vn'),true),true);
});
test('default public URL works when no explicit URL is configured',()=>{
 delete process.env.NEXT_PUBLIC_APP_URL;
 assert.equal(isCtktktSameOrigin(request('https://duyenhai1.vn')),true);
});
test('direct local same-origin requests still work',()=>{
 assert.equal(isCtktktSameOrigin(request('http://localhost:3000')),true);
});
test('reject foreign, suffix, wrong scheme, port, null and malformed origins',()=>{
 process.env.NEXT_PUBLIC_APP_URL='https://duyenhai1.vn';
 for(const origin of ['https://evil.example','https://duyenhai1.vn.evil.example','http://duyenhai1.vn','https://duyenhai1.vn:444','null','','https://duyenhai1.vn/','https://evil@duyenhai1.vn','https://duyenhai1.vn https://evil.example'])assert.equal(isCtktktSameOrigin(request(origin)),false,origin);
});
test('do not trust spoofed forwarding or Host headers',()=>{
 process.env.NEXT_PUBLIC_APP_URL='https://duyenhai1.vn';
 assert.equal(isCtktktSameOrigin(request('https://evil.example',{'x-forwarded-host':'evil.example','x-forwarded-proto':'https',host:'evil.example'})),false);
});
test('preserve endpoints which require an Origin header',()=>{
 assert.equal(isCtktktSameOrigin(request(undefined)),true);
 assert.equal(isCtktktSameOrigin(request(undefined),true),false);
});
test('honor an explicit different deployment URL without adding the default host',()=>{
 process.env.NEXT_PUBLIC_APP_URL='https://test.example/';
 assert.equal(isCtktktSameOrigin(request('https://test.example')),true);
 assert.equal(isCtktktSameOrigin(request('https://duyenhai1.vn')),false);
});
test('invalid configured URLs fail closed for public origins',()=>{
 for(const value of ['invalid','file:///tmp/app','https://user:pass@duyenhai1.vn']){
  process.env.NEXT_PUBLIC_APP_URL=value;
  assert.equal(isCtktktSameOrigin(request('https://duyenhai1.vn')),false);
 }
});
test('all duplicated KTKT guards use the same public-origin policy',()=>{
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
 const files=[path.join(root,'modules/ctktkt/server/ktkt-route.ts'),...walk(path.join(root,'modules/ctktkt/server/routes')).filter(f=>f.endsWith('.ts'))];
 let guarded=0;
 for(const file of files){const source=readFileSync(file,'utf8');if(source.includes('Nguồn yêu cầu không hợp lệ.')){
  assert.ok(source.includes('isCtktktSameOrigin(request'),file);guarded++;
  assert.ok(!/origin\s*!==\s*new URL\(request.url\).origin/.test(source),file);
 }}
 // 17 từ 09/11/2026: đã xoá measurements và bcsx-sync (không nơi nào gọi).
 assert.equal(guarded,17);
});
