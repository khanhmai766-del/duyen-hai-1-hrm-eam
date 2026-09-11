"use client";
import { useTcmsTransport } from "@/hooks/use-tcms";

import { useState } from "react";

import { VietnameseDateInput } from "@/lib/tcms/components/contracts/vietnamese-date-input";
import type {
  ContractEvidenceField,
  ContractCreatePdfPreviewResponse,
  ContractFormImportDraft,
  PendingContractPdfImport,
} from "@/lib/tcms/types/contract-create-import";
import type { ContractItemImportDraft, ContractItemWeightAllocationMethod } from "@/lib/tcms/types/contract-item-import";

const inputClass = "mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[11px] text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100";
const textareaClass = "mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100";

const contractEvidenceLabels: Record<ContractEvidenceField, string> = {
  contractNumber: "Số hợp đồng",
  signedDate: "Ngày ký",
  packageName: "Tên gói thầu",
  contractorName: "Nhà thầu",
  contractorAddress: "Địa chỉ nhà thầu",
  contractorPhone: "Điện thoại nhà thầu",
  contractorRepresentative: "Đại diện nhà thầu",
  contractDurationDays: "Tổng thời gian hợp đồng",
  serviceProvisionDurationDays: "Thời gian cung cấp dịch vụ",
  serviceDurationText: "Điều khoản thời gian dịch vụ",
  unitExecutionDurationDays: "Thời gian thực hiện theo đơn vị/phạm vi",
  unitExecutionContinuous: "Yêu cầu thực hiện liên tục",
  unitExecutionTriggerText: "Mốc bắt đầu thời gian thực hiện",
  effectiveConditionText: "Điều kiện có hiệu lực",
};

