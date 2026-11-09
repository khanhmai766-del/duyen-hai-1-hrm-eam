// Run: node --import tsx tests/ctktkt/report-input.browser.mjs
// Isolated browser regression of the real report component. All API data is synthetic.
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { defaultOperatingDate } from '../../modules/ctktkt/lib/operating-date.ts';
import { previousIsoDate } from '../../modules/ctktkt/lib/ctktkt-report.ts';

const out = path.resolve('reports/verify/ctktkt-input-regression');
await mkdir(out, { recursive: true });
const bundled = await build({
  stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {CtktktReport} from '@/modules/ctktkt/components/ctktkt-report';
    import {SessionProvider} from '@/modules/ctktkt/components/session-context';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import '@/modules/ctktkt/styles.css';
  const user={id:'test-operator',username:'test',displayName:'Kiểm thử cục bộ',role:'editor',permissions:['edit_ctktkt'],position:'Trưởng kíp điện'};
    const client=new QueryClient({defaultOptions:{queries:{staleTime:30_000,refetchOnWindowFocus:false,retry:1}}});
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><SessionProvider user={user}><CtktktReport/></SessionProvider></QueryClientProvider>);
  `, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, outfile: path.join(out, 'report.js'), format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'test-adapters', setup(b) {
    // Hook THẬT (apiGet/apiMutate, phong bì {data,meta,error}); chỉ bọc useReadCtktktReport để sự kiện
    // 'test-request-change' đổi danh tính hàm đọc → bảng chạy lại lượt đọc khi đang có số chưa lưu ("đọc muộn").
    b.onResolve({ filter: /^@\/hooks\/useKtktReport$/ }, args => args.importer.endsWith('ctktkt-report.tsx') ? ({ path: 'report-hook', namespace: 'test' }) : undefined);
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
      import {useCallback,useEffect,useState} from 'react';
      import {useReadCtktktReport as realRead} from ${JSON.stringify(path.resolve('hooks/useKtktReport.ts'))};
      export * from ${JSON.stringify(path.resolve('hooks/useKtktReport.ts'))};
      export function useReadCtktktReport(){const read=realRead();const [version,setVersion]=useState(0);useEffect(()=>{const f=()=>setVersion(v=>v+1);window.addEventListener('test-request-change',f);return()=>window.removeEventListener('test-request-change',f);},[]);return useCallback(query=>read(query),[read,version]);}
    `, resolveDir: process.cwd() }));
    b.onResolve({ filter: /^next\/dynamic$/ }, () => ({ path: 'dynamic', namespace: 'dynamic-test' }));
    b.onLoad({ filter: /.*/, namespace: 'dynamic-test' }, () => ({ contents: 'export default function dynamic(){return function Deferred(){return null;}}' }));
  } }],
});
const assets = new Map(bundled.outputFiles.map(file => [path.basename(file.path), file.contents]));
const css = await postcss([tailwind({ content: ['./modules/ctktkt/**/*.{ts,tsx}'], theme: { extend: {} }, plugins: [] })]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined });
assets.set('utilities.css', Buffer.from(css.css));
const date = defaultOperatingDate(), previous = previousIsoDate(date);
const current = { I35: '140', I36: '0', W87: '0', J157: '100', K157: '90', J158: '0', K158: '0' }, before = {};
for (let row=16;row<=27;row++) {
  before[`AB${row}`]='0'; before[`AL${row}`]='100';
  for(const col of ['X','Z','AB'])current[`${col}${row}`]='0';
  for(const col of ['AH','AJ','AL'])current[`${col}${row}`]='100';
}
current.AJ16='100.057';current.AL16='100.057';
for(let row=87;row<=92;row++){current[`AJ${row}`]='0';current[`AK${row}`]='0';}
let failSave = false, mismatchRead = false, postCount = 0, dailyDelay = 0;
const entries = () => [ ...Object.entries(current).map(([cell,value])=>({operatingDate:date,cell,value})), ...Object.entries(before).map(([cell,value])=>({operatingDate:previous,cell,value})) ];
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Cache-Control','no-store');
  if(assets.has(url.pathname.slice(1))){res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'text/javascript');res.end(assets.get(url.pathname.slice(1)));return;}
  if(url.pathname.startsWith('/api/')){
    res.setHeader('Content-Type','application/json');
    // Phong bì chung của web, như ok()/fail() của lib/api.ts.
    const ok=data=>res.end(JSON.stringify({data,meta:null,error:null})), fail=(status,error)=>{res.statusCode=status;res.end(JSON.stringify({data:null,meta:null,error}));};
    if(req.method==='POST'){
      postCount++;let raw='';for await(const chunk of req)raw+=chunk;
      if(failSave){fail(409,'Đã hết ca, số liệu không thuộc bạn hoặc chưa xác định người nhập cũ. Chưa lưu. Mở “Yêu cầu chỉnh sửa” để gửi quản trị duyệt.');return;}
      const body=JSON.parse(raw);for(const {cell,value}of body.entries){if(value==='')delete current[cell];else current[cell]=value;}
      ok({saved:body.entries.length});return;
    }
    if(url.pathname.includes('correction-requests')){ok({entries:[]});return;}
    const result={entries:entries(),linkedEntries:[],warnings:[],operatingHoursMissingDates:[]};
    if(url.searchParams.get('scope')==='stored'&&mismatchRead)result.entries=result.entries.filter(e=>e.cell!=='I35');
    if(url.searchParams.get('scope')==='daily-links'&&dailyDelay)await new Promise(r=>setTimeout(r,dailyDelay));
    ok(result);return;
  }
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/utilities.css"><link rel="stylesheet" href="/report.css"><body class="ctktkt-module"><main class="ctktkt-content" style="padding:12px"><div id="root"></div></main><script src="/report.js"></script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}}), errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  const base=`http://127.0.0.1:${server.address().port}`;
  await page.goto(base);
  const input=page.locator('input[data-cell="I35"]').first();
  await input.waitFor();await page.waitForFunction(()=>!document.querySelector('input[data-cell="I35"]').disabled);
  await input.fill('160');
  const key=`ctktkt:report-draft:v1:test-operator:${date}`;
  assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).values.I35,key),'160');
  // A read started after editing must not discard the pending input.
  dailyDelay=150;await page.evaluate(()=>window.dispatchEvent(new Event('test-request-change')));
  await page.waitForTimeout(700);assert.equal(await input.inputValue(),'160');dailyDelay=0;
  await page.reload();await page.waitForFunction(()=>!document.querySelector('input[data-cell="I35"]').disabled);
  assert.equal(await input.inputValue(),'160');assert.ok(await page.getByText(/Đã khôi phục bản nháp/).count());
  failSave=true;await page.getByRole('button',{name:'Lưu số liệu',exact:true}).first().click();
  await page.getByRole('button',{name:/Mở yêu cầu duyệt/}).click();
  const picker=page.getByRole('dialog').locator('select');
  assert.equal(await picker.locator('option[value="O4"]').count(),0);
  assert.equal(await picker.locator('option[value="W8"]').count(),1);
  assert.equal(await picker.locator('option[value="X16"]').count(),1);
  await page.getByRole('button',{name:/Lấy .*ô đang sửa trên báo cáo/}).click();
  await page.getByRole('dialog').locator('li').filter({hasText:'I35'}).waitFor();
  await page.reload();await page.waitForFunction(()=>!document.querySelector('input[data-cell="I35"]').disabled);assert.equal(await input.inputValue(),'160');
  failSave=false;mismatchRead=true;
  await page.getByRole('button',{name:'Lưu số liệu',exact:true}).first().click();
  await page.getByText(/CSDL chưa giữ đúng/).waitFor();assert.ok(await page.evaluate(k=>localStorage.getItem(k),key));
  mismatchRead=false;await page.getByRole('button',{name:'Lưu số liệu',exact:true}).first().click();
  await page.getByText(/Đã lưu thành công/).waitFor();assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),null);
  await page.reload();await page.waitForFunction(()=>!document.querySelector('input[data-cell="I35"]').disabled);assert.equal(await input.inputValue(),'160');
  await page.getByRole('button',{name:/TD21 và tính toán than/}).click();
  const moisture=page.locator('input[data-cell="AJ91"]');await moisture.fill('0');
  assert.equal(await moisture.inputValue(),'0');
  const warning=page.getByText(/Cân còn .*Qk = 0/);await warning.waitFor();
  assert.ok((await warning.textContent()).includes('0,057'));
  await page.screenshot({path:path.join(out,'before-confirmation.png'),fullPage:true});
  await page.getByRole('button',{name:'Xác nhận S2 ca 2 ngừng, không dùng than',exact:true}).click();
  const shift=page.locator('tr').filter({has:moisture});
  assert.equal((await shift.locator('td').nth(2).textContent()).trim(),'0');
  assert.equal((await shift.locator('td').nth(5).textContent()).trim(),'0');
  await page.getByRole('button',{name:'Lưu số liệu',exact:true}).first().click();
  await page.getByText(/Đã lưu thành công/).waitFor();
  assert.equal(current.AJ16,'100.057');assert.ok(current.COAL_ADJ_NOTE_S2.includes('không tiêu thụ than'));
  await page.reload();await page.waitForFunction(()=>!document.querySelector('input[data-cell="I35"]').disabled);
  await page.getByRole('button',{name:/TD21 và tính toán than/}).click();
  assert.equal((await page.locator('tr').filter({has:moisture}).locator('td').nth(5).textContent()).trim(),'0');
  await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  const result={passed:true,checks:['late read preserves input','reload restores account/day draft','shift lock preserves draft and opens approval workflow','readback mismatch preserves draft','verified save removes draft','saved data survives reload','explicit stopped-shift confirmation zeroes residual with reason and original counters retained','zero consumption survives save and reload'],postCount,synthetic:true};
  await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
