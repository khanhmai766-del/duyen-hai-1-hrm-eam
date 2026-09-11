"use client";
import { useTcmsTransport } from "@/hooks/use-tcms";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { formatDate } from "@/lib/tcms/lib/contract-utils";
import { VietnameseDateInput } from "@/lib/tcms/components/contracts/vietnamese-date-input";
import type {
  ContractItem,
  ContractItemTracking,
  ContractItemInput,
  ContractItemStatus,
  ContractItemSummary,
} from "@/lib/tcms/types/contract-item";
import type {
  ContractItemImportDraft,
  ContractItemWeightAllocationMethod,
  PdfImportPreviewResponse,
} from "@/lib/tcms/types/contract-item-import";
import type { WorkScope } from "@/lib/tcms/types/contract-structure";

const emptyItem: ContractItemInput = {
  serviceDescription: "",
  weightPercent: 0,
  progressPercent: 0,
  status: "NOT_STARTED",
};

const statusLabels: Record<
  ContractItemStatus,
  string
> = {
  NOT_STARTED: "Chưa bắt đầu",
  IN_PROGRESS: "Đang thực hiện",
  ON_HOLD: "Tạm dừng",
  COMPLETED: "Hoàn thành",
  ACCEPTED: "Đã nghiệm thu",
  CANCELLED: "Đã hủy",
};

const acceptanceStatusOptions = [
  {
    value: "",
    label: "Chưa xác định",
  },
  {
    value: "NOT_ACCEPTED",
    label: "Chưa nghiệm thu",
  },
  {
    value: "PENDING",
    label: "Chờ nghiệm thu",
  },
  {
    value: "IN_PROGRESS",
    label: "Đang nghiệm thu",
  },
  {
    value: "ACCEPTED",
    label: "Đạt",
  },
  {
    value: "CONDITIONAL",
    label: "Đạt có điều kiện",
  },
  {
    value: "REJECTED",
    label: "Không đạt",
  },
];

async function readJson<T>(
  response: Response,
) {
  const body = (await response
    .json()
    .catch(() => ({}))) as T & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(
      body.message ??
        `Yêu cầu thất bại (${response.status}).`,
    );
  }

  return body;
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label
      className={
        wide ? "sm:col-span-2" : ""
      }
    >
      <span className="mb-1 block text-[9px] font-bold uppercase text-slate-500">
        {label}
      </span>

      {children}
    </label>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="mb-3">
        <h4 className="text-xs font-bold text-slate-800">
          {title}
        </h4>

        {description && (
          <p className="mt-0.5 text-[10px] text-slate-500">
            {description}
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {children}
      </div>
    </div>
  );
}

const inputClass =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] outline-none focus:border-blue-500";

const textareaClass =
  "w-full rounded-lg border border-slate-200 bg-white p-2 text-[11px] outline-none focus:border-blue-500";

function equalWeights(itemCount: number, totalPercent: number = 100) {
  if (!itemCount || totalPercent <= 0) return Array(itemCount).fill(0);
  const totalHundredths = Math.round(totalPercent * 100);
  const base = Math.floor(totalHundredths / itemCount);
  return Array.from({ length: itemCount }, (_, index) =>
    (index === itemCount - 1 ? totalHundredths - base * (itemCount - 1) : base) / 100,
  );
}

