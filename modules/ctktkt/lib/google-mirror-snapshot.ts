import ExcelJS from 'exceljs';
import {getRawDb} from '@/modules/ctktkt/db';
import {createHash} from 'node:crypto';
import {exportReport as exportCtktkt} from './report-exports/ctktkt';
import {exportReport as exportWater} from './report-exports/water';
import {deriveCtktktCellsFromBcsx} from './ctktkt-bcsx-link';
import {ctktktWaterLogFromRow,deriveCtktktCellsFromWater} from './ctktkt-water-link';
import {mergeDailyInputsWithCtktkt} from './daily-source-links';
import {calculateDailyProduction} from './daily-production-calculations';
import {calculateActualHeatRate,calculatePpaHeatRateDetailed,type PpaSourceData} from './ppa-heat-rate';
import {buildPlantSheet,buildUnitSheet,buildMeterSheet,type PpaSheetRow} from './ppa-sheet-export';
import {SHIFT_TIME_SLOTS,deriveA0Readings} from './bcsx';
import {calculateAuxiliaryElectricity} from './auxiliary-electricity';
import {calculateCoalStock24h} from './coal-stock';
import {CHEMICAL_CATALOG} from './chemical-usage/catalog';
import {mirrorFields} from './google-mirror-fields';
import dailyTemplate from './google-mirror-daily-template.json';
import {GOOGLE_MIRROR_FILES,type MirrorCell,type MirrorTab} from './google-mirror';
import {vietnamDateIso,addDaysIso} from './operating-date';
import type {CtktktDayEntries} from './ctktkt-report';
import type {SheetJsLib} from './sheetjs-loader';

type DbRow=Record<string,unknown>;
type Matrix=MirrorCell[][];
const num=(v:unknown)=>v===null||v===undefined||String(v).trim()===''?null:Number.isFinite(Number(String(v).replace(',','.')))?Number(String(v).replace(',','.')):null;
function matrixAdapter(){return {utils:{aoa_to_sheet:(rows:Matrix)=>rows}} as unknown as SheetJsLib;}
function empty(rows:number,cols:number):Matrix{return Array.from({length:rows},()=>Array(cols).fill(null));}
function column(code:string){return [...code].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;}
function put(rows:Matrix,address:string,value:MirrorCell){const m=/^([A-Z]+)(\d+)$/.exec(address);if(m&&rows[Number(m[2])-1])rows[Number(m[2])-1][column(m[1])]=value;}
async function exportTabs(exporter:(r:Request)=>Promise<Response>,query:string):Promise<MirrorTab[]>{
 const response=await exporter(new Request('https://internal.invalid/?'+query));
 if(!response.ok)throw new Error('Không tạo được báo cáo đồng bộ.');
 const w=new ExcelJS.Workbook();await w.xlsx.load(await response.arrayBuffer());
 return w.worksheets.map(s=>{
  const rows=empty(Math.min(s.rowCount,210),Math.min(s.columnCount,49));
  s.eachRow(row=>row.eachCell(c=>{
   if(Number(c.row)>210||Number(c.col)>49||c.isMerged&&c.master.address!==c.address)return;
   let v:MirrorCell=null;
   if(c.formula)v={formula:c.formula};
   else if(c.value instanceof Date)v=c.value.toLocaleDateString('en-GB',{timeZone:'UTC'});
   else if(typeof c.value==='string'||typeof c.value==='number'||typeof c.value==='boolean')v=c.value;
   else if(c.value&&typeof c.value==='object'&&'richText' in c.value)v=c.value.richText.map(x=>x.text).join('');
   rows[Number(c.row)-1][Number(c.col)-1]=v;
  }));
  return {name:s.name,rows,clearRows:210,clearColumns:49};
 });
}

