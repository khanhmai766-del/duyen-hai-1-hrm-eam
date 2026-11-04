"use client";

import {useEffect,useRef,useState} from "react";
import {copyBounds,spreadsheetCopyPayload,type CopyMode,type CopyPoint} from "@/modules/ctktkt/lib/spreadsheet-copy";
import styles from "./spreadsheet-copy-tools.module.css";

type Cell={element:HTMLTableCellElement;origin:CopyPoint};
function tableGrid(table:HTMLTableElement){
  const grid:Cell[][]=[];
  const rows=Array.from(table.rows).filter(row=>row.getBoundingClientRect().height>0);
  for(const [r,row] of rows.entries()){
    grid[r]||=[];
    let column=0;
    for(const element of Array.from(row.cells)){
      if(!element.getBoundingClientRect().width||getComputedStyle(element).display==="none")continue;
      while(grid[r][column])column++;
      const cell={element,origin:{row:r,column}};
      for(let y=r;y<Math.min(rows.length,r+element.rowSpan);y++){
        grid[y]||=[];
        for(let x=column;x<column+element.colSpan;x++)grid[y][x]=cell;
      }
      column+=element.colSpan;
    }
  }
  return grid;
}
function cellValue(cell:HTMLTableCellElement){
  const fields=Array.from(cell.querySelectorAll('input:not([type="checkbox"]):not([type="hidden"]),textarea,select'));
  return fields.length?fields.map(field=>(field as unknown as {value:string}).value).join(" "):cell.innerText.trim();
}

