"use strict";
const $ = id => document.getElementById(id);
const books = [
  {unit:"S1",role:"Lò trưởng",label:"DH1_Lò Trưởng S1",id:"887f4695-1ce7-4232-896d-29154b1d7c59"},
  {unit:"S1",role:"Máy trưởng",label:"DH1_Máy Trưởng S1",id:"4d434111-ab05-4bcc-a930-b6ee972fdbc7"},
  {unit:"S2",role:"Lò trưởng",label:"DH1_Lò Trưởng S2",id:"5239718f-2729-480f-bb5b-7fe55a475125"},
  {unit:"S2",role:"Máy trưởng",label:"DH1_Máy Trưởng S2",id:"9b183898-4bc9-476c-8778-0a7de6ee6126"}
];
let records = [], selected = new Set(), stop = false, readerTab, running = false, linkedContext=null, pickerTabId;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function checkStop() { if (stop) throw new Error("Đã dừng theo yêu cầu."); }
function log(message) { $("log").textContent += message+"\n"; }
async function page(action,args={}) {
  checkStop();
  const results = await chrome.scripting.executeScript({target:{tabId:readerTab},world:"MAIN",func:nkvhPage,args:[action,args]});
  if (!results[0] || results[0].result === undefined) throw new Error("Không đọc được trang NKVH. Kiểm tra đăng nhập và tab đọc dữ liệu.");
  return results[0].result;
}
async function waitPage(kind) {
  const until = Date.now()+45000;
  let settled = 0;
  while (Date.now()<until) {
    checkStop();
    try {
      const state = await page("state");
      if (/\/Login\/?$/i.test(state.path)) throw new Error("NKVH yêu cầu đăng nhập. Đăng nhập trên tab NKVH rồi thử lại.");
      const expected = kind === "detail" ? /\/nkvh_ct\/?$/ : /\/nkvh\/?$/;
      if (expected.test(state.path) && state.ready === "complete" && !state.busy) {
        if (++settled >= 2) return;
      } else settled = 0;
    } catch (error) {
      if (/đăng nhập|Đã dừng/.test(error.message)) throw error;
      settled = 0;
    }
    await pause(650);
  }
  throw new Error("NKVH tải quá lâu hoặc chưa mở đúng màn hình.");
}
async function prepareList(url,book,from,to) {
  await chrome.tabs.update(readerTab,{url});
  await waitPage("list");
  await page("book",{book:book.id});
  await pause(1000);
  await waitPage("list");
  await page("filter",{book:book.id,from,to});
  await pause(1000);
  await waitPage("list");
}
async function findLog(book,shift) {
  const seen = new Set();
  for (let i=0;i<20;i++) {
    const data = await page("list");
    if (data.book !== book.id) throw new Error("Bộ lọc đang ở sổ khác; dừng đọc ca này.");
    const matches = data.rows.filter(row => row.book === book.label && row.date === shift.date && row.shift === shift.name && row.start === shift.start);
    if (matches.length > 1) throw new Error("Có nhiều nhật ký trùng ca; cần kiểm tra nguồn trước khi đọc.");
    if (matches.length === 1) return matches[0];
    const signature = JSON.stringify(data.rows);
    if (!data.hasNext || seen.has(signature)) break;
    seen.add(signature);
    await page("next");
    await pause(1000);
    await waitPage("list");
  }
  throw new Error("Không tìm thấy ca trong danh sách (có thể chưa lập nhật ký).");
}
function lengths() {
  [1,2].forEach(n => {
    const count = $("s"+n).value.length;
    $("len"+n).textContent = `${count} ký tự${count>1000 ? " — vượt giới hạn hiện tại trên web" : ""}`;
    $("len"+n).className = count>1000 ? "warning" : "";
  });
}
function output() {
  for (const unit of ["S1","S2"]) {
    $(unit.toLowerCase()).value = records.filter(row => row.unit===unit && selected.has(row.id))
      .map(row => `[${row.role} · ${row.shiftLabel}] ${row.start}${row.end ? " – "+row.end : ""}: ${row.content}`).join("\n");
  }
  lengths();
}
function render() {
  const container = $("events"); container.replaceChildren();
  $("count").textContent = `${records.length} sự kiện S1 + S2 trong ngày · ${records.filter(row=>selected.has(row.id)).length} đã chọn`;
  for (const unit of ["S1", "S2"]) {
    const rows = records.filter(row => row.unit === unit);
    const section = document.createElement("section"); section.className="unit-events";
    const title = document.createElement("h2"); title.textContent = `${unit} · ${rows.length} sự kiện`;
    section.append(title);
    const table = document.createElement("table"); table.className="event-table";
    const head = table.createTHead().insertRow();
    for (const name of ["Thời gian", "Nội dung", "Tích"]) {
      const th = document.createElement("th"); th.scope="col"; th.textContent=name; head.append(th);
    }
    const body = table.createTBody();
    if (!rows.length) {
      const cell = body.insertRow().insertCell(); cell.colSpan=3;
      cell.textContent="Chưa có sự kiện trong ngày đã đọc được. Xem tiến độ nếu ca bị thiếu/lỗi.";
    }
    for (let order=0;order<4;order++) {
      const group = rows.filter(row=>row.order===order);
      if (!group.length) continue;
      const heading = body.insertRow(); heading.className="shift-heading";
      const headingCell = heading.insertCell(); headingCell.colSpan=3;
      headingCell.textContent=["Khuya D−1 · 00–06h","Sáng D · 06–14h","Chiều D · 14–22h","Khuya D · 22–24h"][order];
      for (const row of group) {
        const line = body.insertRow();
        const time = line.insertCell(); time.className="event-time";
        const link = document.createElement("a"); link.href=row.url; link.target="_blank"; link.rel="noopener noreferrer";
        link.textContent=`${row.start}${row.end ? " → "+row.end : ""}`;
        link.title=`${row.role} · ${row.status} · Mở nhật ký gốc`; time.append(link);
        const content = line.insertCell(); content.className="content"; content.textContent=row.content;
        content.title=`${row.role} · ${row.status}`;
        const choice = line.insertCell(); choice.className="event-choice";
        const checkbox=document.createElement("input"); checkbox.type="checkbox"; checkbox.checked=selected.has(row.id);
        checkbox.setAttribute("aria-label",`Chọn ${unit}, ${row.role}, ${row.start}: ${row.content}`);
        checkbox.addEventListener("change",()=>{ checkbox.checked ? selected.add(row.id) : selected.delete(row.id); output(); render(); });
        choice.append(checkbox);
      }
    }
    section.append(table); container.append(section);
  }
}
$("stop").addEventListener("click",()=>{stop=true;$("status").textContent="Đang dừng…";});
[1,2].forEach(n=>{
  $("s"+n).addEventListener("input",lengths);
  $("copy"+n).addEventListener("click",async()=>{
    try { await navigator.clipboard.writeText($("s"+n).value); $("status").textContent=`Đã sao chép nội dung S${n}.`; }
    catch { $("s"+n).focus(); $("s"+n).select(); $("status").textContent="Bấm Ctrl+C để sao chép nội dung đang chọn."; }
  });
});
$("sync").addEventListener("click",async()=>{
  if(running) return;
  if (records.length && !confirm("Đồng bộ lại sẽ thay thế kết quả và lựa chọn hiện tại trên trang thử. Tiếp tục?")) return;
  let successful=0, hidden=0, empty=0;
  try {
    const iso=$("day").value, day=NkvhFilter.dayStamp(iso);
    const tabs=await chrome.tabs.query({});
    const source=tabs.find(tab=> /^https?:\/\/nkvh\.tpcduyenhai\.com\.vn\/nkvh\/pages\/nkvh\/nkvh\?/.test(tab.url||""));
    if(!source) throw new Error("Mở sẵn trang danh sách nhật ký NKVH đã đăng nhập, rồi bấm Đồng bộ lại.");
    const url=new URL(source.url); url.pathname="/nkvh/pages/nkvh/nkvh";
    for(const key of [...url.searchParams.keys()]) if(key!=="path") url.searchParams.delete(key);
    const from=NkvhFilter.displayDay(day-86400000), to=NkvhFilter.displayDay(day);
    const shifts=[{name:"Khuya",date:from,start:"22:00",order:0},{name:"Sáng",date:to,start:"06:00",order:1},{name:"Chiều",date:to,start:"14:00",order:2},{name:"Khuya",date:to,start:"22:00",order:3}];
    running=true; stop=false; $("sync").disabled=true; $("day").disabled=true; $("stop").disabled=false;
    records=[];selected.clear();$("log").textContent="";output();render();
    readerTab=(await chrome.tabs.create({url:url.href,active:false})).id;
    for(const book of books) for(const shift of shifts) {
      checkStop();
      const label=`${book.label} · ${shift.name} ${shift.date}`;
      $("status").textContent=`Đang đọc ${label}…`;
      try {
        await prepareList(url.href,book,from,to);
        const row=await findLog(book,shift);
        await page("open",{...row,bookLabel:book.label});
        await waitPage("detail");
        const detail=await page("detail");
        if(detail.shiftStart && detail.shiftStart !== `${shift.date} ${shift.start}`) throw new Error("Thời gian ca chi tiết không khớp với ca cần lấy.");
        let included=0;
        for(const event of detail.rows) {
          if(!event.content.trim()){empty++;continue;}
          if(!NkvhFilter.inDay(event,iso)){hidden++;continue;}
          records.push({...event,id:`${book.id}|${shift.date}|${shift.name}|${event.index}`,unit:book.unit,role:book.role,order:shift.order,shiftLabel:`${shift.name} ${shift.date}`,status:row.status,url:detail.url});included++;
        }
        successful++;log(`Đã đọc ${label}: ${included}/${detail.rows.length} dòng trong ngày · ${row.status}`);
        render();
      } catch(error) {
        checkStop(); log(`CHƯA ĐỌC ĐƯỢC ${label}: ${error.message}`);
        if(/đăng nhập|Không tìm thấy sổ|Bộ lọc NKVH đã thay đổi/.test(error.message)) throw error;
      }
    }
    $("status").textContent=`Đã đọc ${successful}/16 nhật ký; hiển thị ${records.length} sự kiện. Ẩn ${hidden} dòng ngoài ngày/không xác định được giờ, ${empty} dòng rỗng.${successful<16 ? " Kết quả chưa đầy đủ — xem các ca lỗi trong tiến độ." : " Chọn các dòng cần lấy."}`;
  } catch(error) { $("status").textContent=error.message;log(error.message); }
  finally {running=false;$("sync").disabled=false;$("day").disabled=!!linkedContext;$("stop").disabled=true;render();}
});
$("day").value=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
render();lengths();

$("apply").addEventListener("click",async()=>{
  if(running) { $("status").textContent="Chờ đồng bộ xong hoặc bấm Dừng trước khi đưa nội dung vào web.";return; }
  try {
    const result=await chrome.runtime.sendMessage({type:"NKVH_APPLY",pickerTabId,operatingDate:$("day").value,eventS1:$("s1").value.trim(),eventS2:$("s2").value.trim()});
    if(!result?.ok) throw new Error(result?.error || "Không đưa được dữ liệu vào web.");
    $("status").textContent="Đã đưa nội dung vào web. Kiểm tra rồi bấm Lưu thông tin S1/S2 trên web.";
    $("apply").disabled=true;
  } catch(error){$("status").textContent=error.message;}
});
(async()=>{
  try {
    pickerTabId=(await chrome.tabs.getCurrent())?.id;
    const result=await chrome.runtime.sendMessage({type:"NKVH_CONTEXT",pickerTabId});
    if(result?.context) {
      linkedContext=result.context;$("day").value=linkedContext.date;$("day").disabled=true;$("apply").hidden=false;
      $("sync").click();
    }
  } catch(error){log("Chưa kết nối web: "+error.message);}
})();