/** A bounded month read, with the preceding day for counter carry-over. No personnel/ACL tables. */
export async function buildMirrorSnapshot(period:string){
 const db=getRawDb(),from=period+'-01',next=addDaysIso(period+'-28',4).slice(0,7)+'-01',previous=addDaysIso(from,-1);
 const end=period===vietnamDateIso().slice(0,7)?addDaysIso(vietnamDateIso(),1):next;
 const read=async(sql:string)=> (await db.prepare(sql).bind(previous,end).all()).results as DbRow[];
 const [daily,shift,water,ppa,chemical,events]=await Promise.all([
  read('SELECT operating_date,field_code,value FROM daily_inputs WHERE operating_date>=? AND operating_date<? ORDER BY operating_date,field_code'),
  read('SELECT operating_date,unit,time_slot,metric,value FROM shift_readings WHERE operating_date>=? AND operating_date<? ORDER BY operating_date'),
  read('SELECT * FROM water_shift_logs WHERE log_date>=? AND log_date<? ORDER BY log_date,shift_time'),
  read('SELECT operating_date,source_data,net_s1_kwh,net_s2_kwh,ppa_plant,ppa_s1,ppa_s2,note_s1,note_s2 FROM ppa_heat_rate_daily WHERE operating_date>=? AND operating_date<? ORDER BY operating_date'),
  read('SELECT usage_date,chemical_code,chemical_name,material_code,unit,quantity,purpose,plant_unit,reference FROM chemical_usage_logs WHERE usage_date>=? AND usage_date<? AND deleted_at IS NULL ORDER BY usage_date,id'),
  read('SELECT operating_date,unit,start_at,end_at,event_type,description FROM operating_events WHERE operating_date>=? AND operating_date<? ORDER BY operating_date,unit,start_at'),
 ]);
 const ct=new Map<string,CtktktDayEntries>();
 for(const r of daily)if(String(r.field_code).startsWith('KTKT:')){const day=String(r.operating_date),values=ct.get(day)||{};values[String(r.field_code).slice(5)]=String(r.value??'');ct.set(day,values);}
 const count=Number(addDaysIso(next,-1).slice(8)),dates=Array.from({length:count},(_,i)=>`${period}-${String(i+1).padStart(2,'0')}`);
 const waterLogs=water.map(ctktktWaterLogFromRow);
 for(const date of [previous,...dates]){
  const values=ct.get(date)||{};
  Object.assign(values,deriveCtktktCellsFromBcsx(shift.filter(r=>r.operating_date===date).map(r=>({unit:String(r.unit),timeSlot:String(r.time_slot),metric:String(r.metric),value:String(r.value??'')}))).entries);
  Object.assign(values,deriveCtktktCellsFromWater(waterLogs,date));ct.set(date,values);
 }
 const linked=[...ct].flatMap(([operatingDate,row])=>Object.entries(row).map(([cell,value])=>({operatingDate,cell,value})));
 const merged=mergeDailyInputsWithCtktkt(daily.map(r=>({operatingDate:String(r.operating_date),fieldCode:String(r.field_code),value:String(r.value??'')})),linked,period);
 const byDate=new Map<string,Record<string,string>>();for(const r of merged){const row=byDate.get(r.operatingDate)||{};row[r.fieldCode]=r.value;byDate.set(r.operatingDate,row);}
 const tabs=new Map<string,MirrorTab[]>();
 const monthRows=empty(45,102);
 for(const [addr,v] of Object.entries(dailyTemplate))put(monthRows,addr,v as MirrorCell);
 put(monthRows,'A1',`BÁO CÁO SẢN XUẤT THÁNG ${period.slice(5)}/${period.slice(0,4)}`);put(monthRows,'A3','Bản xem từ web. Nhập và sửa số liệu trên web.');put(monthRows,'A4',Number(period.slice(5)));
 const inputs=Object.values(mirrorFields).flat().filter(f=>'input' in f&&f.input&&/^[A-Z]{1,2}$/.test(f.code));
 for(let day=1;day<=31;day++){put(monthRows,'A'+(day+5),day);for(const f of inputs)put(monthRows,f.code+(day+5),f.code==='CW'?byDate.get(dates[day-1])?.[f.code]||null:num(byDate.get(dates[day-1])?.[f.code]));}
 tabs.set('data',[{name:'T'+period.slice(5).replace(/^0/,''),template:'T10',rows:monthRows,clearRows:45,clearColumns:102}]);
 const [kt,wat]=await Promise.all([exportTabs(exportCtktkt,'period='+period),exportTabs(exportWater,'month='+period)]);
 tabs.set('ctktkt',kt);tabs.set('water',wat.map(t=>({...t,template:'T10.2026'})));
 // Water exporter writes the same report layout; retain its missing title labels from the reference.
 const wtab=tabs.get('water')![0];wtab.startRow=3;wtab.rows=wtab.rows.slice(2);// A header-only water export has no baseline row; create its display row before writing the date.
 (wtab.rows[0] ??= Array(20).fill(null))[0]=previous.split('-').reverse().join('/');wtab.clearRows=210;
 const ppaDays=ppa.filter(r=>String(r.operating_date)>=from),year=Number(period.slice(0,4));
 const pr:PpaSheetRow[]=ppaDays.map(r=>{const date=String(r.operating_date),act=calculateActualHeatRate(byDate.get(date)||{});return {date,ppaPlant:num(r.ppa_plant),ppaS1:num(r.ppa_s1),ppaS2:num(r.ppa_s2),actualPlant:act?.actualPlant??null,actualS1:act?.actualS1??null,actualS2:act?.actualS2??null,netS1Kwh:num(r.net_s1_kwh),netS2Kwh:num(r.net_s2_kwh),availableCapacityS1Mw:null,availableCapacityS2Mw:null,noteS1:String(r.note_s1||''),noteS2:String(r.note_s2||'')};});
 const adapter=matrixAdapter(),plant=buildPlantSheet(adapter,[[period,pr]]) as unknown as Matrix;
 for(const row of plant.slice(1))for(const c of [8,11,14])if(typeof row[c]==='number')row[c]=Number(row[c])/100;
 const pTabs:MirrorTab[]=[{name:'Cả nhà máy DH1',rows:plant.slice(1),startRow:3,clearRows:150,clearColumns:18}];
 const s1=[],s2=[];
 for(const r of ppaDays){const iso=String(r.operating_date),source=JSON.parse(String(r.source_data)) as PpaSourceData,detail=calculatePpaHeatRateDetailed(source,year);s1.push({iso,detail:detail.s1});s2.push({iso,detail:detail.s2});pTabs.push({name:iso.slice(8)+iso.slice(5,7),template:'0110',rows:buildMeterSheet(adapter,iso,source) as unknown as Matrix,clearRows:50,clearColumns:52});}
 for(const [name,days] of [['S1',s1],['S2',s2]] as const)pTabs.push({name,rows:buildUnitSheet(adapter,days,year) as unknown as Matrix,clearRows:200,clearColumns:55});
 tabs.set('ppa',pTabs);
 for(const [unit,key] of [['S1','bcsx-s1'],['S2','bcsx-s2'],['A0','bcsx-a0']] as const){
  const list:MirrorTab[]=[];
  for(const date of dates){
   const row=byDate.get(date)||{},r=empty(160,8);
   put(r,'A7',`BÁO CÁO VẬN HÀNH NGÀY ${date.split('-').reverse().join('/')} – ${unit==='A0'?'TOÀN NHÀ MÁY':unit}`);
   const readings=(u:string)=>Object.fromEntries(['P','Q','D','E'].map(metric=>[metric,SHIFT_TIME_SLOTS.map(time=>num(shift.find(x=>x.operating_date===date&&x.unit===u&&x.time_slot===time&&x.metric===metric)?.value))]));
   const s1r=readings('S1'),s2r=readings('S2');const rr=unit==='A0'?deriveA0Readings(s1r,s2r):unit==='S1'?s1r:s2r;
   for(let i=0;i<48;i++)for(const [j,m] of (['P','Q','D','E'] as const).entries())r[10+i][1+j]=rr[m]?.[i]??null;
   const get=(a:string,b:string)=>unit==='S1'?num(row[a]):unit==='S2'?num(row[b]):num(row[a])===null&&num(row[b])===null?null:(num(row[a])??0)+(num(row[b])??0);
   const gross=get('B','H'),net=get('C','I'),gm=gross===null?null:gross*1000,nm=net===null?null:net*1000;
   put(r,'C60',gm);put(r,'C61',nm);put(r,'C62',calculateAuxiliaryElectricity(gm,nm,get('GRID_RECEIVE_S1','GRID_RECEIVE_S2')).totalMwh);put(r,'C63',get('AE_ADJ','AF_ADJ'));put(r,'C64',calculateCoalStock24h(ct,date).stock);
   const ev=events.filter(x=>x.operating_date===date&&(unit==='A0'||x.unit===unit));
   if(ev.length>89)throw new Error('Sự kiện vượt phạm vi mẫu; cần mở rộng trước khi đồng bộ.');
   ev.forEach((e,i)=>{r[71+i]=[String(e.start_at||''),String(e.end_at||''),String(e.event_type||''),String(e.description||''),null,null,null,null];});
   // Only data blocks are written: template headings/units/time slots remain intact.
   list.push({name:date.slice(8),template:'01',rows:r.slice(10,58).map(row=>row.slice(1,5)),startRow:11,startColumn:2,clearRows:48,clearColumns:4});
   list.push({name:date.slice(8),rows:r.slice(59,64).map(row=>[row[2]]),startRow:60,startColumn:3,clearRows:5,clearColumns:1});
   list.push({name:date.slice(8),rows:r.slice(71),startRow:72,clearRows:89,clearColumns:8});
   list.push({name:date.slice(8),rows:[[r[6][0]]],startRow:7,clearRows:1,clearColumns:1});
  }tabs.set(key,list);
 }
 const chem=chemical.filter(r=>String(r.usage_date)>=from);
 tabs.set('chemical',[
  {name:'Nhật ký hóa chất',rows:[['Ngày','Loại hóa chất','Mã vật tư','Số lượng','Đơn vị','Tổ máy','Mục đích sử dụng','Tham chiếu'],...chem.map(r=>[String(r.usage_date).split('-').reverse().join('/'),String(r.chemical_name),String(r.material_code),num(r.quantity),String(r.unit),String(r.plant_unit||''),String(r.purpose||''),String(r.reference||'')])],clearRows:5000,clearColumns:8},
  {name:'Tổng hợp tháng',rows:[['Hóa chất','Mã vật tư',`Sử dụng ${period}`,'Đơn vị'],...CHEMICAL_CATALOG.map(c=>[c.name,c.materialCode,chem.filter(r=>r.chemical_code===c.code).reduce((sum,r)=>sum+(num(r.quantity)??0),0),c.unit])],clearRows:6,clearColumns:4},
  {name:'Danh mục',rows:[['Mã hóa chất','Hóa chất','Mã vật tư','Đơn vị'],...CHEMICAL_CATALOG.map(c=>[c.code,c.name,c.materialCode,c.unit])],clearRows:6,clearColumns:4},
 ]);
 const pmis:Matrix=[[`BÁO CÁO THEO PMIS – ${period}`],['Chỉ tiêu','Đơn vị',...dates.map(d=>d.slice(8)+'/'+d.slice(5,7))]];
 for(const [i,u] of ['S1-DH1','S2-DH1'].entries()){
  pmis.push([u]);for(const [label,unit,a,b] of [['Trung bình công suất đầu cực','MW','DA','DB'],['Tổn thất khói khô trung bình','%','DC','DD'],['Trung bình chân không bình ngưng','kPa','DE','DF'],['Trung bình nhiệt độ nước làm mát tuần hoàn','°C','DG','DH'],['Suất tiêu hao NH3 đầu cực MF','g/kWh','BT','BV']])pmis.push([label,unit,...dates.map(date=>{const row=byDate.get(date)||{},code=i===0?a:b;return num(row[code])??calculateDailyProduction(row)[code as keyof ReturnType<typeof calculateDailyProduction>]??null;})] as Matrix[number]);
 }
 tabs.set('pmis',[{name:'Theo PMIS',rows:pmis,clearRows:14,clearColumns:33}]);
 return {period,generatedAt:new Date().toISOString(),files:GOOGLE_MIRROR_FILES.map(f=>{const sheets=tabs.get(f.key)!;return {...f,tabs:sheets,hash:createHash('sha256').update(JSON.stringify(sheets)).digest('hex')};})};
}
