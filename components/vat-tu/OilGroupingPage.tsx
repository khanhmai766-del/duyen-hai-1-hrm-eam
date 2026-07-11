"use client";
// =====================================================================
// TRANG "TỒN KHO VẬT TƯ THEO NHÓM" + TAB "CHỜ PHÂN NHÓM"
// Gom các mã vật tư ERP cùng nhóm (theo 4 loại: Dầu bôi trơn, Lõi lọc dầu,
// Hóa Chất, Bi Nghiền Than), tổng hợp tồn kho phục vụ đề xuất nhập thay thế.
// Dữ liệu qua hooks/useOilGrouping (TanStack Query).
// =====================================================================
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Droplet, Filter, FlaskConical, CircleDot, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import {
  useOilStock,
  useOilSuggestions,
  useOilGroupingSync,
  useOilGroupingConfirm,
  GROUPING_CATEGORIES,
  type GroupingCategory,
  type OilStockGroup,
  type OilPendingItem,
  type OilConfirmInput,
} from "@/hooks/useOilGrouping";

const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

// Icon + gợi ý mặc định khi tạo nhóm mới cho từng loại vật tư.
const CATEGORY_META: Record<GroupingCategory, { icon: LucideIcon; defaultUnit: string; codeHint: string; nameHint: string }> = {
  "Dầu bôi trơn": { icon: Droplet, defaultUnit: "Lít", codeHint: "T32", nameHint: "Dầu tuabin T32" },
  "Lõi lọc dầu": { icon: Filter, defaultUnit: "Cái", codeHint: "LOC-TB", nameHint: "Lõi lọc dầu tuabin" },
  "Hóa Chất": { icon: FlaskConical, defaultUnit: "Kg", codeHint: "NAOH", nameHint: "Xút NaOH 32%" },
  "Bi Nghiền Than": { icon: CircleDot, defaultUnit: "Viên", codeHint: "BI60", nameHint: "Bi nghiền than 60mm" },
};