function equalWeights(count: number) {
  if (count <= 0) return [];
  const base = Math.floor((100 / count) * 100) / 100;
  const values = Array(count).fill(base) as number[];
  values[count - 1] = Math.round((100 - base * (count - 1)) * 100) / 100;
  return values;
}

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({})) as ContractCreatePdfPreviewResponse & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Yêu cầu thất bại (${response.status}).`);
  return body;
}

export function ContractCreatePdfImport({
  onContractDraft,
  onImportChange,
}: {
  onContractDraft: (draft: ContractFormImportDraft) => void;
  onImportChange: (value: PendingContractPdfImport | null) => void;
}) {
  const request = useTcmsTransport();

  const [file, setFile] = useState<File | null>(null);
  const [redactionConfirmed, setRedactionConfirmed] = useState(false);
  const [preview, setPreview] = useState<ContractCreatePdfPreviewResponse | null>(null);
  const [weightAllocationMethod, setWeightAllocationMethod] = useState<ContractItemWeightAllocationMethod>("EQUAL");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function publish(items: ContractItemImportDraft[], method = weightAllocationMethod) {
    setPreview((current) => current ? { ...current, drafts: items } : current);
    onImportChange(items.length ? {
      items,
      weightAllocationMethod: method,
      redactionConfirmed: true,
    } : null);
  }

  function resetForFile(nextFile: File | null) {
    setFile(nextFile);
    setPreview(null);
    setError(null);
    setRedactionConfirmed(false);
    setWeightAllocationMethod("EQUAL");
    onImportChange(null);
  }

  async function analyze() {
    if (!file || !redactionConfirmed) return;
    setAnalyzing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("redactionConfirmed", "true");
      const result = await readJson(await request("/api/tcms/contracts/import/preview", {
        method: "POST",
        body: formData,
      }));
      const weights = equalWeights(result.drafts.length);
      const drafts = result.drafts.map((draft, index) => ({
        ...draft,
        weightPercent: weights[index] ?? draft.weightPercent,
      }));
      setPreview({ ...result, drafts });
      setWeightAllocationMethod("EQUAL");
      onContractDraft(result.contractDraft);
      onImportChange(drafts.length ? {
        items: drafts,
        weightAllocationMethod: "EQUAL",
        redactionConfirmed: true,
      } : null);
    } catch (requestError) {
      setPreview(null);
      onImportChange(null);
      setError(requestError instanceof Error ? requestError.message : "Không thể phân tích PDF.");
    } finally {
      setAnalyzing(false);
    }
  }

  function chooseWeightMethod(method: ContractItemWeightAllocationMethod) {
    setWeightAllocationMethod(method);
    if (!preview) return;
    const drafts = method === "EQUAL"
      ? preview.drafts.map((draft, index) => ({ ...draft, weightPercent: equalWeights(preview.drafts.length)[index] }))
      : preview.drafts;
    publish(drafts, method);
  }

  function updateDraft(index: number, changes: Partial<ContractItemImportDraft>) {
    if (!preview) return;
    publish(preview.drafts.map((draft, draftIndex) => draftIndex === index ? { ...draft, ...changes } : draft));
  }

  function removeDraft(index: number) {
    if (!preview) return;
    let drafts = preview.drafts.filter((_, draftIndex) => draftIndex !== index);
    if (weightAllocationMethod === "EQUAL") {
      const weights = equalWeights(drafts.length);
      drafts = drafts.map((draft, draftIndex) => ({ ...draft, weightPercent: weights[draftIndex] }));
    }
    publish(drafts);
  }

  const totalWeight = preview?.drafts.reduce((sum, draft) => sum + (draft.weightPercent ?? 0), 0) ?? 0;

  return (
    <section className="overflow-hidden rounded-xl border border-blue-200 bg-white shadow-sm">
      <div className="border-b border-blue-100 bg-blue-50 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">Nhập hợp đồng từ một PDF đã ẩn thông tin nhạy cảm</h2>
        <p className="mt-0.5 text-[10px] text-slate-600">Một lần phân tích sẽ điền form hợp đồng và tạo bản nháp hạng mục/checklist. Chưa ghi dữ liệu cho đến khi bấm xác nhận tạo hợp đồng.</p>
      </div>
      <div className="space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <label className="text-[10px] font-semibold text-slate-700">
            File PDF (tối đa 20 MB)
            <input type="file" accept="application/pdf,.pdf" className={inputClass} onChange={(event) => resetForFile(event.target.files?.[0] ?? null)} />
          </label>
          <button type="button" disabled={!file || !redactionConfirmed || analyzing} onClick={() => void analyze()} className="h-9 rounded-lg bg-blue-700 px-4 text-[11px] font-semibold text-white disabled:opacity-40">
            {analyzing ? "Đang phân tích..." : "Phân tích hợp đồng bằng AI"}
          </button>
        </div>
        <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-900">
          <input type="checkbox" checked={redactionConfirmed} onChange={(event) => setRedactionConfirmed(event.target.checked)} className="mt-0.5" />
          Tôi xác nhận PDF đã xóa/che thông tin nhạy cảm và được phép gửi tới nhà cung cấp AI đã cấu hình.
        </label>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-[10px] font-semibold text-red-700">{error}</p>}

        {preview && (
          <div className="space-y-3 border-t border-slate-200 pt-3">
            <p className="text-[11px] font-semibold text-emerald-700">{preview.message}</p>
            <p className="text-[10px] text-slate-500">Nguồn: {preview.provider.id}{preview.provider.model ? ` / ${preview.provider.model}` : ""}. Hãy đối chiếu mọi nội dung với PDF trước khi lưu.</p>
            {(preview.contractEvidence ?? []).length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[10px] font-bold text-emerald-800">Căn cứ AI dùng để điền thông tin hợp đồng</p>
                <div className="mt-2 space-y-2">
                  {(preview.contractEvidence ?? []).map((entry, index) => (
                    <div key={`${entry.field}-${entry.sourcePage ?? "unknown"}-${index}`} className="rounded border border-emerald-100 bg-white px-3 py-2 text-[9px] text-slate-600">
                      <p className="font-bold text-slate-700">
                        {contractEvidenceLabels[entry.field]} · Trang {entry.sourcePage ?? "?"}
                        {entry.confidence !== null ? ` · Tin cậy ${Math.round(entry.confidence * 100)}%` : ""}
                      </p>
                      <p className="mt-1">{entry.evidence}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {preview.drafts.length > 0 && (
              <>
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-[10px]">
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2"><input type="radio" name="createWeightMethod" checked={weightAllocationMethod === "EQUAL"} onChange={() => chooseWeightMethod("EQUAL")} /> Chia đều tạm thời 100% (cần xác nhận)</label>
                    <label className="flex items-center gap-2"><input type="radio" name="createWeightMethod" checked={weightAllocationMethod === "MANUAL"} onChange={() => chooseWeightMethod("MANUAL")} /> Nhập trọng số thủ công</label>
                  </div>
                  <p className={`mt-2 font-bold ${Math.abs(totalWeight - 100) <= 0.005 ? "text-emerald-700" : "text-red-700"}`}>Tổng trọng số: {totalWeight.toFixed(2)}% / 100.00%</p>
                  {weightAllocationMethod === "EQUAL" && <p className="mt-1 text-amber-700">Chia đều không chứng minh các hạng mục có cùng giá trị. Hãy chuyển sang nhập thủ công nếu có bảng giá chi tiết.</p>}
                </div>
                {preview.drafts.map((draft, index) => (
                  <div key={draft.draftId} className="space-y-3 rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-bold text-slate-800">Hạng mục {index + 1}</p>
                      <button type="button" onClick={() => removeDraft(index)} className="text-[10px] font-semibold text-red-600">Bỏ hạng mục</button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="text-[10px] font-semibold text-slate-700 sm:col-span-2">Tên/nội dung hạng mục *<input className={inputClass} value={draft.serviceDescription} onChange={(event) => updateDraft(index, { serviceDescription: event.target.value })} /></label>
                      <label className="text-[10px] font-semibold text-slate-700">Khối lượng<input type="number" min="0" className={inputClass} value={draft.quantity ?? ""} onChange={(event) => updateDraft(index, { quantity: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                      <label className="text-[10px] font-semibold text-slate-700">Đơn vị<input className={inputClass} value={draft.unit} onChange={(event) => updateDraft(index, { unit: event.target.value })} /></label>
                      <label className="text-[10px] font-semibold text-slate-700">Trọng số (%) *<input type="number" min="0" max="100" step="0.01" disabled={weightAllocationMethod === "EQUAL"} className={inputClass} value={draft.weightPercent ?? ""} onChange={(event) => updateDraft(index, { weightPercent: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                      <label className="text-[10px] font-semibold text-slate-700">
                        Ngày bắt đầu
                        <VietnameseDateInput
                          value={draft.plannedStartDate}
                          onChange={(val) => updateDraft(index, { plannedStartDate: val ?? "" })}
                        />
                      </label>
                      <label className="text-[10px] font-semibold text-slate-700">
                        Ngày kết thúc
                        <VietnameseDateInput
                          value={draft.plannedEndDate}
                          onChange={(val) => updateDraft(index, { plannedEndDate: val ?? "" })}
                        />
                      </label>
                      <label className="text-[10px] font-semibold text-slate-700 sm:col-span-2 lg:col-span-4">Nội dung công việc<textarea className={textareaClass} value={draft.workContent} onChange={(event) => updateDraft(index, { workContent: event.target.value })} /></label>
                    </div>
                    <div>
                      <div className="flex items-center justify-between"><p className="text-[10px] font-bold text-slate-700">Checklist theo dõi</p><button type="button" onClick={() => updateDraft(index, { checklistItems: [...draft.checklistItems, ""] })} className="text-[10px] font-semibold text-blue-700">+ Thêm nội dung</button></div>
                      <div className="mt-2 space-y-2">
                        {draft.checklistItems.map((entry, checklistIndex) => (
                          <div key={`${draft.draftId}-${checklistIndex}`} className="flex items-center gap-2">
                            <span className="w-5 text-[10px] font-bold text-slate-400">{checklistIndex + 1}.</span>
                            <input className={inputClass} value={entry} onChange={(event) => updateDraft(index, { checklistItems: draft.checklistItems.map((item, itemIndex) => itemIndex === checklistIndex ? event.target.value : item) })} />
                            <button type="button" onClick={() => updateDraft(index, { checklistItems: draft.checklistItems.filter((_, itemIndex) => itemIndex !== checklistIndex) })} className="text-[10px] font-semibold text-red-600">Bỏ</button>
                          </div>
                        ))}
                      </div>
                    </div>
                    {(draft.evidence || draft.sourcePage) && <p className="text-[9px] text-slate-500">Trang {draft.sourcePage ?? "?"}: {draft.evidence || "Không có dẫn chứng ngắn."}</p>}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
