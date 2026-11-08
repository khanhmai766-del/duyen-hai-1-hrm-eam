"use client";
import { MonthField } from "./ui/month-field";
import { GoogleMirrorLinks } from "./google-mirror-links";
import { useCtktktRequest } from "@/hooks/useCtktkt";

import { useEffect, useMemo, useState } from "react";
import { Beaker, CheckCircle2, LockKeyhole, Pencil, Save, Trash2, X } from "lucide-react";
import { useSessionUser } from "@/modules/ctktkt/components/session-context";
import { editableChemicalsFor, type ChemicalCatalogItem, type ChemicalCode } from "@/modules/ctktkt/lib/chemical-usage/catalog";
import { defaultOperatingDate } from "@/modules/ctktkt/lib/operating-date";

type ChemicalRecord = {
  id: number;
  usage_date: string;
  chemical_code: ChemicalCode;
  material_code: string;
  chemical_name: string;
  unit: string;
  quantity: number;
  purpose: string;
  plant_unit: string;
  reference: string;
  entered_by_name: string;
  entered_by_position: string;
  updated_by_name?: string;
  updated_by_position?: string;
};

function currentMonth() {
  return defaultOperatingDate().slice(0, 7);
}

function formatNumber(value: number) {
  return Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 4 });
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function ChemicalUsageClient() {
  const ctktktRequest = useCtktktRequest();

  const user = useSessionUser();
  const canDeleteRecords = user.role === "admin" || user.permissions.includes("manage_users");
  const allowedCatalog = useMemo(() => editableChemicalsFor(user), [user]);
  const [month, setMonth] = useState(currentMonth);
  const [records, setRecords] = useState<ChemicalRecord[]>([]);
  const [catalog, setCatalog] = useState<readonly ChemicalCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [usageDate, setUsageDate] = useState(defaultOperatingDate);
  const [chemicalCode, setChemicalCode] = useState<string>(allowedCatalog[0]?.code || "");
  const [quantity, setQuantity] = useState("");
  const [reasonChoice, setReasonChoice] = useState<string>(allowedCatalog[0]?.suggestedReasons[0] || "");
  const [otherReason, setOtherReason] = useState("");
  const [reference, setReference] = useState("");
  const [filterChemicalCode, setFilterChemicalCode] = useState<ChemicalCode | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  async function fetchMonth(targetMonth: string) {
    try {
      const response = await ctktktRequest(`/api/ctktkt/chemical-usage?month=${targetMonth}`, { cache: "no-store" });
      const data = await response.json() as { error?: string; records?: ChemicalRecord[]; catalog?: ChemicalCatalogItem[] };
      if (!response.ok) throw new Error(data.error || "Không thể tải dữ liệu.");
      setRecords(data.records || []);
      setCatalog(data.catalog || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }

  const [trackedMonth, setTrackedMonth] = useState(month);
  if (trackedMonth !== month) {
    setTrackedMonth(month);
    setLoading(true);
    setError("");
  }

  useEffect(() => {
    let cancelled = false;
    void ctktktRequest(`/api/ctktkt/chemical-usage?month=${month}`, { cache: "no-store" })
      .then(async response => ({
        response,
        data: await response.json() as { error?: string; records?: ChemicalRecord[]; catalog?: ChemicalCatalogItem[] },
      }))
      .then(({ response, data }) => {
        if (cancelled) return;
        if (!response.ok) throw new Error(data.error || "Không thể tải dữ liệu.");
        setRecords(data.records || []);
        setCatalog(data.catalog || []);
      })
      .catch(caught => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Không thể tải dữ liệu.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [month, ctktktRequest]);

  const totals = useMemo(() => {
    const result = new Map<string, number>();
    for (const record of records) {
      result.set(record.chemical_code, (result.get(record.chemical_code) || 0) + Number(record.quantity || 0));
    }
    return result;
  }, [records]);

  const filteredRecords = useMemo(
    () => filterChemicalCode
      ? records.filter(record => record.chemical_code === filterChemicalCode)
      : records,
    [filterChemicalCode, records],
  );

  const filteredChemical = catalog.find(item => item.code === filterChemicalCode);

  async function deleteRecord(record: ChemicalRecord) {
    const approved = window.confirm(
      `Xóa bản ghi ${record.chemical_name} ngày ${formatDate(record.usage_date)}, số lượng ${formatNumber(record.quantity)} ${record.unit}? Bản ghi sẽ được ẩn khỏi nhật ký và lưu thông tin xóa để truy vết.`,
    );
    if (!approved) return;

    setDeletingId(record.id);
    setError("");
    setSuccess("");
    try {
      const response = await ctktktRequest(`/api/ctktkt/chemical-usage?id=${record.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Không thể xóa bản ghi.");
      if (editingId === record.id) cancelEdit();
      setSuccess(`Đã xóa bản ghi ${record.chemical_name} ngày ${formatDate(record.usage_date)}.`);
      await fetchMonth(month);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể xóa bản ghi.");
    } finally {
      setDeletingId(null);
    }
  }

  async function saveRecord(event: React.FormEvent) {
    event.preventDefault();
    const purpose = reasonChoice === "__other__" ? otherReason.trim() : reasonChoice;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await ctktktRequest("/api/ctktkt/chemical-usage", {
        method: editingId === null ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          usageDate,
          chemicalCode,
          quantity: Number(quantity.replace(",", ".")),
          purpose,
          reference,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Không thể lưu dữ liệu.");
      setSuccess(editingId === null ? "Đã lưu lượng hóa chất và thông tin người nhập." : "Đã cập nhật bản ghi hóa chất và lưu người chỉnh sửa.");
      setEditingId(null);
      setQuantity("");
      setOtherReason("");
      setReference("");
      const targetMonth = usageDate.slice(0, 7);
      if (targetMonth !== month) setMonth(targetMonth);
      else await fetchMonth(month);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể lưu dữ liệu.");
    } finally {
      setSaving(false);
    }
  }

  const selectedChemical = allowedCatalog.find(item => item.code === chemicalCode);

  function startEdit(record: ChemicalRecord) {
    const chemical = allowedCatalog.find(item => item.code === record.chemical_code);
    if (!chemical) return;
    setEditingId(record.id);
    setUsageDate(record.usage_date);
    setChemicalCode(record.chemical_code);
    setQuantity(String(record.quantity).replace(".", ","));
    if (chemical.suggestedReasons.some(reason => reason === record.purpose)) {
      setReasonChoice(record.purpose);
      setOtherReason("");
    } else {
      setReasonChoice("__other__");
      setOtherReason(record.purpose);
    }
    setReference(record.reference || "");
    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setQuantity("");
    setOtherReason("");
    setReference("");
    const first = allowedCatalog[0];
    setChemicalCode(first?.code || "");
    setReasonChoice(first?.suggestedReasons[0] || "");
  }

  return (
    <div className="module-report chemical-workspace mx-auto flex w-full min-w-0 flex-col gap-3">
      <section className="module-hero ktkt-dark-hero rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="module-heading-copy">
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Beaker className="size-5 shrink-0 text-[#75d4e4]" aria-hidden />THEO DÕI HÓA CHẤT</h2>
          </div>
          {/* Tháng xem + nút Google Sheets cùng một hàng (thay khung xanh riêng phía trên). */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-nowrap">
            <label className="flex items-center text-sm">
              <span className="sr-only">Tháng xem</span>
              <MonthField value={month} onChange={event => setMonth(event.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1 outline-none focus:border-emerald-400" />
            </label>
            <GoogleMirrorLinks module="chemical-usage" variant="inline" />
          </div>
        </div>
      </section>

      <section aria-label="Lọc nhật ký theo loại hóa chất" className="module-stat-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {catalog.map(item => (
          <button
            key={item.code}
            type="button"
            aria-pressed={filterChemicalCode === item.code}
            onClick={() => setFilterChemicalCode(current => current === item.code ? null : item.code)}
            className={`rounded-xl border p-4 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-300 ${
              filterChemicalCode === item.code
                ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200"
                : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40"
            }`}
          >
            <p className="text-sm font-semibold text-slate-900">{item.name}</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{formatNumber(totals.get(item.code) || 0)} <span className="text-sm font-medium text-slate-500">{item.unit}</span></p>
            <p className="mt-2 text-xs leading-5 text-slate-500">Nhập: {item.allowedPositions.join(" · ")}</p>
            <p className="mt-2 text-xs font-semibold text-emerald-700">
              {filterChemicalCode === item.code ? "Đang lọc — bấm lại để bỏ lọc" : "Bấm để xem nhật ký"}
            </p>
          </button>
        ))}
      </section>

      <section className="chemical-content-grid grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="chemical-entry-panel rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-slate-900">{editingId === null ? "Nhập lượng sử dụng" : `Chỉnh sửa bản ghi #${editingId}`}</h3>
            {editingId !== null && <button type="button" onClick={cancelEdit} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"><X className="size-4" /> Hủy sửa</button>}
          </div>
          <p className="mt-1 text-sm text-slate-500">Cương vị hiện tại: <strong>{user.position || "Chưa xác định"}</strong></p>

          {allowedCatalog.length === 0 ? (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <div className="flex items-center gap-2 font-semibold"><LockKeyhole className="size-4" /> Chế độ chỉ xem</div>
              <p className="mt-1">Cương vị của bạn không có hóa chất được phép nhập theo sheet nguồn.</p>
            </div>
          ) : (
            <form onSubmit={saveRecord} className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-slate-700">Ngày thực hiện
                <input required type="date" value={usageDate} onChange={event => setUsageDate(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
              </label>
              <label className="block text-sm font-medium text-slate-700">Loại hóa chất
                <select required value={chemicalCode} onChange={event => {
                  const nextCode = event.target.value;
                  const nextChemical = allowedCatalog.find(item => item.code === nextCode);
                  setChemicalCode(nextCode);
                  setReasonChoice(nextChemical?.suggestedReasons[0] || "");
                  setOtherReason("");
                }} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-emerald-400">
                  {allowedCatalog.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
                </select>
                {selectedChemical && <span className="mt-1 block text-xs text-slate-400">Mã vật tư: {selectedChemical.materialCode}</span>}
              </label>
              <label className="block text-sm font-medium text-slate-700">Số lượng ({selectedChemical?.unit || "Tấn"})
                <input required inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="0,000" className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-emerald-400" />
              </label>
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                Tổ máy: <strong>Chung</strong> — áp dụng cho toàn bộ hóa chất trong danh mục.
              </div>
              <label className="block text-sm font-medium text-slate-700">Nội dung công tác/lý do sử dụng
                <select required value={reasonChoice} onChange={event => setReasonChoice(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-emerald-400">
                  {selectedChemical?.suggestedReasons.map(reason => <option key={reason} value={reason}>{reason}</option>)}
                  <option value="__other__">Lý do khác…</option>
                </select>
              </label>
              {reasonChoice === "__other__" && (
                <label className="block text-sm font-medium text-slate-700">Ghi rõ lý do khác
                  <textarea required value={otherReason} onChange={event => setOtherReason(event.target.value)} rows={3} maxLength={500} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-emerald-400" />
                </label>
              )}
              <label className="block text-sm font-medium text-slate-700">Tham chiếu/đính kèm (nếu có)
                <input value={reference} onChange={event => setReference(event.target.value)} maxLength={300} placeholder="Số PCT/LCT hoặc tên hồ sơ" className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-emerald-400" />
              </label>
              <button disabled={saving} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                <Save className="size-4" aria-hidden /> {saving ? "Đang lưu…" : editingId === null ? "Lưu hóa chất trong ngày" : "Lưu nội dung chỉnh sửa"}
              </button>
            </form>
          )}
          {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {success && <p className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 className="size-4" />{success}</p>}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="font-semibold text-slate-900">
                Nhật ký {filteredChemical ? filteredChemical.name : "tất cả hóa chất"} tháng {month.slice(5, 7)}/{month.slice(0, 4)}
              </h3>
              <p className="mt-1 text-sm text-slate-500">{filteredRecords.length} lượt sử dụng đã ghi nhận</p>
            </div>
            {filterChemicalCode && (
              <button type="button" onClick={() => setFilterChemicalCode(null)} className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                Xem tất cả
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1050px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Ngày</th><th className="px-4 py-3">Hóa chất</th><th className="px-4 py-3 text-right">Số lượng</th><th className="px-4 py-3">Tổ máy</th><th className="px-4 py-3">Nội dung/lý do</th><th className="px-4 py-3">Người nhập</th><th className="px-4 py-3">Tham chiếu</th><th className="px-4 py-3">Thao tác</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Đang tải dữ liệu…</td></tr> : null}
                {!loading && filteredRecords.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Chưa có dữ liệu phù hợp trong tháng này.</td></tr> : null}
                {!loading && filteredRecords.map(record => (
                  <tr key={record.id} className="align-top hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{formatDate(record.usage_date)}</td>
                    <td className="px-4 py-3"><span className="font-semibold text-slate-900">{record.chemical_name}</span><span className="block text-xs text-slate-400">{record.material_code}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold text-emerald-700">{formatNumber(record.quantity)} {record.unit}</td>
                    <td className="px-4 py-3 text-slate-600">{record.plant_unit}</td>
                    <td className="max-w-xs px-4 py-3 text-slate-600">{record.purpose}</td>
                    <td className="px-4 py-3"><span className="text-slate-800">{record.entered_by_name}</span><span className="block text-xs text-slate-400">{record.entered_by_position}</span></td>
                    <td className="max-w-48 px-4 py-3 text-slate-500">{record.reference || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {allowedCatalog.some(item => item.code === record.chemical_code) && (
                          <button type="button" onClick={() => startEdit(record)} className="flex items-center gap-1 whitespace-nowrap rounded-md border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><Pencil className="size-3.5" /> Sửa</button>
                        )}
                        {canDeleteRecords && (
                          <button type="button" onClick={() => void deleteRecord(record)} disabled={deletingId === record.id} aria-label={`Xóa bản ghi ${record.chemical_name} ngày ${formatDate(record.usage_date)}`} className="flex items-center gap-1 whitespace-nowrap rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"><Trash2 className="size-3.5" aria-hidden /> {deletingId === record.id ? "Đang xóa…" : "Xóa"}</button>
                        )}
                        {!canDeleteRecords && !allowedCatalog.some(item => item.code === record.chemical_code) && <span className="text-xs text-slate-400">Chỉ xem</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
