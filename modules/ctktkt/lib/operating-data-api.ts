import { getRawDb } from "../db";
import { integrationAuthorized, integrationPeriod } from "./integration-api";
import { mergeDailyInputsWithCtktkt } from "./daily-source-links";
import { calculateActualHeatRate, compareHeatRate } from "./ppa-heat-rate";
import { vietnamDateIso } from "./operating-date";

const headers = { "Cache-Control":"no-store, private", "X-Content-Type-Options":"nosniff" };
const json = (body: unknown, status=200) => Response.json(body,{status,headers});
const number = (value:unknown) => { if(value===null || value===undefined || String(value).trim()==="") return null; const n=Number(String(value).replace(",",".")); return Number.isFinite(n)?n:null; };
// Tách phụ thuộc để kiểm hợp đồng bearer và truy vấn PostgreSQL mà không cần khóa thật.
export async function readOperatingData(request: Request, dependencies = {
  getDb: getRawDb,
  expectedHash: process.env.PXVH1_READ_API_KEY_SHA256,
  today: vietnamDateIso(),
}) {
  if (!integrationAuthorized(request, dependencies.expectedHash)) return json({error:"Khóa API không hợp lệ hoặc đã thu hồi."},401);
  const url=new URL(request.url);
  const range=integrationPeriod(url.searchParams.get("period"));
  const dataset=url.searchParams.get("dataset");
  if(!range || (dataset!=="pmis" && dataset!=="ppa")) return json({error:"Cần period=YYYY-MM và dataset=pmis hoặc ppa."},400);
  try {
    const db=dependencies.getDb(), today=dependencies.today;
    const previousDate=new Date(`${range.from}T00:00:00Z`);
    previousDate.setUTCDate(previousDate.getUTCDate()-1);
    const daily=await db.prepare("SELECT operating_date AS operatingDate, field_code AS fieldCode, value FROM daily_inputs WHERE operating_date >= ? AND operating_date < ? AND operating_date <= ?").bind(range.from,range.next,today).all();
    const ct=await db.prepare("SELECT operating_date AS operatingDate, substr(field_code, 6) AS cell, value FROM daily_inputs WHERE field_code LIKE 'KTKT:%' AND operating_date >= ? AND operating_date < ? AND operating_date <= ?").bind(previousDate.toISOString().slice(0,10),range.next,today).all();
    const merged=mergeDailyInputsWithCtktkt(daily.results as {operatingDate:string;fieldCode:string;value:string}[],ct.results as {operatingDate:string;cell:string;value:string}[],range.period);
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
    const ppa=await db.prepare("SELECT operating_date AS operatingDate, ppa_plant AS ppaPlant, ppa_s1 AS ppaS1, ppa_s2 AS ppaS2, updated_at AS updatedAt FROM ppa_heat_rate_daily WHERE operating_date >= ? AND operating_date < ? AND operating_date <= ? ORDER BY operating_date").bind(range.from,range.next,today).all();
    const entries=ppa.results.map(row=>{
      const actual=calculateActualHeatRate(byDate.get(String(row.operatingDate))||{});
      const unit=(a:number|null,p:unknown)=>({actual:a,ppa:number(p),...compareHeatRate(a,number(p))});
      return {operatingDate:row.operatingDate,updatedAt:row.updatedAt,unit:"kJ/kWh",plant:unit(actual?.actualPlant??null,row.ppaPlant),s1:unit(actual?.actualS1??null,row.ppaS1),s2:unit(actual?.actualS2??null,row.ppaS2)};
    });
    return json({version:1,dataset,period:range.period,entries});
  } catch { return json({error:"Tạm thời không đọc được dữ liệu."},503); }
}
