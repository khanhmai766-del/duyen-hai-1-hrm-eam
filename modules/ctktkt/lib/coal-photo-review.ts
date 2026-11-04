import type {SessionUser} from "./auth/session";
import {canEditCtktktGroup} from "./ctktkt-permissions";
import {coalMeterCell,parseMeterLabel,parseVisionTotal,truncateTwoDecimals,type CoalMeterKey,type CoalSlot} from "./coal-meter-ocr";
export function canReviewCoalPhotos(user:SessionUser|null|undefined){return canEditCtktktGroup(user,"tkd_trend");}
export type CoalReviewFilter={unit:"S1"|"S2";date:string;slot:CoalSlot|"all";meter:CoalMeterKey|"all"};
export function filterCoalReviewPhotos<T extends {slot:CoalSlot;reading:{meter_label:string|null}}>(photos:T[],filter:CoalReviewFilter){
  return photos.filter(photo=>{
    const meter=parseMeterLabel(photo.reading.meter_label||"");
    return (!meter||meter.startsWith(filter.unit+"-"))&&(filter.slot==="all"||photo.slot===filter.slot)&&(filter.meter==="all"||meter===filter.meter);
  });
}
export function coalPhotoComparison(reading:{meter_label:string|null;total_display:string|null},slot:CoalSlot,current:Record<string,string>,override?:CoalMeterKey|null){
  const meter=override===undefined?parseMeterLabel(reading.meter_label||""):override;
  const cell=meter?coalMeterCell(meter,slot):null;
  const ai=parseVisionTotal(reading.total_display),imageValue=ai===null?null:truncateTwoDecimals(ai);
  const raw=cell?current[cell]?.trim():undefined;
  const numeric=raw?Number(raw.replace(",",".")):NaN;
  const tableValue=Number.isFinite(numeric)?numeric:null;
  const difference=imageValue===null||tableValue===null?null:tableValue-imageValue;
  const status:"unmapped"|"unreadable"|"empty"|"match"|"different"=!meter?"unmapped":imageValue===null?"unreadable":tableValue===null?"empty":Math.abs(difference!)<.000001?"match":"different";
  return {meter,cell,imageValue,tableValue,difference,status};
}
