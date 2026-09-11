import {z} from "zod";
import {INSPECTION_RESULTS,INSPECTION_TYPES,type InspectionInput} from "../../types/inspection";

const optionalText=(max:number)=>z.preprocess((value)=>typeof value==="string"&&value.trim()===""?undefined:value,z.string().trim().min(1).max(max).optional());
const optionalUuid=z.preprocess((value)=>value===""||value===null?undefined:value,z.uuid().optional());
const optionalDate=z.preprocess((value)=>value===""||value===null?undefined:value,z.iso.date().optional());
const schema=z.object({contractId:z.uuid(),workScopeId:optionalUuid,contractItemId:optionalUuid,inspectorUserId:optionalUuid,
  code:z.string().trim().min(1).max(80).regex(/^[\p{L}\p{N}._/-]+$/u).transform((value)=>value.toLocaleUpperCase("vi")),title:z.string().trim().min(2).max(300),
  inspectionDate:z.iso.date(),inspectionType:z.enum(INSPECTION_TYPES),location:optionalText(300),result:z.enum(INSPECTION_RESULTS),summary:optionalText(4000),recommendations:optionalText(4000),nextInspectionDate:optionalDate,
}).strict();

export function parseInspectionInput(value:unknown):InspectionInput{const result=schema.safeParse(value);if(!result.success)throw new SyntaxError(result.error.issues[0]?.message??"INVALID_INSPECTION_FIELDS");return result.data;}
export function parseInspectionVersion(value:unknown){const result=z.coerce.number().int().positive().safeParse(value);if(!result.success)throw new SyntaxError("INVALID_INSPECTION_VERSION");return result.data;}
