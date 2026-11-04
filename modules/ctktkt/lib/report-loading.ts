/** Load one month at a time instead of bursting every selected month at once. */
export async function loadReportPeriods<T>(periods:string[],load:(period:string)=>Promise<T>,signal:AbortSignal):Promise<T[]> {
  const results:T[]=[];
  for(const period of periods){
    signal.throwIfAborted();
    results.push(await load(period));
    signal.throwIfAborted();
  }
  return results;
}

/** Request only the intersection with this month (inclusive API bounds). */
export function reportPeriodQuery(period:string,from:string,to:string){
  const last=new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),0)).toISOString().slice(0,10);
  return new URLSearchParams({period,from:from>`${period}-01`?from:`${period}-01`,to:to<last?to:last}).toString();
}

export function reportPage<T>(items:T[],requestedPage:number,size=30){
  const pages=Math.max(1,Math.ceil(items.length/size));
  const page=Math.max(0,Math.min(requestedPage,pages-1));
  return {items:items.slice(page*size,(page+1)*size),page,pages,total:items.length,start:items.length?page*size+1:0,end:Math.min((page+1)*size,items.length)};
}
