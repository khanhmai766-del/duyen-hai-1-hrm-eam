/** Vietnam operational shifts are half-open: 06–14, 14–22, 22–06 next day. */
export function inputShiftStart(now = new Date()): string {
 const local=new Date(now.getTime()+7*3600000),hour=local.getUTCHours();
 if(hour<6){local.setUTCDate(local.getUTCDate()-1);local.setUTCHours(22,0,0,0);}else local.setUTCHours(hour<14?6:hour<22?14:22,0,0,0);
 return new Date(local.getTime()-7*3600000).toISOString();
}
export function canSelfCorrect(owner:string|null,shiftStart:string|Date|null,actor:string,now=new Date()) {
 return owner===actor&&shiftStart!==null&&new Date(shiftStart).toISOString()===inputShiftStart(now);
}

/** The 22:00 D–06:00 D+1 shift finalizes all inputs of reporting date D. */
export function canFinalizeReportDate(date: string, now = new Date()): boolean {
 const local = new Date(now.getTime() + 7 * 3600000);
 const hour = local.getUTCHours();
 if (hour >= 6 && hour < 22) return false;
 if (hour < 6) local.setUTCDate(local.getUTCDate() - 1);
 return date === local.toISOString().slice(0, 10);
}
