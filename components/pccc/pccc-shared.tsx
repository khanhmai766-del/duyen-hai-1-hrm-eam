"use client";
// Thành phần dùng chung cho 4 tab PCCC: nhãn trạng thái, thẻ số liệu, thanh %,
// ô sửa tại chỗ và ô chữ ký. Giữ ở 1 chỗ để 3 bảng nhìn như một hệ thống.
import { useEffect, useRef, useState } from "react";
import { Check, PenLine, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneOf, type PcccTone } from "@/lib/pccc-status";

export const dateFmt = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

export function fmtDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : dateFmt.format(d);
}

export function toInputDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function fmtPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * Ba mức trạng thái dùng xuyên suốt module — màu bám bảng chú giải của sheet gốc.
 * Bảng tra nằm ở lib/pccc-status.ts để server và client dùng cùng một bản; ở đây chỉ
 * tái xuất cho gọn khi import trong components.
 */
export type StatusTone = PcccTone;
export const statusTone = toneOf;

const TONE_CLASS: Record<StatusTone, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  watch: "border-amber-200 bg-amber-50 text-amber-700",
  bad: "border-rose-200 bg-rose-50 text-rose-700",
  none: "border-slate-200 bg-slate-50 text-slate-500",
};

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const tone = statusTone(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        TONE_CLASS[tone],
        className
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "ok" ? "bg-emerald-500" : tone === "watch" ? "bg-amber-500" : tone === "bad" ? "bg-rose-500" : "bg-slate-400"
        )}
      />
      {status ?? "Chưa cập nhật"}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "none",
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: StatusTone;
  icon?: React.ElementType;
  active?: boolean;
  onClick?: () => void;
}) {
  const ring: Record<StatusTone, string> = {
    ok: "ring-emerald-200 bg-emerald-50/60",
    watch: "ring-amber-200 bg-amber-50/60",
    bad: "ring-rose-200 bg-rose-50/60",
    none: "ring-slate-200 bg-white",
  };
  const valueColor: Record<StatusTone, string> = {
    ok: "text-emerald-700",
    watch: "text-amber-700",
    bad: "text-rose-700",
    none: "text-ink",
  };
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-1 items-start gap-3 rounded-xl p-3.5 text-left ring-1 transition",
        ring[tone],
        onClick && "hover:shadow-sm",
        active && "ring-2 ring-offset-1 ring-offset-white",
        !onClick && "cursor-default"
      )}
    >
      {Icon && (
        <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-white/80 ring-1", ring[tone])}>
          <Icon className={cn("size-4", valueColor[tone])} />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={cn("block text-2xl font-bold leading-tight", valueColor[tone])}>{value}</span>
        {hint && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}

/** Thanh % dùng cho "% khả dụng" (BCC) và "% còn lại" (FCD/FM200). */
export function PercentBar({ value, tone }: { value: number | null; tone?: StatusTone }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value));
  const t = tone ?? (pct >= 0.9 ? "ok" : pct >= 0.7 ? "watch" : "bad");
  const bar: Record<StatusTone, string> = {
    ok: "bg-emerald-500",
    watch: "bg-amber-500",
    bad: "bg-rose-500",
    none: "bg-slate-300",
  };
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full min-w-[52px] overflow-hidden rounded-full bg-slate-200/80">
        <div className={cn("h-full rounded-full transition-all", bar[t])} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="w-11 shrink-0 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">
        {value === null ? "—" : `${Math.round(pct * 100)}%`}
      </span>
    </div>
  );
}

/**
 * Ô sửa tại chỗ: hiển thị như text, click để sửa, Enter/blur để lưu, Esc để bỏ.
 * Chỉ gọi onSave khi giá trị THỰC SỰ đổi — mỗi lần lưu đều xoá chữ ký của dòng.
 */
