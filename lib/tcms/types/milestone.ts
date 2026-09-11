export const MILESTONE_STATUSES=["NOT_STARTED","IN_PROGRESS","AT_RISK","DELAYED","COMPLETED","CANCELLED"] as const;
export type MilestoneStatus=(typeof MILESTONE_STATUSES)[number];

export interface Milestone {
  id:string;
  contractId:string;
  contractNumber:string;
  packageName:string;
  workScopeId?:string;
  workScopeCode?:string;
  workScopeName?:string;
  contractItemId?:string;
  contractItemCode?:string;
  contractItemName?:string;
  ownerUserId?:string;
  ownerDisplayName?:string;
  code:string;
  name:string;
  description?:string;
  plannedDate:string;
  forecastDate?:string;
  actualDate?:string;
  progressPercent:number;
  status:MilestoneStatus;
  critical:boolean;
  notes?:string;
  delayDays:number;
  version:number;
  createdAt:string;
  updatedAt:string;
}

export type MilestoneInput=Pick<Milestone,"contractId"|"workScopeId"|"contractItemId"|"ownerUserId"|"code"|"name"|"description"|"plannedDate"|"forecastDate"|"actualDate"|"progressPercent"|"status"|"critical"|"notes">;

export interface MilestoneOptions {
  contracts:Array<{id:string;contractNumber:string;packageName:string}>;
  workScopes:Array<{id:string;contractId:string;code?:string;name:string}>;
  contractItems:Array<{id:string;contractId:string;workScopeId?:string;itemCode?:string;name:string}>;
  personnel:Array<{id:string;displayName:string;departmentCode?:string}>;
}

export interface MilestoneSummary {
  total:number;
  completed:number;
  delayed:number;
  atRisk:number;
  criticalOpen:number;
}
