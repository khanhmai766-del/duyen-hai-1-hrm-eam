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
  function comparisonSnapshot(){
    return {
      comparisonRows: typeof cmpFullMergeRows!=='undefined' && Array.isArray(cmpFullMergeRows) ? cmpFullMergeRows : [],
      warnings: typeof cmpAllWarningsGlobal!=='undefined' && Array.isArray(cmpAllWarningsGlobal) ? cmpAllWarningsGlobal : [],
      inferredYear: typeof cmpInferredYear!=='undefined' && Number.isFinite(cmpInferredYear) ? cmpInferredYear : null,
      filterFrom: (document.getElementById('cmpFilterFrom')||{}).value || '',
      filterTo: (document.getElementById('cmpFilterTo')||{}).value || ''
    };
  }
  function announceUnsaved(){
    window.parent.postMessage({type:'SHN_PPA_DIRTY_STATE',dirty:true},'*');
  }
  document.addEventListener('change',function(event){
    var target=event.target;
    if(target && target.tagName==='INPUT' && target.type==='file' && target.files && target.files.length) announceUnsaved();
    if(target && ['month','year','dayFrom','dayTo'].indexOf(target.id)>=0 && document.querySelector('.filelist .f')) announceUnsaved();
  },true);
  document.addEventListener('drop',function(event){
    if(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) announceUnsaved();
  },true);
  var nativeFetch = window.fetch.bind(window);
  window.fetch = async function(input, init){
    var method = String((init&&init.method)||'GET').toUpperCase();
    var body = null; try{body=init&&init.body ? JSON.parse(String(init.body)) : null;}catch(e){}
    var response;
    try{ response = await nativeFetch(input, init); }
    catch(networkError){
      if(method==='POST' && body && Array.isArray(body.days)){
        var failedSnapshot=comparisonSnapshot();
        window.parent.postMessage({type:'SHN_PPA_SYNC_RESULT',days:body.days,result:null,error:String(networkError&&networkError.message||networkError),comparisonRows:failedSnapshot.comparisonRows,warnings:failedSnapshot.warnings,inferredYear:failedSnapshot.inferredYear,filterFrom:failedSnapshot.filterFrom,filterTo:failedSnapshot.filterTo},'*');
      }
      throw networkError;
    }
    try {
      if (method==='POST' && body && Array.isArray(body.days)) {
        response.clone().text().then(function(text){
          var result=null; try{result=JSON.parse(text);}catch(e){}
          var files=Array.from(document.querySelectorAll('.filelist .f span:first-child')).map(function(el){return el.textContent||'';}).filter(Boolean);
          var value=function(id){var el=document.getElementById(id);return el?Number(el.value)||null:null;};
          var snapshot=comparisonSnapshot();
          window.parent.postMessage({type:'SHN_PPA_SYNC_RESULT',days:body.days,result:result,error:result?null:text.slice(0,300),fileNames:files,month:value('month'),year:value('year'),dayFrom:value('dayFrom'),dayTo:value('dayTo'),comparisonRows:snapshot.comparisonRows,warnings:snapshot.warnings,inferredYear:snapshot.inferredYear,filterFrom:snapshot.filterFrom,filterTo:snapshot.filterTo},'*');
        });
      }
    } catch(e) {}
    return response;
  };
  function sendHeight(){
    window.parent.postMessage({type:'SHN_PPA_HEIGHT',height:Math.min(12000,Math.max(700,document.documentElement.scrollHeight))},'*');
  }
  addEventListener('message',function(event){
    if(event.source!==window.parent || !event.data) return;
    if(event.data.type==='SHN_PPA_RESTORE_RESULT'){
      try{
        if(typeof cmpApplyFilters!=='function' || typeof cmpRenderWarnings!=='function') throw new Error('Phiên bản HTML hiện tại không hỗ trợ khôi phục biểu đồ');
        var rows=Array.isArray(event.data.comparisonRows) ? event.data.comparisonRows : [];
        if(!rows.length) throw new Error('Bản lưu không có dữ liệu biểu đồ');
        cmpFullMergeRows=rows;
        cmpCurrentMergeRows=rows;
        cmpAllWarningsGlobal=Array.isArray(event.data.warnings) ? event.data.warnings : [];
        cmpInferredYear=Number.isFinite(event.data.inferredYear) ? event.data.inferredYear : null;
        cmpFiltersInitialized=true;
        document.getElementById('cmpCard').style.display='block';
        document.getElementById('cmpControls').style.display='flex';
        document.getElementById('cmpFilterBar').style.display='flex';
        document.getElementById('cmpLoadedSummary').textContent='Đã khôi phục '+rows.length+' ngày từ kết quả lưu trên website.';
        document.getElementById('cmpFilterFrom').value=event.data.filterFrom||'';
        document.getElementById('cmpFilterTo').value=event.data.filterTo||'';
        if(cmpAllWarningsGlobal.length) cmpSetStatus(cmpAllWarningsGlobal.length+' lưu ý trong kết quả đã lưu — bấm mở bên dưới bảng để xem chi tiết.','info');
        else cmpClearStatus();
        cmpRenderWarnings(cmpAllWarningsGlobal);
        cmpApplyFilters();
        setTimeout(function(){
          sendHeight();
          var card=document.getElementById('cmpCard');
          window.parent.postMessage({type:'SHN_PPA_DIRTY_STATE',dirty:false},'*');
          window.parent.postMessage({type:'SHN_PPA_RESTORE_SUCCESS',offsetTop:card?card.offsetTop:0},'*');
        },80);
      }catch(error){
        window.parent.postMessage({type:'SHN_PPA_RESTORE_ERROR',error:String(error&&error.message||error)},'*');
      }
      return;
    }
    if(event.data.type!=='SHN_PPA_REQUEST_SNAPSHOT') return;
    try{
      var value=function(id){var el=document.getElementById(id);return el?Number(el.value)||null:null;};
      var month=value('month'), year=value('year');
      var days=typeof window.buildPayload==='function' ? window.buildPayload(month,year) : [];
      var files=Array.from(document.querySelectorAll('.filelist .f span:first-child')).map(function(el){return el.textContent||'';}).filter(Boolean);
      var snapshot=comparisonSnapshot();
      window.parent.postMessage({type:'SHN_PPA_SNAPSHOT',days:days,fileNames:files,month:month,year:year,dayFrom:value('dayFrom'),dayTo:value('dayTo'),comparisonRows:snapshot.comparisonRows,warnings:snapshot.warnings,inferredYear:snapshot.inferredYear,filterFrom:snapshot.filterFrom,filterTo:snapshot.filterTo},'*');
    }catch(error){
      window.parent.postMessage({type:'SHN_PPA_SNAPSHOT',days:[],error:String(error&&error.message||error)},'*');
    }
  });
  var causeTip=null;
  function showCauseTip(event,cause){
    if(!causeTip){
      causeTip=document.createElement('div');
      causeTip.style.cssText='position:fixed;z-index:9999;max-width:420px;padding:9px 11px;border-radius:7px;background:#153450;color:#fff;font:12px/1.55 Segoe UI,Arial,sans-serif;box-shadow:0 8px 26px rgba(0,0,0,.28);pointer-events:none;white-space:normal;';
      document.body.appendChild(causeTip);
    }
    causeTip.textContent=cause; causeTip.style.display='block';
    var left=Math.min(window.innerWidth-440,event.clientX+14); var top=Math.min(window.innerHeight-100,event.clientY+14);
    causeTip.style.left=Math.max(8,left)+'px'; causeTip.style.top=Math.max(8,top)+'px';
  }
  function hideCauseTip(){if(causeTip) causeTip.style.display='none';}
  function enhanceCauseCells(){
    document.querySelectorAll('.cause-cell[data-cause]').forEach(function(cell){
      if(cell.getAttribute('data-cause-ready')==='1') return;
      var cause=''; try{cause=decodeURIComponent(cell.getAttribute('data-cause')||'');}catch(e){cause=cell.getAttribute('data-cause')||'';}
      if(!cause) return;
      cell.setAttribute('title',cause);
      cell.setAttribute('aria-label','Nguyên nhân: '+cause+'. Bấm để xem đầy đủ.');
      cell.setAttribute('tabindex','0');
      cell.setAttribute('data-cause-ready','1');
      cell.addEventListener('mouseenter',function(event){showCauseTip(event,cause);});
      cell.addEventListener('mousemove',function(event){showCauseTip(event,cause);});
      cell.addEventListener('mouseleave',hideCauseTip);
      cell.addEventListener('blur',hideCauseTip);
      cell.addEventListener('keydown',function(event){
        if(event.key==='Enter'||event.key===' '){event.preventDefault();cell.click();}
      });
    });
  }
  addEventListener('load',function(){
    sendHeight(); enhanceCauseCells();
    new ResizeObserver(function(){sendHeight();enhanceCauseCells();}).observe(document.body);
    new MutationObserver(enhanceCauseCells).observe(document.body,{childList:true,subtree:true});
  });
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
