import { prisma } from "@/lib/prisma";
import { integrationAuthorized, integrationPeriod } from "./integration-api";
import { mergeDailyInputsWithCtktkt } from "./daily-source-links";
import { calculateActualHeatRate, compareHeatRate } from "./ppa-heat-rate";
import { vietnamDateIso } from "./operating-date";

const headers = { "Cache-Control":"no-store, private", "X-Content-Type-Options":"nosniff" };
const json = (body: unknown, status=200) => Response.json(body,{status,headers});
const number = (value:unknown) => { if(value===null || value===undefined || String(value).trim()==="") return null; const n=Number(String(value).replace(",",".")); return Number.isFinite(n)?n:null; };
type DailyRow = { operatingDate: string; fieldCode: string; value: string };
type CellRow = { operatingDate: string; cell: string; value: string };
type PpaRow = { operatingDate: string; ppaPlant: string; ppaS1: string; ppaS2: string; updatedAt: string };
export type OperatingDataReader = {
  daily: (from: string, next: string, today: string) => Promise<DailyRow[]>;
  ctktkt: (from: string, next: string, today: string) => Promise<CellRow[]>;
  ppa: (from: string, next: string, today: string) => Promise<PpaRow[]>;
};
/** Bộ đọc Prisma — cùng điều kiện và thứ tự như các câu SQL cũ (ô ngày không sắp; PPA theo ngày). */
export const prismaOperatingDataReader: OperatingDataReader = {
  daily: async (from, next, today) => (await prisma.ctktktDailyInputs.findMany({
    where: { operating_date: { gte: from, lt: next, lte: today } }, select: { operating_date: true, field_code: true, value: true },
  })).map(r => ({ operatingDate: r.operating_date, fieldCode: r.field_code, value: r.value })),
  ctktkt: async (from, next, today) => (await prisma.ctktktDailyInputs.findMany({
    where: { field_code: { startsWith: "KTKT:" }, operating_date: { gte: from, lt: next, lte: today } }, select: { operating_date: true, field_code: true, value: true },
  })).map(r => ({ operatingDate: r.operating_date, cell: r.field_code.slice(5), value: r.value })),
  ppa: async (from, next, today) => (await prisma.ctktktPpaHeatRateDaily.findMany({
    where: { operating_date: { gte: from, lt: next, lte: today } }, orderBy: { operating_date: "asc" },
    select: { operating_date: true, ppa_plant: true, ppa_s1: true, ppa_s2: true, updated_at: true },
  })).map(r => ({ operatingDate: r.operating_date, ppaPlant: r.ppa_plant, ppaS1: r.ppa_s1, ppaS2: r.ppa_s2, updatedAt: r.updated_at })),
};
// Tách phụ thuộc để kiểm hợp đồng bearer và dữ liệu trả về mà không cần khóa/DB thật.
export async function readOperatingData(request: Request, dependencies: { reader?: OperatingDataReader; expectedHash?: string; today?: string } = {
  expectedHash: process.env.PXVH1_READ_API_KEY_SHA256,
  today: vietnamDateIso(),
}) {
  if (!integrationAuthorized(request, dependencies.expectedHash)) return json({error:"Khóa API không hợp lệ hoặc đã thu hồi."},401);
  const url=new URL(request.url);
  const range=integrationPeriod(url.searchParams.get("period"));
  const dataset=url.searchParams.get("dataset");
  if(!range || (dataset!=="pmis" && dataset!=="ppa")) return json({error:"Cần period=YYYY-MM và dataset=pmis hoặc ppa."},400);
  try {
    const reader=dependencies.reader ?? prismaOperatingDataReader, today=dependencies.today ?? vietnamDateIso();
    const previousDate=new Date(`${range.from}T00:00:00Z`);
    previousDate.setUTCDate(previousDate.getUTCDate()-1);
    const daily=await reader.daily(range.from,range.next,today);
    const ct=await reader.ctktkt(previousDate.toISOString().slice(0,10),range.next,today);
    const merged=mergeDailyInputsWithCtktkt(daily,ct,range.period);
    const byDate=new Map<string,Record<string,string>>();
    for(const entry of merged) { const values=byDate.get(entry.operatingDate)||{}; values[entry.fieldCode]=entry.value; byDate.set(entry.operatingDate,values); }
    if(dataset==="pmis") {
      const entries=[...byDate].sort(([a],[b])=>a.localeCompare(b)).map(([operatingDate,v])=>{
        const unit=(codes:string[])=>Object.fromEntries(codes.map((code,i)=>[["grossPowerMw","dryFlueGasLossPercent","condenserVacuumKpa","coolingWaterTemperatureC"][i],number(v[code])]));
        const nh3=(a:string,b:string)=>{const x=number(v[a]),y=number(v[b]);return x===null||y===null||y===0?null:x/y;};
        return {operatingDate,s1:{...unit(["DA","DC","DE","DG"]),nh3PerGrossKwh:nh3("BQ","B")},s2:{...unit(["DB","DD","DF","DH"]),nh3PerGrossKwh:nh3("BR","H")}};
      });
      return json({version:1,dataset,period:range.period,entries});
    }
    const ppa=await reader.ppa(range.from,range.next,today);
    const entries=ppa.map(row=>{
      const actual=calculateActualHeatRate(byDate.get(String(row.operatingDate))||{});
      const unit=(a:number|null,p:unknown)=>({actual:a,ppa:number(p),...compareHeatRate(a,number(p))});
      return {operatingDate:row.operatingDate,updatedAt:row.updatedAt,unit:"kJ/kWh",plant:unit(actual?.actualPlant??null,row.ppaPlant),s1:unit(actual?.actualS1??null,row.ppaS1),s2:unit(actual?.actualS2??null,row.ppaS2)};
    });
    return json({version:1,dataset,period:range.period,entries});
  } catch { return json({error:"Tạm thời không đọc được dữ liệu."},503); }
}
