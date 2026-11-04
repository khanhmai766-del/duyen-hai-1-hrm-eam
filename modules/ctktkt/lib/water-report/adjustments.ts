export const WATER_ADJUSTMENT_FIELDS={
  waterAdjustmentS1:"water_adjustment_s1",
  waterAdjustmentS2:"water_adjustment_s2",
  condenserAdjustmentS1:"condenser_adjustment_s1",
  condenserAdjustmentS2:"condenser_adjustment_s2",
} as const;
export type WaterAdjustmentField=keyof typeof WATER_ADJUSTMENT_FIELDS;
export function normalizeWaterAdjustment(value:unknown):number|null{
  if(value===null||value===undefined||value==="")return null;
  if((typeof value!=="string"&&typeof value!=="number")||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>1_000_000_000)throw new Error("Hiệu chỉnh công tơ phải là số từ 0 đến 1.000.000.000 m³ hoặc để trống.");
  return Number(value);
}
export function waterAdjustmentsFromRow(row:Record<string,unknown>){
  return Object.fromEntries(Object.entries(WATER_ADJUSTMENT_FIELDS).map(([field,column])=>[field,normalizeWaterAdjustment(row[field]??row[column])])) as Record<WaterAdjustmentField,number|null>;
}
/** Explicit adjustment replaces legacy rollover compensation, never adds to it twice. */
export function waterMeterUsage(current:number,previous:number,adjustment:number|null|undefined,legacyRollover=0){
  if(!Number.isFinite(current)||!Number.isFinite(previous)||current<0||previous<=0)return 0;
  // Legacy zero represents missing data. An explicit correction also permits a real reset to zero.
  if(current===0&&adjustment==null)return 0;
  let difference=current-previous;
  if(adjustment!=null)difference+=adjustment;
  else if(difference<0&&difference>-legacyRollover)difference+=legacyRollover;
  return Math.round((difference+Number.EPSILON)*100)/100;
}