function formatFileSize(
  bytes: number,
) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(2)} MB`;
}

export function ContractItemsSection({
  contractId,
  onContractChanged,
}: {
  contractId: string;
  onContractChanged: () => Promise<void>;
}) {
  const request = useTcmsTransport();

  const [items, setItems] = useState<
    ContractItem[]
  >([]);
  const [workScopes, setWorkScopes] = useState<WorkScope[]>([]);

  const [summary, setSummary] =
    useState<ContractItemSummary | null>(
      null,
    );

  const [capabilities, setCapabilities] = useState({
    canUpdateIdentity: false,
    canUpdateProgress: false,
  });

  const [trackingItem, setTrackingItem] = useState<ContractItem | null>(null);
  const [tracking, setTracking] = useState<ContractItemTracking | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingSaving, setTrackingSaving] = useState(false);
  const [dailyLogDate, setDailyLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dailyLogNote, setDailyLogNote] = useState("");

  const [editing, setEditing] =
    useState<ContractItem | null>(null);

  const [form, setForm] =
    useState<ContractItemInput>(
      emptyItem,
    );

  const [open, setOpen] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  // PDF import preview
  const [pdfOpen, setPdfOpen] =
    useState(false);

  const [pdfFile, setPdfFile] =
    useState<File | null>(null);

  const [
    pdfPreview,
    setPdfPreview,
  ] =
    useState<PdfImportPreviewResponse | null>(
      null,
    );

  const [
    pdfLoading,
    setPdfLoading,
  ] = useState(false);

  const [
    pdfError,
    setPdfError,
  ] = useState<string | null>(null);

  const [redactionConfirmed, setRedactionConfirmed] = useState(false);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [weightAllocationMethod, setWeightAllocationMethod] =
    useState<ContractItemWeightAllocationMethod>("EQUAL");
  const [suggestedWeights, setSuggestedWeights] = useState<Record<string, number | null>>({});

  const load = useCallback(
    async () => {
      try {
        setError(null);

        const [data, scopeData] = await Promise.all([readJson<{
          items: ContractItem[];
          summary: ContractItemSummary;
          capabilities: { canUpdateIdentity: boolean; canUpdateProgress: boolean };
        }>(
          await request(
            `/api/tcms/contracts/${encodeURIComponent(
              contractId,
            )}/items`,
            {
              cache: "no-store",
            },
          ),
        ), readJson<{ scopes: WorkScope[] }>(
          await request(`/api/tcms/contracts/${encodeURIComponent(contractId)}/scopes`, { cache: "no-store" }),
        )]);

        setItems(data.items);
        setSummary(data.summary);
        setCapabilities(data.capabilities);
        setWorkScopes(scopeData.scopes);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Không thể tải hạng mục.",
        );
      } finally {
        setLoading(false);
      }
    },
    [request, contractId],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  async function reloadWorkScopes() {
    try {
      const scopeData = await readJson<{ scopes: WorkScope[] }>(
        await request(`/api/tcms/contracts/${encodeURIComponent(contractId)}/scopes`, {
          cache: "no-store",
        }),
      );

      setWorkScopes(scopeData.scopes);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Không thể tải phạm vi công việc.",
      );
    }
  }

  function startCreate() {
    setEditing(null);

    setForm({
      ...emptyItem,
    });

    setOpen(true);
    setError(null);
    void reloadWorkScopes();
  }

  function startEdit(
    item: ContractItem,
  ) {
    setEditing(item);

    const {
      id: _,
      contractId: __,
      sequenceNumber: ___,
      version: ____,
      ...input
    } = item;

    void _;
    void __;
    void ___;
    void ____;

    setForm(input);
    setOpen(true);
    setError(null);
    void reloadWorkScopes();
  }

  function startPdfImport() {
    setPdfFile(null);
    setPdfPreview(null);
    setPdfError(null);
    setRedactionConfirmed(false);
    setWeightAllocationMethod("EQUAL");
    setSuggestedWeights({});
    setPdfOpen(true);
  }

  function set<
    K extends keyof ContractItemInput,
  >(
    key: K,
    value: ContractItemInput[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function number(
    key:
      | "quantity"
      | "completedQuantity"
      | "completionDurationDays"
      | "weightPercent"
      | "progressPercent",
    value: string,
  ) {
    set(
      key,
      value === ""
        ? undefined
        : Number(value),
    );
  }

  async function submit(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    setSaving(true);
    setError(null);

    try {
      const url = editing
        ? `/api/tcms/contracts/${contractId}/items/${editing.id}`
        : `/api/tcms/contracts/${contractId}/items`;

      const body = editing
        ? {
            item: form,
            expectedVersion:
              editing.version,
          }
        : form;

      await readJson(
        await request(url, {
          method: editing
            ? "PUT"
            : "POST",

          headers: {
            "content-type":
              "application/json",
          },

          body: JSON.stringify(body),
        }),
      );

      setOpen(false);

      await Promise.all([
        load(),
        onContractChanged(),
      ]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Không thể lưu hạng mục.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function analyzePdf() {
    if (!pdfFile) {
      setPdfError(
        "Vui lòng chọn file PDF trước.",
      );

      return;
    }

    setPdfLoading(true);
    setPdfError(null);
    setPdfPreview(null);

    try {
      const body = new FormData();

      body.append(
        "file",
        pdfFile,
      );

      body.append("redactionConfirmed", String(redactionConfirmed));

      const result =
        await readJson<PdfImportPreviewResponse>(
          await request(
            `/api/tcms/contracts/${encodeURIComponent(
              contractId,
            )}/items/import/preview`,
            {
              method: "POST",
              body,
            },
          ),
        );

      const existingWeightTotal = summary?.allocatedWeightPercent ?? items.reduce((sum, item) => sum + item.weightPercent, 0);
      const availableWeightPercent = Math.max(0, Math.round((100 - existingWeightTotal) * 100) / 100);
      const weights = equalWeights(result.drafts.length, availableWeightPercent);
      setSuggestedWeights(Object.fromEntries(result.drafts.map((draft, idx) => [draft.draftId, weights[idx] ?? draft.weightPercent])));
      setPdfPreview({
        ...result,
        drafts: result.drafts.map((draft, index) => ({ ...draft, weightPercent: weights[index] ?? draft.weightPercent })),
      });
    } catch (e) {
      setPdfError(
        e instanceof Error
          ? e.message
          : "Không thể phân tích PDF.",
      );
    } finally {
      setPdfLoading(false);
    }
  }

  function draftProblems(draft: ContractItemImportDraft) {
    const problems: string[] = [];
    if (!draft.serviceDescription.trim()) problems.push("Thiếu tên hạng mục");
    if (draft.weightPercent === null) problems.push("Thiếu trọng số");
    else if (draft.weightPercent < 0 || draft.weightPercent > 100) problems.push("Trọng số không hợp lệ");
    if (draft.quantity !== null && draft.quantity < 0) problems.push("Khối lượng không hợp lệ");
    return problems;
  }

  function updateDraft<K extends keyof ContractItemImportDraft>(index: number, key: K, value: ContractItemImportDraft[K]) {
    if (key === "weightPercent" && weightAllocationMethod === "MANUAL") {
      const draftId = pdfPreview?.drafts[index]?.draftId;
      if (draftId) setSuggestedWeights((current) => ({ ...current, [draftId]: value as number | null }));
    }
    setPdfPreview((current) => current ? {
      ...current,
      drafts: current.drafts.map((draft, draftIndex) => draftIndex === index ? { ...draft, [key]: value } : draft),
    } : current);
  }

  function selectWeightAllocationMethod(method: ContractItemWeightAllocationMethod) {
    const existingWeightTotal = summary?.allocatedWeightPercent ?? items.reduce((sum, item) => sum + item.weightPercent, 0);
    const availableWeightPercent = Math.max(0, Math.round((100 - existingWeightTotal) * 100) / 100);
    setWeightAllocationMethod(method);
    if (method === "EQUAL") {
      setPdfPreview((current) => {
        if (!current) return current;
        const weights = equalWeights(current.drafts.length, availableWeightPercent);
        return { ...current, drafts: current.drafts.map((draft, index) => ({ ...draft, weightPercent: weights[index] })) };
      });
    } else {
      setPdfPreview((current) => current ? {
        ...current,
        drafts: current.drafts.map((draft) => ({ ...draft, weightPercent: suggestedWeights[draft.draftId] ?? null })),
      } : current);
    }
  }

  function removeDraft(index: number) {
    const existingWeightTotal = summary?.allocatedWeightPercent ?? items.reduce((sum, item) => sum + item.weightPercent, 0);
    const availableWeightPercent = Math.max(0, Math.round((100 - existingWeightTotal) * 100) / 100);
    setPdfPreview((current) => {
      if (!current) return current;
      const drafts = current.drafts.filter((_, draftIndex) => draftIndex !== index);
      if (weightAllocationMethod !== "EQUAL") return { ...current, drafts };
      const weights = equalWeights(drafts.length, availableWeightPercent);
      return { ...current, drafts: drafts.map((draft, draftIndex) => ({ ...draft, weightPercent: weights[draftIndex] })) };
    });
  }

  async function openTracking(item: ContractItem) {
    setTrackingItem(item);
    setTracking(null);
    setTrackingLoading(true);
    setError(null);
    try {
      const data = await readJson<{ tracking: ContractItemTracking; capabilities: { canUpdateProgress: boolean } }>(
        await request(`/api/tcms/contracts/${encodeURIComponent(contractId)}/items/${encodeURIComponent(item.id)}/tracking`, { cache: "no-store" }),
      );
      setTracking(data.tracking);
      setCapabilities((current) => ({ ...current, canUpdateProgress: data.capabilities.canUpdateProgress }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải checklist và nhật ký.");
      setTrackingItem(null);
    } finally {
      setTrackingLoading(false);
    }
  }

  async function toggleChecklist(checklistItemId: string, expectedVersion: number, isCompleted: boolean) {
    if (!trackingItem) return;
    setTrackingSaving(true);
    setError(null);
    try {
      await readJson(await request(
        `/api/tcms/contracts/${encodeURIComponent(contractId)}/items/${encodeURIComponent(trackingItem.id)}/checklist/${encodeURIComponent(checklistItemId)}`,
        { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ isCompleted, expectedVersion }) },
      ));
      await openTracking(trackingItem);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể cập nhật checklist.");
    } finally {
      setTrackingSaving(false);
    }
  }

  async function appendDailyLog(event: React.FormEvent) {
    event.preventDefault();
    if (!trackingItem || !dailyLogNote.trim()) return;
    setTrackingSaving(true);
    setError(null);
    try {
      await readJson(await request(
        `/api/tcms/contracts/${encodeURIComponent(contractId)}/items/${encodeURIComponent(trackingItem.id)}/daily-logs`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ logDate: dailyLogDate, note: dailyLogNote }) },
      ));
      setDailyLogNote("");
      await openTracking(trackingItem);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể thêm nhật ký.");
    } finally {
      setTrackingSaving(false);
    }
  }

  async function confirmPdfImport() {
    if (!pdfPreview?.drafts.length) return;
    const existingWeightTotal = summary?.allocatedWeightPercent ?? items.reduce((sum, item) => sum + item.weightPercent, 0);
    const availableWeightPercent = Math.max(0, Math.round((100 - existingWeightTotal) * 100) / 100);

    const invalid = pdfPreview.drafts.flatMap(draftProblems);
    const importWeightTotal = pdfPreview.drafts.reduce((sum, draft) => sum + (draft.weightPercent ?? 0), 0);
    const totalAfterImport = existingWeightTotal + importWeightTotal;

    if (totalAfterImport > 100.005) {
      invalid.push(`Tổng trọng số sau khi nhập (${totalAfterImport.toFixed(2)}%) vượt quá 100.00%`);
    } else if (availableWeightPercent > 0 && Math.abs(importWeightTotal - availableWeightPercent) > 0.005) {
      invalid.push(`Tổng trọng số các mục nhập (${importWeightTotal.toFixed(2)}%) phải bằng trọng số khả dụng (${availableWeightPercent.toFixed(2)}%)`);
    }

    if (invalid.length) {
      setPdfError("Còn dữ liệu chưa hợp lệ: " + invalid.join("; ") + ".");
      return;
    }

    setPdfImporting(true);
    setPdfError(null);
    try {
      const items: ContractItemInput[] = pdfPreview.drafts.map((draft) => ({
        itemCode: draft.itemCode || undefined,
        groupCode: draft.groupCode || undefined,
        groupName: draft.groupName || undefined,
        serviceDescription: draft.serviceDescription,
        workContent: draft.workContent || undefined,
        checklistItems: draft.checklistItems,
        quantity: draft.quantity ?? undefined,
        unit: draft.unit || undefined,
        completionDurationDays: draft.completionDurationDays ?? undefined,
        weightPercent: draft.weightPercent as number,
        progressPercent: draft.progressPercent,
        plannedStartDate: draft.plannedStartDate || undefined,
        plannedEndDate: draft.plannedEndDate || undefined,
        status: draft.status,
      }));
      await readJson(await request(`/api/tcms/contracts/${encodeURIComponent(contractId)}/items/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, weightAllocationMethod }),
      }));
      setPdfOpen(false);
      await Promise.all([load(), onContractChanged()]);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : "Không thể nhập các hạng mục.");
    } finally {
      setPdfImporting(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Hạng mục hợp đồng
          </h2>

          <p className="mt-0.5 text-[10px] text-slate-500">
            Theo dõi khối lượng,
            trọng số và tiến độ đánh
            giá từng hạng mục.
          </p>
        </div>

        {capabilities.canUpdateIdentity && <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={startPdfImport}
            className="h-9 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
          >
            Nhập từ PDF
          </button>

          <button
            type="button"
            onClick={startCreate}
            className="h-9 rounded-lg bg-blue-700 px-3 text-[11px] font-semibold text-white hover:bg-blue-800"
          >
            + Thêm hạng mục
          </button>
        </div>}
      </div>

      <div className="p-4">
        {/* Summary */}
        {summary && (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                [
                  "Tổng hạng mục",
                  summary.totalItems,
                ],

                [
                  "Đã hoàn thành",
                  summary.completedItems,
                ],

                [
                  "Trọng số",
                  `${summary.allocatedWeightPercent}% / 100%`,
                ],

                [
                  "Tiến độ tổng hợp",
                  summary.weightedProgressPercent ===
                  null
                    ? "Chưa xác định"
                    : `${summary.weightedProgressPercent.toFixed(
                        2,
                      )}%`,
                ],
              ].map(
                ([
                  label,
                  value,
                ]) => (
                  <div
                    key={String(
                      label,
                    )}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <p className="text-[9px] font-bold uppercase text-slate-400">
                      {label}
                    </p>

                    <p className="mt-1 text-sm font-bold text-slate-800">
                      {value}
                    </p>
                  </div>
                ),
              )}
            </div>

            {!summary.weightComplete && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-700">
                Chưa phân bổ đủ trọng
                số (
                {
                  summary.allocatedWeightPercent
                }
                % / 100%).
              </p>
            )}
          </>
        )}

        {/* Error */}
        {error && (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">
            {error}
          </p>
        )}

        {/* Table */}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[10px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {[
                  "STT/Mã",
                  "Phạm vi",
                  "Hạng mục",
                  "Khối lượng",
                  "ĐVT",
                  "Trọng số",
                  "Tiến độ đánh giá",
                  "Thời hạn",
                  "Trạng thái",
                  "Thao tác",
                ].map((x) => (
                  <th
                    key={x}
                    className="border-y border-slate-200 px-2 py-2 font-bold"
                  >
                    {x}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {items.map(
                (item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-100"
                  >
                    <td className="px-2 py-2 font-semibold">
                      {item.itemCode ||
                        item.sequenceNumber}
                    </td>

                    <td className="px-2 py-2">
                      {item.workScopeId
                        ? workScopes.find((scope) => scope.id === item.workScopeId)?.name ?? "Phạm vi đã liên kết"
                        : "-"}
                    </td>

                    <td className="max-w-xs px-2 py-2">
                      <p className="font-semibold text-slate-800">
                        {
                          item.serviceDescription
                        }
                      </p>

                      {item.groupName && (
                        <p className="text-slate-400">
                          {item.groupCode
                            ? `${item.groupCode} - `
                            : ""}

                          {
                            item.groupName
                          }
                        </p>
                      )}
                    </td>

                    <td className="px-2 py-2">
                      {item.completedQuantity ??
                        0}{" "}
                      /{" "}
                      {item.quantity ??
                        "-"}
                    </td>

                    <td className="px-2 py-2">
                      {item.unit || "-"}
                    </td>

                    <td className="px-2 py-2">
                      {
                        item.weightPercent
                      }
                      %
                    </td>

                    <td className="px-2 py-2 font-semibold text-blue-700">
                      {
                        item.progressPercent
                      }
                      %
                    </td>

                    <td className="px-2 py-2">
                      {item.plannedEndDate
                        ? formatDate(item.plannedEndDate)
                        : `${
                            item.completionDurationDays ??
                            "-"
                          } ngày`}
                    </td>

                    <td className="px-2 py-2">
                      {
                        statusLabels[
                          item.status
                        ]
                      }
                    </td>

                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => void openTracking(item)}
                        className="mr-3 font-semibold text-emerald-700 hover:underline"
                      >
                        Chi tiết
                      </button>

                      {(capabilities.canUpdateIdentity || capabilities.canUpdateProgress) && <button
                        type="button"
                        onClick={() =>
                          startEdit(
                            item,
                          )
                        }
                        className="font-semibold text-blue-700 hover:underline"
                      >
                        Chỉnh sửa
                      </button>}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>

          {loading && (
            <p className="py-4 text-center text-[10px] text-slate-500">
              Đang tải hạng
              mục...
            </p>
          )}

          {!loading &&
            !items.length && (
              <p className="py-4 text-center text-[10px] text-slate-500">
                Chưa có hạng mục
                hợp đồng.
              </p>
            )}
        </div>

        {trackingItem && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-slate-900">Chi tiết: {trackingItem.serviceDescription}</h3>
                <p className="mt-1 text-[10px] text-slate-500">
                  Tiến độ đánh giá chính thức vẫn là {trackingItem.progressPercent}%; checklist chỉ là KPI tham khảo.
                </p>
              </div>
              <button type="button" onClick={() => { setTrackingItem(null); setTracking(null); }} className="text-[10px] font-semibold text-slate-500">Đóng</button>
            </div>

            {trackingLoading && <p className="mt-3 text-[10px] text-slate-500">Đang tải chi tiết...</p>}
            {tracking && (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-bold text-slate-800">Checklist nội dung công việc</h4>
                    <span className="text-[10px] font-bold text-blue-700">
                      {tracking.checklistCompletionPercent === null ? "Chưa có" : `${tracking.checklistCompletionPercent.toFixed(0)}%`}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {tracking.checklistItems.map((checklistItem) => (
                      <label key={checklistItem.id} className="flex items-start gap-2 rounded-lg border border-slate-100 p-2 text-[10px] text-slate-700">
                        <input
                          type="checkbox"
                          checked={checklistItem.isCompleted}
                          disabled={!capabilities.canUpdateProgress || trackingSaving}
                          onChange={(event) => void toggleChecklist(checklistItem.id, checklistItem.version, event.target.checked)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className={checklistItem.isCompleted ? "line-through text-slate-400" : ""}>{checklistItem.sequenceNumber}. {checklistItem.description}</span>
                          {checklistItem.completedAt && <span className="mt-0.5 block text-[9px] text-slate-400">Hoàn thành: {new Date(checklistItem.completedAt).toLocaleString("vi-VN")} · {checklistItem.completedBy}</span>}
                        </span>
                      </label>
                    ))}
                    {!tracking.checklistItems.length && <p className="text-[10px] text-slate-500">Chưa có checklist cho hạng mục này.</p>}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <h4 className="text-[11px] font-bold text-slate-800">Nhật ký tình trạng hằng ngày</h4>
                  {capabilities.canUpdateProgress && (
                    <form onSubmit={appendDailyLog} className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
                      <VietnameseDateInput
                        required
                        value={dailyLogDate}
                        onChange={(val) => setDailyLogDate(val ?? "")}
                      />
                      <textarea required rows={3} className={textareaClass} value={dailyLogNote} onChange={(event) => setDailyLogNote(event.target.value)} placeholder="Cập nhật tình trạng hôm nay..." />
                      <div className="flex justify-end"><button disabled={trackingSaving || !dailyLogNote.trim()} className="h-8 rounded-lg bg-blue-700 px-3 text-[10px] font-semibold text-white disabled:opacity-40">Thêm nhật ký</button></div>
                    </form>
                  )}
                  <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                    {tracking.dailyLogs.map((log) => (
                      <article key={log.id} className="rounded-lg border border-slate-100 p-2 text-[10px]">
                        <p className="font-bold text-slate-700">{formatDate(log.logDate)} · {log.createdBy}</p>
                        <p className="mt-1 whitespace-pre-wrap text-slate-600">{log.note}</p>
                        <p className="mt-1 text-[9px] text-slate-400">{new Date(log.createdAt).toLocaleString("vi-VN")}</p>
                      </article>
                    ))}
                    {!tracking.dailyLogs.length && <p className="text-[10px] text-slate-500">Chưa có nhật ký.</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PDF import modal */}
      {pdfOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Nhập hạng mục từ PDF</h3>
                <p className="mt-1 text-[10px] text-slate-500">AI nhận diện → kiểm tra/sửa → xác nhận mới ghi vào dữ liệu hợp đồng.</p>
              </div>
              <button type="button" onClick={() => setPdfOpen(false)} className="text-sm text-slate-500 hover:text-slate-800">Đóng</button>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold text-slate-800">1. Chọn PDF đã loại thông tin nhạy cảm</p>
              <p className="mt-1 text-[10px] text-slate-500">PDF sẽ được gửi tới nhà cung cấp AI cấu hình trên máy chủ. OCR local chỉ là fallback khi AI không khả dụng.</p>
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="mt-3 block w-full text-[11px] text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-[11px] file:font-semibold file:text-blue-700"
                onChange={(event) => {
                  setPdfFile(event.target.files?.[0] ?? null);
                  setPdfPreview(null);
                  setPdfError(null);
                }}
              />
              {pdfFile && <p className="mt-2 text-[10px] font-semibold text-slate-700">{pdfFile.name} · {formatFileSize(pdfFile.size)}</p>}
              <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-800">
                <input type="checkbox" checked={redactionConfirmed} onChange={(event) => setRedactionConfirmed(event.target.checked)} className="mt-0.5" />
                <span>Tôi xác nhận file này đã loại thông tin nhạy cảm, bí mật, dữ liệu cá nhân và thông tin không được phép gửi ra dịch vụ AI.</span>
              </label>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  disabled={!pdfFile || !redactionConfirmed || pdfLoading}
                  onClick={() => void analyzePdf()}
                  className="h-9 rounded-lg bg-blue-700 px-4 text-[11px] font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pdfLoading ? "Đang phân tích..." : "Phân tích bằng AI"}
                </button>
              </div>
            </div>

            {pdfError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{pdfError}</div>}

            {pdfPreview && (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] text-emerald-700">
                  {pdfPreview.message} Nguồn: {pdfPreview.provider.id}{pdfPreview.provider.model ? ` / ${pdfPreview.provider.model}` : ""}.
                </div>

                {pdfPreview.drafts.length > 0 && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-bold text-slate-800">2. Kiểm tra và chỉnh sửa {pdfPreview.drafts.length} hạng mục</p>
                      <p className="mt-1 text-[10px] text-slate-500">AI chỉ đề xuất. Các trường thiếu để trống; người dùng chịu trách nhiệm đối chiếu với hợp đồng trước khi nhập.</p>
                    </div>
                    {(() => {
                      const existingWeightTotal = summary?.allocatedWeightPercent ?? items.reduce((sum, item) => sum + item.weightPercent, 0);
                      const availableWeightPercent = Math.max(0, Math.round((100 - existingWeightTotal) * 100) / 100);
                      const importWeightTotal = pdfPreview.drafts.reduce((sum, draft) => sum + (draft.weightPercent ?? 0), 0);
                      const totalAfterImport = existingWeightTotal + importWeightTotal;
                      const isWeightValid = availableWeightPercent > 0
                        ? Math.abs(importWeightTotal - availableWeightPercent) <= 0.005
                        : importWeightTotal === 0;

                      return (
                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                          <p className="text-[10px] font-bold uppercase text-blue-800">3. Phương pháp phân bổ trọng số</p>
                          <div className="mt-2 flex flex-wrap gap-4 text-[10px] text-slate-700">
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                disabled={availableWeightPercent <= 0}
                                checked={weightAllocationMethod === "EQUAL"}
                                onChange={() => selectWeightAllocationMethod("EQUAL")}
                              />
                              Chia đều trọng số khả dụng ({availableWeightPercent.toFixed(2)}%) cho {pdfPreview.drafts.length} hạng mục
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                checked={weightAllocationMethod === "MANUAL"}
                                onChange={() => selectWeightAllocationMethod("MANUAL")}
                              />
                              Nhập trọng số thủ công
                            </label>
                          </div>
                          <div className="mt-2 space-y-1 text-[11px]">
                            {existingWeightTotal > 0 && (
                              <p className="text-slate-600">
                                • Trọng số hạng mục đã có trong hợp đồng: <span className="font-semibold text-slate-900">{existingWeightTotal.toFixed(2)}%</span> (trọng số còn lại khả dụng: <span className="font-semibold text-blue-800">{availableWeightPercent.toFixed(2)}%</span>)
                              </p>
                            )}
                            {availableWeightPercent <= 0 ? (
                              <p className="font-bold text-red-600">
                                ⚠ Hợp đồng đã phân bổ đủ 100.00% trọng số cho các hạng mục hiện có. Không còn trọng số khả dụng (0.00%) để nhập thêm. Vui lòng giảm trọng số của hạng mục cũ nếu muốn nhập thêm hạng mục từ PDF.
                              </p>
                            ) : (
                              <p className={`font-bold ${isWeightValid ? "text-emerald-700" : "text-red-700"}`}>
                                Tổng trọng số các mục nhập: {importWeightTotal.toFixed(2)}% / Khả dụng: {availableWeightPercent.toFixed(2)}% (Tổng sau nhập: {totalAfterImport.toFixed(2)}% / 100.00%)
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    {pdfPreview.drafts.map((draft, index) => {
                      const problems = draftProblems(draft);
                      return (
                        <div key={draft.draftId} className="rounded-xl border border-slate-200 p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <p className="text-xs font-bold text-slate-800">Hạng mục {index + 1}</p>
                            <button type="button" onClick={() => removeDraft(index)} className="text-[10px] font-semibold text-red-600">Loại khỏi danh sách</button>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Field label="Mã hạng mục"><input className={inputClass} value={draft.itemCode} onChange={(e) => updateDraft(index, "itemCode", e.target.value)} /></Field>
                            <Field label="Nhóm"><input className={inputClass} value={draft.groupName} onChange={(e) => updateDraft(index, "groupName", e.target.value)} /></Field>
                            <Field label="Tên/nội dung hạng mục" wide><input className={inputClass} value={draft.serviceDescription} onChange={(e) => updateDraft(index, "serviceDescription", e.target.value)} /></Field>
                            <Field label="Khối lượng"><input type="number" min="0" step="any" className={inputClass} value={draft.quantity ?? ""} onChange={(e) => updateDraft(index, "quantity", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                            <Field label="Đơn vị"><input className={inputClass} value={draft.unit} onChange={(e) => updateDraft(index, "unit", e.target.value)} /></Field>
                            <Field label="Trọng số (%)"><input type="number" min="0" max="100" step="0.01" disabled={weightAllocationMethod === "EQUAL"} className={inputClass} value={draft.weightPercent ?? ""} onChange={(e) => updateDraft(index, "weightPercent", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                            <Field label="Thời lượng (ngày)"><input type="number" min="1" step="1" className={inputClass} value={draft.completionDurationDays ?? ""} onChange={(e) => updateDraft(index, "completionDurationDays", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                            <Field label="Ngày bắt đầu KH">
                              <VietnameseDateInput
                                value={draft.plannedStartDate}
                                onChange={(val) => updateDraft(index, "plannedStartDate", val ?? "")}
                              />
                            </Field>
                            <Field label="Ngày kết thúc KH">
                              <VietnameseDateInput
                                value={draft.plannedEndDate}
                                onChange={(val) => updateDraft(index, "plannedEndDate", val ?? "")}
                              />
                            </Field>
                            <Field label="Nội dung chi tiết" wide><textarea rows={2} className={textareaClass} value={draft.workContent} onChange={(e) => updateDraft(index, "workContent", e.target.value)} /></Field>
                          </div>
                          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] font-bold text-slate-700">Checklist sẽ tạo khi xác nhận nhập</p>
                              <button type="button" onClick={() => updateDraft(index, "checklistItems", [...draft.checklistItems, ""])} className="text-[10px] font-semibold text-blue-700">+ Thêm nội dung</button>
                            </div>
                            <div className="mt-2 space-y-2">
                              {draft.checklistItems.map((description, checklistIndex) => (
                                <div key={`${draft.draftId}-checklist-${checklistIndex}`} className="flex items-center gap-2">
                                  <span className="w-5 text-[10px] font-bold text-slate-400">{checklistIndex + 1}.</span>
                                  <input className={inputClass} value={description} onChange={(event) => updateDraft(index, "checklistItems", draft.checklistItems.map((entry, entryIndex) => entryIndex === checklistIndex ? event.target.value : entry))} />
                                  <button type="button" onClick={() => updateDraft(index, "checklistItems", draft.checklistItems.filter((_, entryIndex) => entryIndex !== checklistIndex))} className="text-[10px] font-semibold text-red-600">Bỏ</button>
                                </div>
                              ))}
                              {!draft.checklistItems.length && <p className="text-[10px] text-slate-500">Không có nội dung công việc để tạo checklist.</p>}
                            </div>
                          </div>
                          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-[10px] text-slate-600">
                            <p><b>Căn cứ:</b> {draft.evidence || "Không có trích dẫn"}{draft.sourcePage ? ` (trang ${draft.sourcePage})` : ""}</p>
                            <p className="mt-1"><b>Độ tin cậy AI:</b> {draft.confidence === null ? "Không xác định" : `${Math.round(draft.confidence * 100)}%`}</p>
                          </div>
                          {problems.length > 0 && <p className="mt-2 text-[10px] font-semibold text-red-600">Cần sửa: {problems.join("; ")}.</p>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {pdfPreview.extraction.textPreview && (
                  <div className="rounded-xl border border-slate-200">
                    <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-700">Nội dung đọc bằng fallback local</p>
                    <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap break-words p-3 text-[10px] leading-5 text-slate-700">{pdfPreview.extraction.textPreview}</pre>
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button type="button" onClick={() => setPdfOpen(false)} className="h-9 rounded-lg border border-slate-200 px-4 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">Đóng</button>
              {pdfPreview?.drafts.length ? (() => {
                const existingWeightTotal = summary?.allocatedWeightPercent ?? items.reduce((sum, item) => sum + item.weightPercent, 0);
                const availableWeightPercent = Math.max(0, Math.round((100 - existingWeightTotal) * 100) / 100);
                const importWeightTotal = pdfPreview.drafts.reduce((sum, draft) => sum + (draft.weightPercent ?? 0), 0);
                const isWeightValid = availableWeightPercent > 0
                  ? Math.abs(importWeightTotal - availableWeightPercent) <= 0.005
                  : false;
                return (
                  <button
                    type="button"
                    disabled={pdfImporting || availableWeightPercent <= 0 || !isWeightValid}
                    onClick={() => void confirmPdfImport()}
                    className="h-9 rounded-lg bg-emerald-700 px-4 text-[11px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-40"
                  >
                    {pdfImporting ? "Đang nhập..." : `Xác nhận nhập ${pdfPreview.drafts.length} hạng mục`}
                  </button>
                );
              })() : null}
            </div>
          </div>
        </div>
      )}

      {/* Contract item modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={submit}
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editing
                    ? "Chỉnh sửa hạng mục"
                    : "Thêm hạng mục"}
                </h3>

                <p className="mt-1 text-[10px] text-slate-500">
                  {editing
                    ? "Cập nhật thông tin và tình hình thực hiện hạng mục."
                    : "Khai báo thông tin ban đầu của hạng mục hợp đồng."}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setOpen(false)
                }
                className="text-sm text-slate-500 hover:text-slate-800"
              >
                Đóng
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <FormSection
                title="1. Thông tin hạng mục"
                description="Thông tin cơ bản theo phạm vi hợp đồng."
              >
                <Field label="Mã/STT">
                  <input
                    className={
                      inputClass
                    }
                    value={
                      form.itemCode ??
                      ""
                    }
                    onChange={(
                      e,
                    ) =>
                      set(
                        "itemCode",
                        e.target
                          .value,
                      )
                    }
                  />
                </Field>

                <Field
                  label="Mô tả dịch vụ/Hạng mục"
                  wide
                >
                  <input
                    required
                    className={
                      inputClass
                    }
                    value={
                      form.serviceDescription
                    }
                    onChange={(
                      e,
                    ) =>
                      set(
                        "serviceDescription",
                        e.target
                          .value,
                      )
                    }
                  />
                </Field>

                <Field
                  label="Nội dung/Phạm vi công việc"
                  wide
                >
                  <textarea
                    className={`${textareaClass} min-h-20`}
                    value={
                      form.workContent ??
                      ""
                    }
                    onChange={(
                      e,
                    ) =>
                      set(
                        "workContent",
                        e.target
                          .value,
                      )
                    }
                  />
                </Field>

                <Field label="Phạm vi công việc">
                  <select
                    className={inputClass}
                    value={form.workScopeId ?? ""}
                    onChange={(e) => set("workScopeId", e.target.value || undefined)}
                  >
                    <option value="">Không gắn phạm vi</option>
                    {workScopes.map((scope) => (
                      <option key={scope.id} value={scope.id}>
                        {scope.code ? `${scope.code} - ` : ""}{scope.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Khối lượng theo hợp đồng">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className={
                      inputClass
                    }
                    value={
                      form.quantity ??
                      ""
                    }
                    onChange={(
                      e,
                    ) =>
                      number(
                        "quantity",
                        e.target
                          .value,
                      )
                    }
                  />
                </Field>

                <Field label="Đơn vị tính">
                  <input
                    className={
                      inputClass
                    }
                    value={
                      form.unit ??
                      ""
                    }
                    onChange={(
                      e,
                    ) =>
                      set(
                        "unit",
                        e.target
                          .value,
                      )
                    }
                  />
                </Field>
              </FormSection>

              <FormSection
                title="2. Phân lô (nếu có)"
                description="Chỉ khai báo đối với hợp đồng có chia lô. Hợp đồng thông thường có thể để trống."
              >
                <Field label="Mã lô (nếu có)">
                  <input
                    className={
                      inputClass
                    }
                    value={
                      form.groupCode ??
                      ""
                    }
                    onChange={(
                      e,
                    ) =>
                      set(
                        "groupCode",
                        e.target
                          .value,
                      )
                    }
                  />
                </Field>

                <Field label="Tên lô (nếu có)">
                  <input
                    className={
                      inputClass
                    }
                    value={
                      form.groupName ??
                      ""
                    }
                    onChange={(
                      e,
                    ) =>
                      set(
                        "groupName",
                        e.target
                          .value,
                      )
                    }
                  />
                </Field>
              </FormSection>

              <FormSection
                title="3. Trọng số và kế hoạch"
                description="Trọng số dùng để tự động tổng hợp tiến độ toàn hợp đồng."
              >
                <Field label="Trọng số hạng mục (%)">
                  <input
                    required
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    className={
                      inputClass
                    }
                    value={
                      form.weightPercent
                    }
                    onChange={(
                      e,
                    ) =>
                      number(
                        "weightPercent",
                        e.target
                          .value,
                      )
                    }
                  />
                </Field>

                <Field label="Số ngày hoàn thành">
                  <input
                    type="number"
                    min="1"
                    className={
                      inputClass
                    }
                    value={
                      form.completionDurationDays ??
                      ""
                    }
                    onChange={(
                      e,
                    ) =>
                      number(
                        "completionDurationDays",
                        e.target
                          .value,
                      )
                    }
                  />
                </Field>

                <Field label="Bắt đầu kế hoạch">
                  <VietnameseDateInput
                    value={form.plannedStartDate}
                    onChange={(val) => set("plannedStartDate", val)}
                  />
                </Field>

                <Field label="Kết thúc kế hoạch">
                  <VietnameseDateInput
                    value={form.plannedEndDate}
                    onChange={(val) => set("plannedEndDate", val)}
                  />
                </Field>
              </FormSection>

              {editing && (
                <FormSection
                  title="4. Cập nhật thực hiện"
                  description="Tiến độ đánh giá là nhận định của người giám sát/theo dõi hợp đồng, không tự động suy ra từ tỷ lệ khối lượng."
                >
                  <Field label="Khối lượng đã thực hiện">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className={
                        inputClass
                      }
                      value={
                        form.completedQuantity ??
                        ""
                      }
                      onChange={(
                        e,
                      ) =>
                        number(
                          "completedQuantity",
                          e.target
                            .value,
                        )
                      }
                    />
                  </Field>

                  <Field label="Tiến độ đánh giá (%)">
                    <input
                      required
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      className={
                        inputClass
                      }
                      value={
                        form.progressPercent
                      }
                      onChange={(
                        e,
                      ) =>
                        number(
                          "progressPercent",
                          e.target
                            .value,
                        )
                      }
                    />
                  </Field>

                  <Field label="Trạng thái thực hiện">
                    <select
                      className={
                        inputClass
                      }
                      value={
                        form.status
                      }
                      onChange={(
                        e,
                      ) =>
                        set(
                          "status",
                          e.target
                            .value as ContractItemStatus,
                        )
                      }
                    >
                      {Object.entries(
                        statusLabels,
                      ).map(
                        ([
                          value,
                          label,
                        ]) => (
                          <option
                            key={
                              value
                            }
                            value={
                              value
                            }
                          >
                            {
                              label
                            }
                          </option>
                        ),
                      )}
                    </select>
                  </Field>

                  <Field label="Trạng thái nghiệm thu">
                    <select
                      className={
                        inputClass
                      }
                      value={
                        form.acceptanceStatus ??
                        ""
                      }
                      onChange={(
                        e,
                      ) =>
                        set(
                          "acceptanceStatus",
                          e.target
                            .value,
                        )
                      }
                    >
                      {acceptanceStatusOptions.map(
                        (
                          option,
                        ) => (
                          <option
                            key={
                              option.value
                            }
                            value={
                              option.value
                            }
                          >
                            {
                              option.label
                            }
                          </option>
                        ),
                      )}
                    </select>
                  </Field>

                  <Field label="Bắt đầu thực tế">
                    <VietnameseDateInput
                      value={form.actualStartDate}
                      onChange={(val) => set("actualStartDate", val)}
                    />
                  </Field>

                  <Field label="Kết thúc thực tế">
                    <VietnameseDateInput
                      value={form.actualEndDate}
                      onChange={(val) => set("actualEndDate", val)}
                    />
                  </Field>

                  <Field
                    label="Ghi chú/Nhận xét tiến độ"
                    wide
                  >
                    <textarea
                      className={`${textareaClass} min-h-20`}
                      value={
                        form.progressNote ??
                        ""
                      }
                      onChange={(
                        e,
                      ) =>
                        set(
                          "progressNote",
                          e.target
                            .value,
                        )
                      }
                      placeholder="Nhập tình hình thực hiện, công việc đã hoàn thành, tồn tại hoặc căn cứ đánh giá tiến độ..."
                    />
                  </Field>
                </FormSection>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() =>
                  setOpen(false)
                }
                className="h-9 rounded-lg border border-slate-200 px-4 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>

              <button
                disabled={saving}
                className="h-9 rounded-lg bg-blue-700 px-4 text-[11px] font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {saving
                  ? "Đang lưu..."
                  : editing
                    ? "Lưu thay đổi"
                    : "Tạo hạng mục"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
