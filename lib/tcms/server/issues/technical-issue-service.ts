import {z} from "zod";
import {ISSUE_CATEGORIES,ISSUE_SEVERITIES,ISSUE_STATUSES,type TechnicalIssueInput} from "../../types/technical-issue";

const optionalText=(max:number)=>z.preprocess((value)=>typeof value==="string"&&value.trim()===""?undefined:value,z.string().trim().min(1).max(max).optional());
const optionalUuid=z.preprocess((value)=>value===""||value===null?undefined:value,z.uuid().optional());
const optionalDate=z.preprocess((value)=>value===""||value===null?undefined:value,z.iso.date().optional());
const schema=z.object({contractId:z.uuid(),inspectionId:optionalUuid,workScopeId:optionalUuid,contractItemId:optionalUuid,assigneeUserId:optionalUuid,
  code:z.string().trim().min(1).max(80).regex(/^[\p{L}\p{N}._/-]+$/u).transform((value)=>value.toLocaleUpperCase("vi")),title:z.string().trim().min(2).max(300),description:z.string().trim().min(2).max(6000),
  category:z.enum(ISSUE_CATEGORIES),severity:z.enum(ISSUE_SEVERITIES),status:z.enum(ISSUE_STATUSES),discoveredDate:z.iso.date(),dueDate:optionalDate,resolvedDate:optionalDate,resolution:optionalText(6000),
}).strict().superRefine((value,context)=>{const done=value.status==="RESOLVED"||value.status==="CLOSED";if(done&&(!value.resolvedDate||!value.resolution))context.addIssue({code:"custom",message:"RESOLVED_ISSUE_REQUIRES_DATE_AND_RESOLUTION"});if(!done&&(value.resolvedDate||value.resolution))context.addIssue({code:"custom",message:"RESOLUTION_REQUIRES_RESOLVED_STATUS"});});

export function parseTechnicalIssueInput(value:unknown):TechnicalIssueInput{const result=schema.safeParse(value);if(!result.success)throw new SyntaxError(result.error.issues[0]?.message??"INVALID_TECHNICAL_ISSUE_FIELDS");return result.data;}
export function parseTechnicalIssueVersion(value:unknown){const result=z.coerce.number().int().positive().safeParse(value);if(!result.success)throw new SyntaxError("INVALID_TECHNICAL_ISSUE_VERSION");return result.data;}
