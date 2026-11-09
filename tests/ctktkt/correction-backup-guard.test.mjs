import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
async function restore(kind,role,code){let writes=0;const user={id:'actor',role};const file={tables:{daily_inputs:[{field_code:code}]},checksum:'test'};
 const deps={
 '@/modules/ctktkt/lib/request-origin':{isCtktktSameOrigin:()=>true},
 '@/lib/upload-guard':{inspectUpload:async()=>{}},
 '@/lib/api':{ok:(data,meta)=>Response.json({data,meta:meta??null,error:null}),fail:(error,status=400)=>Response.json({data:null,meta:null,error},{status})},
 '@/modules/ctktkt/lib/auth/server':{requirePermission:async()=>({ok:true,user})},
 '@/modules/ctktkt/lib/data-backup-store':{loadBackupSchemas:async()=>new Map(),readBackupTables:async()=>[],restoreBackup:async()=>{writes++;return 1;}},
 '@/modules/ctktkt/lib/data-backup':{BACKUP_TABLES:[{name:"daily_inputs"}],MAX_BACKUP_BYTES:3000000,validateDataBackup:()=>file,restoreStatements:()=>[]},
 '@/modules/ctktkt/lib/backup-archive':{MAX_ARCHIVE_BYTES:25000000,readBackupArchive:async()=>[file],archiveSummary:()=>({checksum:'test',total:1}),archiveStatements:()=>[]},
 jszip:{default:class{}}
 };
 const path=kind==='json'?'../../modules/ctktkt/server/routes/admin/data-backup/route.ts':'../../modules/ctktkt/server/routes/admin/data-backup/archive/route.ts';const source=readFileSync(new URL(path,import.meta.url),'utf8');const codeJS=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};vm.runInNewContext(codeJS,{exports,require:name=>deps[name]||{},Request,Response,Buffer,File,JSON,URL,FormData});let request;if(kind==='json')request=new Request('http://localhost/test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'restore',mode:'overwrite',confirmed:true,file:{}})});else{const form=new FormData();form.set('file',new File(['fake'],'test.zip'));form.set('action','restore');form.set('mode','overwrite');form.set('confirmed','true');request=new Request('http://localhost/test',{method:'POST',body:form});}const response=await exports.POST(request);return{response,writes};}
for(const kind of ['json','zip']){
 test(kind+' cannot bypass correction workflow with restore_data alone',async()=>{const r=await restore(kind,'technician','KTKT:X16');assert.equal(r.response.status,403);assert.equal(r.writes,0);});
 test(kind+' preserves admin restore',async()=>{const r=await restore(kind,'admin','KTKT:X16');assert.equal(r.response.status,200);assert.equal(r.writes,1);});
 test(kind+' leaves unrelated operating-data restore permission unchanged',async()=>{const r=await restore(kind,'technician','B');assert.equal(r.response.status,200);assert.equal(r.writes,1);});
}
