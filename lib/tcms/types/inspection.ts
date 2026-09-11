export const INSPECTION_TYPES=["ROUTINE","HOLD_POINT","WITNESS","TECHNICAL","SAFETY"] as const;
export const INSPECTION_RESULTS=["PENDING","CONFORMING","CONFORMING_WITH_FINDINGS","NONCONFORMING","CANCELLED"] as const;
export type InspectionType=(typeof INSPECTION_TYPES)[number];
export type InspectionResult=(typeof INSPECTION_RESULTS)[number];

export interface Inspection {
  id:string;contractId:string;contractNumber:string;packageName:string;workScopeId?:string;workScopeName?:string;
  contractItemId?:string;contractItemName?:string;inspectorUserId?:string;inspectorDisplayName?:string;
  code:string;title:string;inspectionDate:string;inspectionType:InspectionType;location?:string;result:InspectionResult;
  summary?:string;recommendations?:string;nextInspectionDate?:string;openIssueCount:number;version:number;createdAt:string;updatedAt:string;
}

export type InspectionInput=Pick<Inspection,"contractId"|"workScopeId"|"contractItemId"|"inspectorUserId"|"code"|"title"|"inspectionDate"|"inspectionType"|"location"|"result"|"summary"|"recommendations"|"nextInspectionDate">;

export interface InspectionOptions {
  contracts:Array<{id:string;contractNumber:string;packageName:string}>;
  workScopes:Array<{id:string;contractId:string;code?:string;name:string}>;
  contractItems:Array<{id:string;contractId:string;workScopeId?:string;itemCode?:string;name:string}>;
  personnel:Array<{id:string;displayName:string;departmentCode?:string}>;
}

export interface InspectionSummary {total:number;pending:number;withFindings:number;nonconforming:number;thisMonth:number;}