export function EditableCell({
  value,
  type = "text",
  options,
  disabled,
  align = "left",
  onSave,
}: {
  value: string | number | null;
  type?: "text" | "number" | "date" | "select";
  options?: string[];
  disabled?: boolean;
  align?: "left" | "right" | "center";
  onSave: (next: string) => void;
}) {
  const initial = value === null || value === undefined ? "" : String(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);
  const ref = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    if (draft !== initial) onSave(draft);
  }

  if (disabled) {
    return (
      <span className={cn("block truncate px-1 py-0.5 text-[13px]", align === "right" && "text-right", align === "center" && "text-center")}>
        {type === "date" ? fmtDate(initial) : initial || <span className="text-slate-300">—</span>}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(type === "date" ? toInputDate(initial) : initial);
          setEditing(true);
        }}
        className={cn(
          "block w-full truncate rounded px-1 py-0.5 text-left text-[13px] hover:bg-accent/5 hover:ring-1 hover:ring-accent/20",
          align === "right" && "text-right",
          align === "center" && "text-center"
        )}
        title="Bấm để sửa"
      >
        {type === "date" ? fmtDate(initial) : initial || <span className="text-slate-300">—</span>}
      </button>
    );
  }

  if (type === "select") {
    // Giá trị đang lưu có thể KHÔNG nằm trong danh sách chuẩn (dữ liệu cũ nhập tay,
    // vd "Hư hỏng khác, không còn chân giữ bình"). Phải chèn nó vào danh sách, nếu
    // không chỉ mở ô ra rồi rời chuột là đã âm thầm ghi mất giá trị gốc.
    const items = initial && !(options ?? []).includes(initial) ? [initial, ...(options ?? [])] : options ?? [];
    return (
      <select
        ref={ref as React.RefObject<HTMLSelectElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
          if (e.key === "Enter") commit();
        }}
        className="w-full rounded border border-accent/40 bg-white px-1 py-0.5 text-[13px] outline-none"
      >
        <option value="">—</option>
        {items.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") setEditing(false);
        if (e.key === "Enter") commit();
      }}
      className={cn(
        "w-full rounded border border-accent/40 bg-white px-1 py-0.5 text-[13px] outline-none focus:ring-2 focus:ring-accent/20",
        align === "right" && "text-right"
      )}
    />
  );
}

/**
 * Ô select TÔ MÀU theo giá trị — dùng cho hai cột "Tình trạng tổng thể" và "Áp suất
 * bình MFZ / KL bình CO2" của bảng BCC, đúng như bản Excel/demo: nền ô đổi màu theo
 * mức, và danh sách chọn của cột này bị cột kia ràng buộc (xem lib/pccc-status.ts).
 * Luôn hiện dạng select (không phải click-để-sửa) vì đây là hai cột thao tác nhiều
 * nhất khi đi kiểm tra hiện trường.
 */
export function ToneSelectCell({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string | null;
  options: readonly string[];
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  const tone = toneOf(value);
  const box: Record<StatusTone, string> = {
    ok: "border-emerald-300 bg-emerald-50 text-emerald-800",
    watch: "border-amber-300 bg-amber-50 text-amber-800",
    bad: "border-rose-300 bg-rose-50 text-rose-800",
    none: "border-slate-200 bg-white text-slate-600",
  };
  // Giá trị hiện tại có thể không còn nằm trong danh sách hợp lệ (vd đang "Khả dụng"
  // mà áp suất vừa xuống mức cảnh báo) — vẫn phải hiển thị được, nên chèn thêm.
  const items = options.includes(value ?? "") || !value ? options : [value, ...options];

  if (disabled) {
    return (
      <span className={cn("inline-block truncate rounded border px-1.5 py-0.5 text-[12px] font-medium", box[tone])}>
        {value ?? "—"}
      </span>
    );
  }
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full min-w-[132px] cursor-pointer rounded border px-1 py-0.5 text-[12px] font-medium outline-none focus:ring-2 focus:ring-accent/25",
        box[tone]
      )}
    >
      {!value && <option value="">—</option>}
      {items.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/** Ô chữ ký: chưa ký → nút "Ký"; đã ký → tên + thời điểm, bấm để huỷ ký. */
export function SignCell({
  signature,
  disabled,
  onToggle,
}: {
  signature: { signerName: string; signerPosition: string | null; signedAt: string } | null;
  disabled?: boolean;
  onToggle: (remove: boolean) => void;
}) {
  if (signature) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onToggle(true)}
        title={disabled ? "Kỳ đã chốt" : "Bấm để huỷ ký"}
        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:border-emerald-300 disabled:opacity-60"
      >
        <ShieldCheck className="size-3 shrink-0" />
        <span className="truncate">{signature.signerName}</span>
        <span className="shrink-0 text-emerald-600/70">{fmtDate(signature.signedAt)}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(false)}
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-accent/40 hover:text-accent disabled:opacity-50"
    >
      <PenLine className="size-3" />
      Ký
    </button>
  );
}

