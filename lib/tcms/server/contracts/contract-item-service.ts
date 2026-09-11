import { CONTRACT_ITEM_STATUSES, type ContractItem, type ContractItemInput, type ContractItemSummary } from "../../types/contract-item";
import { z } from "zod";

const WEIGHT_TOLERANCE = 0.005;

function optionalText(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new SyntaxError("INVALID_CONTRACT_ITEM_FIELDS");
  return value.trim() || undefined;
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new SyntaxError("INVALID_CONTRACT_ITEM_FIELDS");
  return number;
}

export function parseContractItemInput(value: unknown): ContractItemInput {
  if (!value || typeof value !== "object") throw new SyntaxError("INVALID_JSON");
  const raw = value as Record<string, unknown>;
  const serviceDescription = optionalText(raw.serviceDescription);
  const quantity = optionalNumber(raw.quantity);
  const completedQuantity = optionalNumber(raw.completedQuantity);
  const completionDurationDays = optionalNumber(raw.completionDurationDays);
  const weightPercent = optionalNumber(raw.weightPercent);
  const progressPercent = optionalNumber(raw.progressPercent);
  const status = raw.status;
  const workScopeId = raw.workScopeId === undefined || raw.workScopeId === null || raw.workScopeId === ""
    ? undefined
    : z.uuid().safeParse(raw.workScopeId);
  if (!serviceDescription || weightPercent === undefined || progressPercent === undefined) throw new SyntaxError("MISSING_REQUIRED_FIELDS");
  if (weightPercent < 0 || weightPercent > 100 || progressPercent < 0 || progressPercent > 100) throw new SyntaxError("INVALID_CONTRACT_ITEM_FIELDS");
  if ((quantity !== undefined && quantity < 0) || (completedQuantity !== undefined && completedQuantity < 0) || (quantity !== undefined && completedQuantity !== undefined && completedQuantity > quantity)) throw new SyntaxError("INVALID_CONTRACT_ITEM_QUANTITY");
  if (completionDurationDays !== undefined && (!Number.isInteger(completionDurationDays) || completionDurationDays <= 0)) throw new SyntaxError("INVALID_CONTRACT_ITEM_DURATION");
  if (typeof status !== "string" || !CONTRACT_ITEM_STATUSES.includes(status as (typeof CONTRACT_ITEM_STATUSES)[number])) throw new SyntaxError("INVALID_CONTRACT_ITEM_STATUS");
  if (workScopeId && !workScopeId.success) throw new SyntaxError("INVALID_CONTRACT_ITEM_SCOPE");
  return {
    itemCode: optionalText(raw.itemCode), groupCode: optionalText(raw.groupCode), groupName: optionalText(raw.groupName),
    workScopeId: workScopeId ? workScopeId.data : undefined,
    serviceDescription, workContent: optionalText(raw.workContent), quantity, completedQuantity,
    unit: optionalText(raw.unit), serviceLocation: optionalText(raw.serviceLocation), completionDurationDays,
    weightPercent, progressPercent, plannedStartDate: optionalText(raw.plannedStartDate), plannedEndDate: optionalText(raw.plannedEndDate),
    actualStartDate: optionalText(raw.actualStartDate), actualEndDate: optionalText(raw.actualEndDate), status: status as ContractItemInput["status"],
    progressNote: optionalText(raw.progressNote), acceptanceStatus: optionalText(raw.acceptanceStatus),
  };
}

export function summarizeContractItems(items: readonly ContractItem[]): ContractItemSummary {
  const allocatedWeightPercent = items.reduce((sum, item) => sum + item.weightPercent, 0);
  const weightComplete = Math.abs(allocatedWeightPercent - 100) < 0.0001;
  return {
    totalItems: items.length,
    completedItems: items.filter((item) => item.status === "COMPLETED" || item.status === "ACCEPTED").length,
    allocatedWeightPercent,
    weightedProgressPercent: weightComplete ? items.reduce((sum, item) => sum + item.progressPercent * item.weightPercent, 0) / 100 : null,
    weightComplete,
  };
}

function tryExtractNumberedList(text: string): string[] | null {
  const regex = /(?:^|[\r\n\s]+)(?:(?:\((\d{1,3})\))|(\d{1,3})(?:\.-|[.)]))(?=\s+\S)/g;

  type MatchEntry = {
    index: number;
    num: number;
    contentStartIndex: number;
  };

  const matches: MatchEntry[] = [];
  let m: RegExpExecArray | null;

  while ((m = regex.exec(text)) !== null) {
    const rawMatch = m[0];
    const numStr = m[1] ?? m[2];
    const num = parseInt(numStr, 10);
    const matchIndex = m.index;

    const leadingWhitespaceLen = rawMatch.length - rawMatch.trimStart().length;
    const actualMarkerStart = matchIndex + leadingWhitespaceLen;

    const sub = text.slice(actualMarkerStart);
    const markerMatch = sub.match(/^(?:\(\d{1,3}\)|\d{1,3}(?:\.-|[.)]))\s+/);
    if (!markerMatch) continue;

    const contentStartIndex = actualMarkerStart + markerMatch[0].length;

    matches.push({
      index: actualMarkerStart,
      num,
      contentStartIndex,
    });
  }

  if (matches.length < 2) {
    return null;
  }

  if (matches[0].num > 2) {
    return null;
  }

  for (let i = 1; i < matches.length; i++) {
    const prev = matches[i - 1].num;
    const curr = matches[i].num;
    if (curr <= prev || curr - prev > 10) {
      return null;
    }
  }

  const items: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const contentStart = matches[i].contentStartIndex;
    const contentEnd = i < matches.length - 1 ? matches[i + 1].index : text.length;
    const itemText = text.slice(contentStart, contentEnd).trim();
    if (itemText) {
      items.push(itemText);
    }
  }

  return items.length >= 2 ? items : null;
}

