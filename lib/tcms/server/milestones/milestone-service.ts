import { z } from "zod";
import { MILESTONE_STATUSES,type MilestoneInput } from "../../types/milestone";

const optionalText=(maximum:number)=>z.preprocess((value)=>typeof value==="string"&&value.trim()===""?undefined:value,z.string().trim().min(1).max(maximum).optional());
const optionalUuid=z.preprocess((value)=>value===""||value===null?undefined:value,z.uuid().optional());
const optionalDate=z.preprocess((value)=>value===""||value===null?undefined:value,z.iso.date().optional());

const milestoneSchema=z.object({
  contractId:z.uuid(),workScopeId:optionalUuid,contractItemId:optionalUuid,ownerUserId:optionalUuid,
  code:z.string().trim().min(1).max(80).regex(/^[\p{L}\p{N}._/-]+$/u).transform((value)=>value.toLocaleUpperCase("vi")),
  name:z.string().trim().min(2).max(300),description:optionalText(2000),plannedDate:z.iso.date(),forecastDate:optionalDate,actualDate:optionalDate,
  progressPercent:z.coerce.number().int().min(0).max(100),status:z.enum(MILESTONE_STATUSES),critical:z.boolean(),notes:optionalText(2000),
}).strict().superRefine((value,context)=>{
  if(value.status==="COMPLETED"&&(value.progressPercent!==100||!value.actualDate)) context.addIssue({code:"custom",message:"COMPLETED_MILESTONE_REQUIRES_100_PERCENT_AND_ACTUAL_DATE"});
  if(value.status!=="COMPLETED"&&value.actualDate) context.addIssue({code:"custom",message:"ACTUAL_DATE_REQUIRES_COMPLETED_STATUS"});
});

export function parseMilestoneInput(value:unknown):MilestoneInput{
  const result=milestoneSchema.safeParse(value);
  if(!result.success)throw new SyntaxError(result.error.issues[0]?.message??"INVALID_MILESTONE_FIELDS");
  return result.data;
}

export function parseMilestoneVersion(value:unknown){const result=z.coerce.number().int().positive().safeParse(value);if(!result.success)throw new SyntaxError("INVALID_MILESTONE_VERSION");return result.data;}