/** Read-only selection: intercepts pointer input only while explicitly enabled. */
export function SpreadsheetCopyTools(){
  const root=useRef<HTMLDivElement>(null);
  const [enabled,setEnabled]=useState(false),[mode,setMode]=useState<CopyMode>("cells");
  const [message,setMessage]=useState("");
  const selection=useRef<{table:HTMLTableElement;grid:Cell[][];anchor:CopyPoint;end:CopyPoint}|null>(null);
  const highlighted=useRef(new Set<HTMLTableCellElement>());
  const drag=useRef(false);
  const payload=useRef(()=>({text:"",html:""}));

  function clear(){
    highlighted.current.forEach(cell=>cell.removeAttribute("data-copy-selected"));highlighted.current.clear();
    selection.current=null;drag.current=false;
  }
  useEffect(()=>{
    const scope=root.current?.closest("[data-app-copy-scope]")?.querySelector<HTMLElement>(".ctktkt-content");
    if(!scope||!enabled)return;
    scope.setAttribute("data-copy-mode","true");
    scope.classList.add(styles.selectionScope);
    const paint=()=>{
      const value=selection.current;if(!value)return;
      highlighted.current.forEach(cell=>cell.removeAttribute("data-copy-selected"));highlighted.current.clear();
      const bounds=copyBounds(value.anchor,value.end,mode,value.grid.length,Math.max(...value.grid.map(row=>row.length)));
      for(let y=bounds.top;y<=bounds.bottom;y++)for(let x=bounds.left;x<=bounds.right;x++){
        const cell=value.grid[y]?.[x];if(cell){cell.element.setAttribute("data-copy-selected","true");highlighted.current.add(cell.element);}
      }
      setMessage(`Đã chọn ${bounds.bottom-bounds.top+1} hàng × ${bounds.right-bounds.left+1} cột. Ctrl+C để sao chép.`);
    };
    payload.current=()=>{
      const value=selection.current;if(!value||!value.table.isConnected)return {text:"",html:""};
      const bounds=copyBounds(value.anchor,value.end,mode,value.grid.length,Math.max(...value.grid.map(row=>row.length)));
      const matrix:string[][]=[];
      const seen=new Set<HTMLTableCellElement>();
      for(let y=bounds.top;y<=bounds.bottom;y++){
        const row:string[]=[];
        for(let x=bounds.left;x<=bounds.right;x++){
          const cell=value.grid[y]?.[x];row.push(cell&&!seen.has(cell.element)?cellValue(cell.element):"");
          if(cell)seen.add(cell.element);
        }
        matrix.push(row);
      }
      return spreadsheetCopyPayload(matrix);
    };
    const target=(event:PointerEvent)=>{
      const element=event.target instanceof Element?event.target.closest<HTMLTableCellElement>("td,th"):null;
      const table=element?.closest("table");
      return element&&table&&scope.contains(table)?{element,table}:null;
    };
    const down=(event:PointerEvent)=>{
      if(event.button!==0)return;
      const found=target(event);if(!found)return;
      event.preventDefault();event.stopPropagation();
      const grid=tableGrid(found.table);let point:CopyPoint|undefined;
      grid.forEach(row=>row.forEach(cell=>{if(cell.element===found.element)point=cell.origin;}));
      if(!point)return;
      const anchor=event.shiftKey&&selection.current?.table===found.table?selection.current.anchor:point;
      selection.current={table:found.table,grid,anchor,end:point};drag.current=true;
      if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
      paint();
    };
    const over=(event:PointerEvent)=>{
      if(!drag.current)return;const found=target(event),value=selection.current;
      if(!found||!value||value.table!==found.table)return;
      const cell=value.grid.flat().find(cell=>cell?.element===found.element);
      if(cell){value.end=cell.origin;paint();}
    };
    const up=()=>{drag.current=false;};
    const copy=(event:ClipboardEvent)=>{
      if(!selection.current||!event.clipboardData||!scope.contains(selection.current.table))return;
      if(event.target instanceof Element&&event.target!==document.body&&!scope.contains(event.target)&&!root.current?.contains(event.target))return;
      const data=payload.current();if(!data.html)return;
      event.preventDefault();event.clipboardData.setData("text/plain",data.text);event.clipboardData.setData("text/html",data.html);
      setMessage("Đã copy. Mở Excel, chọn ô bắt đầu rồi Ctrl+V.");
    };
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape"){clear();setMessage("Đã bỏ vùng chọn.");}};
    scope.addEventListener("pointerdown",down,true);scope.addEventListener("pointerover",over,true);
    document.addEventListener("pointerup",up);document.addEventListener("copy",copy);document.addEventListener("keydown",key);
    return ()=>{clear();scope.removeAttribute("data-copy-mode");scope.classList.remove(styles.selectionScope);scope.removeEventListener("pointerdown",down,true);scope.removeEventListener("pointerover",over,true);document.removeEventListener("pointerup",up);document.removeEventListener("copy",copy);document.removeEventListener("keydown",key);};
  },[enabled,mode]);

  const copySelected=async()=>{
    const data=payload.current();if(!data.html){setMessage("Hãy chọn vùng ô trong bảng trước.");return;}
    try{
      await navigator.clipboard.write([new ClipboardItem({"text/plain":new Blob([data.text],{type:"text/plain"}),"text/html":new Blob([data.html],{type:"text/html"})})]);
      setMessage("Đã copy. Mở Excel, chọn ô bắt đầu rồi Ctrl+V.");
    }catch{setMessage("Trình duyệt chưa cho copy bằng nút. Nhấn Ctrl+C để sao chép vùng đã chọn.");}
  };
  return <div ref={root} className={styles.toolbar}>
    <button type="button" aria-label={enabled?"Thoát chọn · Nhập số":"Chọn ô để sao chép Excel"} aria-pressed={enabled} onClick={()=>{setEnabled(value=>!value);setMessage("");}}><span className={styles.fullLabel}>{enabled?"Thoát chọn · Nhập số":"Chọn ô để sao chép Excel"}</span><span className={styles.shortLabel}>{enabled?"Thoát chọn":"Sao chép Excel"}</span></button>
    {enabled&&<div className={styles.options}><label>Chọn<select aria-label="Kiểu chọn dữ liệu" value={mode} onChange={event=>{setMode(event.target.value as CopyMode);setMessage("");}}><option value="cells">Vùng ô</option><option value="rows">Hàng</option><option value="columns">Cột</option></select></label><button type="button" onClick={copySelected}>Copy vùng chọn</button><button type="button" onClick={()=>{clear();setMessage("Đã bỏ vùng chọn.");}}>Bỏ chọn</button><span role="status">{message||"Chọn vùng trong bất kỳ bảng nào trên trang · Kéo chuột hoặc Shift+bấm ô cuối → Ctrl+C."}</span></div>}
  </div>;
}