function tryExtractLetteredList(text: string): string[] | null {
  const regex = /(?:^|[\r\n\s]+)(?:(?:\(([a-zA-Z])\))|([a-zA-Z])[.)])(?=\s+\S)/g;

  type MatchEntry = {
    index: number;
    letter: string;
    code: number;
    contentStartIndex: number;
  };

  const matches: MatchEntry[] = [];
  let m: RegExpExecArray | null;

  while ((m = regex.exec(text)) !== null) {
    const rawMatch = m[0];
    const letter = (m[1] ?? m[2]).toLowerCase();
    const code = letter.charCodeAt(0);
    const matchIndex = m.index;

    const leadingWhitespaceLen = rawMatch.length - rawMatch.trimStart().length;
    const actualMarkerStart = matchIndex + leadingWhitespaceLen;

    const sub = text.slice(actualMarkerStart);
    const markerMatch = sub.match(/^(?:\([a-zA-Z]\)|[a-zA-Z][.)])\s+/);
    if (!markerMatch) continue;

    const contentStartIndex = actualMarkerStart + markerMatch[0].length;

    matches.push({
      index: actualMarkerStart,
      letter,
      code,
      contentStartIndex,
    });
  }

  if (matches.length < 2) {
    return null;
  }

  if (matches[0].letter !== "a" && matches[0].letter !== "b") {
    return null;
  }

  for (let i = 1; i < matches.length; i++) {
    const prev = matches[i - 1].code;
    const curr = matches[i].code;
    if (curr !== prev + 1) {
      return null;
    }
  }

  const items: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const contentStart = matches[i].contentStartIndex;
    const contentEnd = i < matches.length - 1 ? matches[i + 1].index : text.length;
    const itemText = text.slice(contentStart, contentEnd).trim();
    if (itemText) {
      items.push(itemText);
    }
  }

  return items.length >= 2 ? items : null;
}

function tryExtractLineList(text: string): string[] | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const marker = /^(?:[-*•+]|(?:\d+|[A-Za-z])[.)])\s+(.+)$/;
  const matches = lines.map((line) => line.match(marker));
  if (matches.every(Boolean)) {
    return matches.map((match) => match?.[1].trim() ?? "").filter(Boolean);
  }
  return null;
}

function tryExtractInlineBullets(text: string): string[] | null {
  if (!text.includes(" - ") && !text.includes(" • ") && !text.includes(" * ")) {
    return null;
  }
  const startsWithBullet = /^[-*•+]\s+/.test(text);
  const parts = text.split(/(?:^|[\r\n\s]+)(?:[-•*])\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= (startsWithBullet ? 2 : 3)) {
    return parts;
  }
  return null;
}

export function splitWorkContentIntoChecklistItems(value: string | null | undefined): string[] {
  const text = value?.trim();
  if (!text) return [];

  const numbered = tryExtractNumberedList(text);
  if (numbered && numbered.length >= 2) {
    return numbered;
  }

  const lettered = tryExtractLetteredList(text);
  if (lettered && lettered.length >= 2) {
    return lettered;
  }

  const lineList = tryExtractLineList(text);
  if (lineList && lineList.length >= 2) {
    return lineList;
  }

  const inlineBullets = tryExtractInlineBullets(text);
  if (inlineBullets && inlineBullets.length >= 2) {
    return inlineBullets;
  }

  return [text];
}

export function allocateEqualWeights(itemCount: number, totalPercent: number = 100) {
  if (!Number.isInteger(itemCount) || itemCount <= 0) throw new SyntaxError("IMPORT_ITEMS_REQUIRED");
  if (!Number.isFinite(totalPercent) || totalPercent < 0 || totalPercent > 100) {
    throw new SyntaxError("INVALID_IMPORT_WEIGHTS");
  }
  const totalHundredths = Math.round(totalPercent * 100);
  const base = Math.floor(totalHundredths / itemCount);
  return Array.from({ length: itemCount }, (_, index) =>
    (index === itemCount - 1 ? totalHundredths - base * (itemCount - 1) : base) / 100,
  );
}

export function validateImportWeightTotal(weights: readonly number[], expectedTotalPercent: number = 100) {
  if (!weights.length || weights.some((weight) => !Number.isFinite(weight) || weight < 0 || weight > 100)) {
    throw new SyntaxError("INVALID_IMPORT_WEIGHTS");
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(total - expectedTotalPercent) > WEIGHT_TOLERANCE) throw new SyntaxError("INVALID_IMPORT_WEIGHT_TOTAL");
}

export function parseChecklistCompletionInput(value: unknown) {
  if (!value || typeof value !== "object") throw new SyntaxError("INVALID_JSON");
  const raw = value as { isCompleted?: unknown; expectedVersion?: unknown };
  if (typeof raw.isCompleted !== "boolean" || !Number.isInteger(raw.expectedVersion) || Number(raw.expectedVersion) <= 0) {
    throw new SyntaxError("INVALID_CHECKLIST_UPDATE");
  }
  return { isCompleted: raw.isCompleted, expectedVersion: Number(raw.expectedVersion) };
}

export function parseDailyLogInput(value: unknown) {
  if (!value || typeof value !== "object") throw new SyntaxError("INVALID_JSON");
  const raw = value as { logDate?: unknown; note?: unknown };
  const note = optionalText(raw.note);
  if (typeof raw.logDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.logDate) || !note) {
    throw new SyntaxError("INVALID_DAILY_LOG");
  }
  return { logDate: raw.logDate, note };
}
