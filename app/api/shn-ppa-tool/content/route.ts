import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const BRIDGE = `<script>
(function(){
  var memory = {};
  window.__shnStorage = {
    getItem: function(k){ return Object.prototype.hasOwnProperty.call(memory,k) ? memory[k] : null; },
    setItem: function(k,v){ memory[k]=String(v); }, removeItem: function(k){ delete memory[k]; }
  };
  var nativeFetch = window.fetch.bind(window);
  window.fetch = async function(input, init){
    var method = String((init&&init.method)||'GET').toUpperCase();
    var body = null; try{body=init&&init.body ? JSON.parse(String(init.body)) : null;}catch(e){}
    var response;
    try{ response = await nativeFetch(input, init); }
    catch(networkError){
      if(method==='POST' && body && Array.isArray(body.days)){
        window.parent.postMessage({type:'SHN_PPA_SYNC_RESULT',days:body.days,result:null,error:String(networkError&&networkError.message||networkError)},'*');
      }
      throw networkError;
    }
    try {
      if (method==='POST' && body && Array.isArray(body.days)) {
        response.clone().text().then(function(text){
          var result=null; try{result=JSON.parse(text);}catch(e){}
          var files=Array.from(document.querySelectorAll('.filelist .f span:first-child')).map(function(el){return el.textContent||'';}).filter(Boolean);
          var value=function(id){var el=document.getElementById(id);return el?Number(el.value)||null:null;};
          window.parent.postMessage({type:'SHN_PPA_SYNC_RESULT',days:body.days,result:result,error:result?null:text.slice(0,300),fileNames:files,month:value('month'),year:value('year'),dayFrom:value('dayFrom'),dayTo:value('dayTo')},'*');
        });
      }
    } catch(e) {}
    return response;
  };
  function sendHeight(){
    window.parent.postMessage({type:'SHN_PPA_HEIGHT',height:Math.min(12000,Math.max(700,document.documentElement.scrollHeight))},'*');
  }
  addEventListener('message',function(event){
    if(!event.data || event.data.type!=='SHN_PPA_REQUEST_SNAPSHOT') return;
    try{
      var value=function(id){var el=document.getElementById(id);return el?Number(el.value)||null:null;};
      var month=value('month'), year=value('year');
      var days=typeof window.buildPayload==='function' ? window.buildPayload(month,year) : [];
      var files=Array.from(document.querySelectorAll('.filelist .f span:first-child')).map(function(el){return el.textContent||'';}).filter(Boolean);
      window.parent.postMessage({type:'SHN_PPA_SNAPSHOT',days:days,fileNames:files,month:month,year:year,dayFrom:value('dayFrom'),dayTo:value('dayTo')},'*');
    }catch(error){
      window.parent.postMessage({type:'SHN_PPA_SNAPSHOT',days:[],error:String(error&&error.message||error)},'*');
    }
  });
  addEventListener('load',function(){sendHeight(); new ResizeObserver(sendHeight).observe(document.body);});
})();
</script>`;

function prepareHtml(source: string) {
  // iframe sandbox có origin riêng nên localStorage không khả dụng; thay bằng bộ nhớ
  // phiên để file HTML vẫn chạy mà không được chạm vào dữ liệu trình duyệt của EAM.
  const safeSource = source.replace(/\blocalStorage\./g, "window.__shnStorage.");
  if (/<head[\s>]/i.test(safeSource)) return safeSource.replace(/<head([^>]*)>/i, `<head$1>${BRIDGE}`);
  return BRIDGE + safeSource;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return new NextResponse("Chưa đăng nhập", { status: 401 });
  const active = await prisma.shnPpaToolVersion.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
  const source = active?.content ?? await readFile(path.join(process.cwd(), "public/tools/so-sanh-shn-ppa.html"), "utf8");
  return new NextResponse(prepareHtml(source), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox allow-modals; default-src 'none'; script-src 'unsafe-inline' https:; style-src 'unsafe-inline' https:; connect-src https:; img-src data: blob: https:; font-src https: data:;",
    },
  });
}