/* ==================== TRANG CHÍNH ==================== */
export default function OilGroupingPage() {
  const [category, setCategory] = useState<GroupingCategory>("Dầu bôi trơn");
  const [tab, setTab] = useState<"stock" | "pending">("stock");
  const { data, isLoading, refetch } = useOilStock(category);
  const groups = data?.data.groups ?? [];
  const pendingCount = data?.data.pendingCount ?? 0;
  const pendingByCategory = data?.data.pendingByCategory;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tồn kho vật tư theo nhóm"
        description="Gom các mã vật tư ERP cùng nhóm, tổng hợp tồn kho phục vụ đề xuất nhập thay thế"
      />

      {/* Tabs loại vật tư */}
      <div className="flex flex-wrap gap-2">
        {GROUPING_CATEGORIES.map((c) => {
          const Icon = CATEGORY_META[c].icon;
          const badge = pendingByCategory?.[c] ?? 0;
          const active = c === category;
          return (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${
                active
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {c}
              {badge > 0 && (
                <span
                  className={`inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                    active ? "bg-white/25 text-white" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tabs tồn kho / chờ phân nhóm */}
      <div className="flex gap-1 border-b border-slate-200">
        <TabButton active={tab === "stock"} onClick={() => setTab("stock")} label="Tồn kho theo nhóm" />
        <TabButton active={tab === "pending"} onClick={() => setTab("pending")} label="Chờ phân nhóm" badge={pendingCount} />
      </div>

      {tab === "stock" ? (
        <StockBoard groups={groups} loading={isLoading} onReload={() => refetch()} />
      ) : (
        <PendingTab key={category} category={category} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
        active ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
      {badge != null && badge > 0 && (
        <span className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
          {badge}
        </span>
      )}
    </button>
  );
}

/* ==================== TAB 1: TỒN KHO ==================== */
function StockBoard({
  groups,
  loading,
  onReload,
}: {
  groups: OilStockGroup[];
  loading: boolean;
  onReload: () => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (loading) return <div className="py-12 text-center text-slate-400">Đang tải…</div>;
  if (groups.length === 0)
    return (
      <div className="py-12 text-center text-slate-400">
        Chưa có nhóm nào cho loại vật tư này — duyệt các mã ở tab &quot;Chờ phân nhóm&quot; để bắt đầu.
      </div>
    );

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3 w-10"></th>
              <th className="text-left px-2 py-3">Nhóm vật tư</th>
              <th className="text-right px-4 py-3">Tổng tồn ERP</th>
              <th className="text-right px-4 py-3">Ngưỡng tối thiểu</th>
              <th className="text-center px-4 py-3">Số mã</th>
              <th className="text-center px-4 py-3">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows key={g.id} g={g} open={open.has(g.id)} toggle={toggle} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
        <span className="text-xs text-slate-500">
          {groups.length} nhóm • {groups.reduce((s, g) => s + g.materialCount, 0)} mã ERP đã gom
        </span>
        <button onClick={onReload} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
          ⟳ Làm mới
        </button>
      </div>
    </div>
  );
}

function GroupRows({
  g,
  open,
  toggle,
}: {
  g: OilStockGroup;
  open: boolean;
  toggle: (id: string) => void;
}) {
  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-blue-50/40 cursor-pointer" onClick={() => toggle(g.id)}>
        <td className="px-4 py-3 text-slate-400">{open ? "▾" : "▸"}</td>
        <td className="px-2 py-3">
          <span className="font-mono text-xs bg-slate-100 rounded px-1.5 py-0.5 mr-2 text-slate-600">{g.code}</span>
          <span className="font-semibold text-slate-800">{g.name}</span>
        </td>
        <td className="px-4 py-3 text-right font-bold text-slate-800">
          {fmt(g.totalQty)} <span className="font-normal text-slate-400">{g.baseUnit}</span>
        </td>
        <td className="px-4 py-3 text-right text-slate-500">
          {g.minStock != null ? `${fmt(g.minStock)} ${g.baseUnit}` : "—"}
        </td>
        <td className="px-4 py-3 text-center text-slate-600">{g.materialCount}</td>
        <td className="px-4 py-3 text-center">
          {g.belowMin ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-1">
              ⚠ Dưới ngưỡng — cần đề xuất nhập
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
              ✓ Đủ tồn
            </span>
          )}
        </td>
      </tr>
      {open &&
        g.materials.map((m) => (
          <tr key={m.id} className="bg-slate-50/60 border-t border-slate-100">
            <td></td>
            <td className="px-2 py-2 pl-8">
              <span className="font-mono text-xs text-slate-600">{m.erpCode}</span>
              <span className="ml-3 text-slate-500 text-xs">{m.name}</span>
              {m.origin && (
                <span className="ml-2 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                  {m.origin}
                </span>
              )}
            </td>
            <td className="px-4 py-2 text-right text-slate-600 text-xs">
              {fmt(m.qtyInBase)} {g.baseUnit}
              {m.conversionFactor !== 1 && (
                <span className="text-slate-400">
                  {" "}
                  ({fmt(m.erpQty)} {m.unit} × {m.conversionFactor})
                </span>
              )}
            </td>
            <td colSpan={3}></td>
          </tr>
        ))}
    </>
  );
}

/* ==================== TAB 2: CHỜ PHÂN NHÓM ==================== */
function PendingTab({ category }: { category: GroupingCategory }) {
  const meta = CATEGORY_META[category];
  const { data, isLoading } = useOilSuggestions(category);
  const sync = useOilGroupingSync();
  const confirm = useOilGroupingConfirm();
  const items = data?.data.items ?? [];
  const oilTypes = data?.data.oilTypes ?? [];

  const [checked, setChecked] = useState<Set<string>>(new Set());
  // form gom nhóm
  const [targetType, setTargetType] = useState<string>("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState(meta.defaultUnit);
  const [newMin, setNewMin] = useState("");
  const [factor, setFactor] = useState("1");

  const busy = sync.isPending || confirm.isPending;

  const typeById = useMemo(() => new Map(oilTypes.map((t) => [t.id, t])), [oilTypes]);

  const toggleCheck = (id: string) =>
    setChecked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const runScan = async () => {
    try {
      const r = await sync.mutateAsync(category);
      toast.success(`Đã quét ${r.scanned} mã: ${r.suggested} có gợi ý, ${r.unmapped} chưa nhận diện`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const submit = async (payload: OilConfirmInput, successMsg: string) => {
    try {
      await confirm.mutateAsync(payload);
      setChecked(new Set());
      toast.success(successMsg);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Duyệt nhanh 1 gợi ý
  const acceptSuggestion = (it: OilPendingItem) =>
    submit(
      { materialIds: [it.id], action: "CONFIRM", oilTypeId: it.suggestedOilTypeId ?? undefined },
      `Đã gom ${it.erpCode} theo gợi ý`
    );

  // Gom các mã đã chọn
  const confirmSelected = () => {
    if (checked.size === 0) return;
    const base: OilConfirmInput = {
      materialIds: [...checked],
      action: "CONFIRM",
      conversionFactor: Number(factor) || 1,
    };
    if (targetType === "__new__") {
      base.newOilType = {
        code: newCode,
        name: newName,
        baseUnit: newUnit,
        minStock: newMin ? Number(newMin) : undefined,
        category,
      };
    } else {
      base.oilTypeId = targetType;
    }
    submit(base, `Đã gom ${checked.size} mã vào nhóm`);
  };

  const ignoreSelected = () => {
    if (checked.size === 0) return;
    submit({ materialIds: [...checked], action: "IGNORE" }, `Đã bỏ qua ${checked.size} mã (không cần gom nhóm)`);
  };

  if (isLoading) return <div className="py-12 text-center text-slate-400">Đang tải…</div>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={runScan}
          disabled={busy}
          className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          🔍 Quét gợi ý lại
        </button>
        <span className="text-sm text-slate-500">
          {items.length} mã chờ phân nhóm • Đã chọn {checked.size}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-12 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl">
          ✓ Tất cả mã vật tư loại &quot;{category}&quot; đã được gom nhóm.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={checked.size === items.length && items.length > 0}
                        onChange={(e) =>
                          setChecked(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())
                        }
                      />
                    </th>
                    <th className="text-left px-2 py-3">Mã vật tư</th>
                    <th className="text-left px-2 py-3">Tên vật tư</th>
                    <th className="text-right px-3 py-3">Tồn</th>
                    <th className="text-left px-3 py-3">Gợi ý của hệ thống</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const sug = it.suggestedOilTypeId ? typeById.get(it.suggestedOilTypeId) : null;
                    return (
                      <tr key={it.id} className="border-t border-slate-100 hover:bg-blue-50/30">
                        <td className="px-4 py-2.5 text-center">
                          <input type="checkbox" checked={checked.has(it.id)} onChange={() => toggleCheck(it.id)} />
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="font-mono text-xs bg-slate-100 rounded px-1.5 py-0.5 text-slate-600">
                            {it.erpCode}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-slate-800">{it.name}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">
                          {fmt(it.erpQty)} {it.unit}
                        </td>
                        <td className="px-3 py-2.5">
                          {sug ? (
                            <div>
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                                ★ {sug.code} · {sug.name}
                                <span className="text-amber-500">
                                  {Math.round((it.suggestedScore ?? 0) * 100)}%
                                </span>
                              </span>
                              {it.suggestedReason && (
                                <div className="text-[11px] text-slate-400 mt-1">{it.suggestedReason}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Không có gợi ý — chọn nhóm thủ công</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {sug && (
                            <button
                              onClick={() => acceptSuggestion(it)}
                              disabled={busy}
                              className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-1.5 disabled:opacity-50"
                            >
                              ✓ Duyệt
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Thanh thao tác gom hàng loạt */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-700 mb-3">Gom {checked.size} mã đã chọn vào:</div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-slate-500">
                Nhóm đích
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value)}
                  className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm min-w-56"
                >
                  <option value="">— Chọn nhóm —</option>
                  {oilTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} · {t.name} ({t.baseUnit})
                    </option>
                  ))}
                  <option value="__new__">＋ Tạo nhóm mới…</option>
                </select>
              </label>

              {targetType === "__new__" && (
                <>
                  <label className="text-xs text-slate-500">
                    Mã nhóm
                    <input
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                      placeholder={meta.codeHint}
                      className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-24"
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    Tên nhóm
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={meta.nameHint}
                      className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-56"
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    ĐVT chuẩn
                    <input
                      value={newUnit}
                      onChange={(e) => setNewUnit(e.target.value)}
                      className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-20"
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    Ngưỡng tối thiểu
                    <input
                      value={newMin}
                      onChange={(e) => setNewMin(e.target.value)}
                      placeholder="1500"
                      className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-28"
                    />
                  </label>
                </>
              )}

              <label className="text-xs text-slate-500">
                Hệ số quy đổi → ĐVT chuẩn
                <input
                  value={factor}
                  onChange={(e) => setFactor(e.target.value)}
                  className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-28"
                  title="Ví dụ 1 phuy = 209 Lít → nhập 209. Cùng ĐVT → để 1."
                />
              </label>

              <button
                onClick={confirmSelected}
                disabled={busy || checked.size === 0 || !targetType}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40"
              >
                Gom nhóm
              </button>
              <button
                onClick={ignoreSelected}
                disabled={busy || checked.size === 0}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 border border-slate-300 hover:bg-slate-50 disabled:opacity-40"
              >
                Không cần gom — bỏ qua
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