/** Ô ☑/☐ của bảng TCC — nhiều trạng thái trong 1 nhóm được tích cùng lúc. */
export function TickCell({
  checked,
  tone,
  disabled,
  onToggle,
}: {
  checked: boolean;
  tone: StatusTone;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const on: Record<StatusTone, string> = {
    ok: "border-emerald-400 bg-emerald-500 text-white",
    watch: "border-amber-400 bg-amber-500 text-white",
    bad: "border-rose-400 bg-rose-500 text-white",
    none: "border-slate-400 bg-slate-500 text-white",
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "grid size-5 place-items-center rounded border transition",
        checked ? on[tone] : "border-slate-300 bg-white hover:border-accent/50",
        disabled && "opacity-50"
      )}
    >
      {checked && <Check className="size-3.5" strokeWidth={3} />}
    </button>
  );
}

/**
 * Ô "Tổ máy" — S1 | S2 | COMMON. Tổ máy tách khỏi nhãn cương vị (nhãn không còn hậu
 * tố "S1"), và chỉ là chiều PHÂN LOẠI/LỌC: quyền vẫn theo mã chức danh nên một người
 * mang chức danh Lò phó thao tác được cả hai tổ máy.
 */
export const MACHINE_OPTIONS = [
  { value: "S1", short: "S1", label: "Tổ máy 1" },
  { value: "S2", short: "S2", label: "Tổ máy 2" },
  { value: "COMMON", short: "Common", label: "Common" },
] as const;

export function machineShort(value: string | null | undefined) {
  return MACHINE_OPTIONS.find((m) => m.value === value)?.short ?? "Common";
}

export function MachineCell({
  value,
  disabled,
  onSave,
}: {
  value: string | null;
  disabled?: boolean;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const current = value ?? "COMMON";
  const tone =
    current === "S1" ? "border-sky-200 bg-sky-50 text-sky-700" : current === "S2" ? "border-violet-200 bg-violet-50 text-violet-700" : "border-slate-200 bg-slate-50 text-slate-600";

  if (editing && !disabled) {
    return (
      <select
        autoFocus
        value={current}
        onChange={(e) => {
          setEditing(false);
          if (e.target.value !== current) onSave(e.target.value);
        }}
        onBlur={() => setEditing(false)}
        className="w-full rounded border border-accent/40 bg-white px-1 py-0.5 text-[13px] outline-none"
      >
        {MACHINE_OPTIONS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setEditing(true)}
      title={disabled ? undefined : "Bấm để đổi tổ máy"}
      className={cn(
        "inline-flex min-w-[42px] justify-center rounded-full border px-1.5 py-0.5 text-[11px] font-semibold",
        tone,
        !disabled && "hover:brightness-95"
      )}
    >
      {machineShort(current)}
    </button>
  );
}

/** Vị trí cột trong nhóm → mức nặng nhẹ (cột đầu tốt, cột cuối nặng nhất). */
export function componentTone(statusOrder: number, statusCount: number): StatusTone {
  if (statusOrder === 0) return "ok";
  if (statusOrder === statusCount - 1) return "bad";
  return "watch";
}

export function TableShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-auto rounded-xl border border-slate-200 bg-white", className)}>
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  );
}

export const TH_CLASS =
  "sticky top-0 z-10 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600";
export const TD_CLASS = "border-b border-slate-100 px-2 py-1.5 align-middle";
