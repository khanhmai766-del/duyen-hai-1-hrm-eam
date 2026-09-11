export const ISSUE_CATEGORIES=["TECHNICAL","QUALITY","SAFETY","ENVIRONMENT","SCHEDULE","OTHER"] as const;
export const ISSUE_SEVERITIES=["LOW","MEDIUM","HIGH","CRITICAL"] as const;
export const ISSUE_STATUSES=["OPEN","IN_PROGRESS","PENDING_VERIFICATION","RESOLVED","CLOSED","CANCELLED"] as const;
export type IssueCategory=(typeof ISSUE_CATEGORIES)[number];
export type IssueSeverity=(typeof ISSUE_SEVERITIES)[number];
export type IssueStatus=(typeof ISSUE_STATUSES)[number];

export interface TechnicalIssue {
  id:string;contractId:string;contractNumber:string;packageName:string;inspectionId?:string;inspectionCode?:string;
  workScopeId?:string;workScopeName?:string;contractItemId?:string;contractItemName?:string;assigneeUserId?:string;assigneeDisplayName?:string;
  code:string;title:string;description:string;category:IssueCategory;severity:IssueSeverity;status:IssueStatus;
  discoveredDate:string;dueDate?:string;resolvedDate?:string;resolution?:string;overdueDays:number;version:number;createdAt:string;updatedAt:string;
}

export type TechnicalIssueInput=Pick<TechnicalIssue,"contractId"|"inspectionId"|"workScopeId"|"contractItemId"|"assigneeUserId"|"code"|"title"|"description"|"category"|"severity"|"status"|"discoveredDate"|"dueDate"|"resolvedDate"|"resolution">;

export interface TechnicalIssueOptions {
  contracts:Array<{id:string;contractNumber:string;packageName:string}>;
  inspections:Array<{id:string;contractId:string;code:string;title:string}>;
  workScopes:Array<{id:string;contractId:string;code?:string;name:string}>;
  contractItems:Array<{id:string;contractId:string;workScopeId?:string;itemCode?:string;name:string}>;
  personnel:Array<{id:string;displayName:string;departmentCode?:string}>;
}

export interface TechnicalIssueSummary {total:number;open:number;overdue:number;criticalOpen:number;resolved:number;}
