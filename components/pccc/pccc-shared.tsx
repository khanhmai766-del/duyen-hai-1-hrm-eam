"use client";
// Thành phần dùng chung cho 4 tab PCCC: nhãn trạng thái, thẻ số liệu, thanh %,
// ô sửa tại chỗ và ô chữ ký. Giữ ở 1 chỗ để 3 bảng nhìn như một hệ thống.
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, PenLine, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { round2ToneOf, type PcccTone } from "@/lib/pccc-status";

/**
 * Ô bị khoá theo phân quyền cương vị: bấm vào thì HIỆN POPUP nói rõ lý do. Trước đây ô
 * chỉ trơ ra, người dùng cương vị hạn chế bấm mãi không được và tưởng trang bị lỗi.
 * Dùng chung một `id` nên bấm nhiều ô liên tiếp chỉ thay nội dung một popup, không xếp
 * chồng cả chục thông báo.
 */
export function notifyPcccLocked(reason: string) {
  toast.warning(reason, { id: "pccc-locked", duration: 5000 });
}

/**
 * Dấu chọn "đã kiểm tra trong phiên". Đây là lựa chọn tạm trên màn hình, chưa ghi DB;
 * chỉ các dòng được đánh dấu mới được gửi sang cửa ký xác nhận.
 */
export function InspectionMark({
  checked,
  disabled,
  onChange,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-[122px] items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={checked ? "Bỏ đánh dấu thiết bị đã kiểm tra trong phiên" : "Đánh dấu thiết bị đã kiểm tra trong phiên"}
        title="Đánh dấu thiết bị đã kiểm tra trong phiên để đưa vào lượt ký"
        className="size-4 shrink-0 cursor-pointer rounded border-slate-300 accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

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
// Dùng bản MỞ RỘNG: nó tra bảng màu riêng của bốn nhóm đợt 2 trước, không khớp thì
// rơi về bảng màu gốc — nên mọi nhãn cũ của BCC/TCC/FCD giữ nguyên màu như trước.
export const statusTone = round2ToneOf;

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

/**
 * Thẻ số liệu của tab Tổng quan. Có `onClick` thì thẻ thành NÚT LỌC: rê chuột vào là
 * thẻ nhấc lên + viền đậm + hiện nhãn "Lọc →", bấm thì mở đúng bảng chi tiết của con
 * số đó. Không truyền `onClick` thì vẫn là thẻ tĩnh như cũ (không có hiệu ứng, không
 * bắt con trỏ) — quan trọng, vì thẻ không lọc được mà nhấp nháy như nút là gây hiểu lầm.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "none",
  icon: Icon,
  active,
  onClick,
  actionLabel,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: StatusTone;
  icon?: React.ElementType;
  active?: boolean;
  onClick?: () => void;
  /** Bấm vào thì lọc ra gì — hiện thành tooltip, cũng là nhãn cho trình đọc màn hình. */
  actionLabel?: string;
}) {
  /** Dải màu mảnh bên trái — đủ để nhận ra mức độ mà không nhuộm cả thẻ. */
  const rail: Record<StatusTone, string> = {
    ok: "bg-emerald-500",
    watch: "bg-amber-500",
    bad: "bg-rose-500",
    none: "bg-slate-300",
  };
  const iconBox: Record<StatusTone, string> = {
    ok: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    watch: "bg-amber-50 text-amber-600 ring-amber-100",
    bad: "bg-rose-50 text-rose-600 ring-rose-100",
    none: "bg-slate-50 text-slate-500 ring-slate-100",
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
      title={actionLabel}
      aria-label={actionLabel ? `${label}: ${value} — ${actionLabel}` : undefined}
      className={cn(
        // NỀN TRẮNG, không nhuộm màu cả thẻ: một dải KPI bốn thẻ đỏ/xanh kín nền đọc như
        // bốn cảnh báo ngang hàng nhau. Màu dồn vào dải trái + ô biểu tượng + con số.
        "group relative flex min-w-0 flex-1 items-start gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white py-3.5 pl-4 pr-3.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition duration-150",
        onClick &&
          "cursor-pointer hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:-translate-y-0.5 focus-visible:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/30 active:translate-y-0 active:shadow-sm",
        active && "border-navy/40 ring-2 ring-navy/20",
        !onClick && "cursor-default"
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", rail[tone])} aria-hidden />
      {Icon && (
        <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg ring-1 transition", iconBox[tone], onClick && "group-hover:scale-105")}>
          <Icon className="size-4" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">{label}</span>
        <span className={cn("mt-1 block text-[26px] font-bold leading-none tracking-tight tabular-nums", valueColor[tone])}>{value}</span>
        {hint && <span className="mt-1.5 block truncate text-[11px] leading-tight text-muted-foreground">{hint}</span>}
      </span>
      {/* Chỉ dấu "bấm được" — chỉ hiện khi rê chuột nên lúc thường thẻ vẫn gọn như cũ. */}
      {onClick && (
        <span className="pointer-events-none absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 opacity-0 shadow-sm ring-1 ring-slate-200 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          Lọc
          <ArrowRight className="size-3" />
        </span>
      )}
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
  lockedReason,
  align = "left",
  wrap = false,
  compact = false,
  onSave,
}: {
  value: string | number | null;
  type?: "text" | "number" | "date" | "select";
  options?: string[];
  disabled?: boolean;
  /** Có lý do = ô khoá do phân quyền: vẫn bấm được, nhưng chỉ để hiện popup giải thích. */
  lockedReason?: string;
  align?: "left" | "right" | "center";
  /**
   * Ô nhập GỌN: chỉ vừa đủ vài chữ số thay vì giãn hết bề rộng cột. Dùng cho lưới số đo
   * FM200 — cột ở đó rộng vì phải chia đều cho 16 bình, mở ô ra mà giãn hết cột thì cái
   * khung nhập to gấp mấy lần con số cần gõ, nhìn như lỗi giao diện.
   */
  compact?: boolean;
  /** true = cho chữ XUỐNG DÒNG thay vì cắt bằng "…". Dùng trong khối chi tiết dòng,
   *  nơi cần đọc đủ nội dung; trong bảng thì vẫn cắt để không phá chiều cao hàng. */
  wrap?: boolean;
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
    const content = type === "date" ? fmtDate(initial) : initial || <span className="text-slate-300">—</span>;
    const base = cn(
      // KHÔNG đóng cứng text-left: để ô cha quyết định canh lề (nhiều cột trong bảng
      // canh giữa). Mặc định của ô bảng vốn đã là canh trái nên chỗ cũ không đổi.
      "block w-full px-1 py-0.5 text-[12px]",
      wrap ? "whitespace-normal break-words" : "truncate",
      align === "right" && "text-right",
      align === "center" && "text-center"
    );
    // Khoá do phân quyền → vẫn là nút để bấm ra popup; khoá vì lý do khác (bảng đang
    // đóng, ô dẫn xuất…) thì giữ nguyên chữ trơ như cũ.
    if (lockedReason) {
      return (
        <button type="button" title={lockedReason} onClick={() => notifyPcccLocked(lockedReason)} className={cn(base, "cursor-not-allowed rounded hover:bg-slate-100")}>
          {content}
        </button>
      );
    }
    return <span className={base}>{content}</span>;
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
          "block w-full rounded px-1 py-0.5 text-[12px] hover:bg-accent/5 hover:ring-1 hover:ring-accent/20",
          wrap ? "whitespace-normal break-words" : "truncate",
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
        className="w-full rounded border border-accent/40 bg-white px-1 py-0.5 text-[12px] outline-none"
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
        "rounded border border-accent/40 bg-white px-1 py-0.5 text-[12px] outline-none focus:ring-2 focus:ring-accent/20",
        // Ô gọn: bỏ luôn nút tăng/giảm của input number — hai mũi tên đó chiếm gần nửa
        // bề ngang ô nhỏ mà thao tác thật thì luôn gõ số.
        compact
          ? "mx-auto block w-14 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          : "w-full",
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
  lockedReason,
  onChange,
}: {
  value: string | null;
  options: readonly string[];
  disabled?: boolean;
  /** Có lý do = ô khoá do phân quyền: bấm vào hiện popup giải thích. */
  lockedReason?: string;
  onChange: (next: string) => void;
}) {
  const tone = statusTone(value);
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
    const cls = cn("inline-block truncate rounded border px-1.5 py-0.5 text-[11.5px] font-medium", box[tone]);
    if (lockedReason) {
      return (
        <button type="button" title={lockedReason} onClick={() => notifyPcccLocked(lockedReason)} className={cn(cls, "cursor-not-allowed")}>
          {value ?? "—"}
        </button>
      );
    }
    return <span className={cls}>{value ?? "—"}</span>;
  }
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full min-w-[124px] cursor-pointer rounded border px-1 py-0.5 text-[11.5px] font-medium outline-none focus:ring-2 focus:ring-accent/25",
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

/**
 * Con dấu chữ ký: ẢNH chữ ký số của người ký + tên + ngày. Ảnh lấy qua proxy S3 theo key
 * đã chốt lúc ký, nên user đổi chữ ký về sau không làm sai bản ký cũ.
 * Bản ký cũ chưa gắn ảnh thì rơi về hiện tên như trước, không để trống.
 */
export function SignatureStamp({
  signature,
  className,
}: {
  signature: { signerName: string; signedAt: string; signatureUrl?: string | null } | null;
  className?: string;
}) {
  if (!signature) return <span className="text-[12px] text-slate-400">Chưa ký</span>;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {signature.signatureUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh chữ ký phục vụ qua proxy S3, không qua loader ảnh
        <img
          src={signature.signatureUrl}
          alt={`Chữ ký ${signature.signerName}`}
          className="h-8 w-auto max-w-[120px] object-contain"
        />
      )}
      {/* KHÔNG in ngày ký ở đây: ô "Ngày kiểm tra" ngay trong cùng khối chi tiết đã ghi
          đúng ngày đó (thao tác ký tự điền vào ô ấy), lặp lại chỉ làm rối và có nguy cơ
          hai chỗ nhìn khác nhau khi ai đó sửa tay ô ngày. */}
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[12px] font-medium text-ink">{signature.signerName}</span>
      </span>
    </span>
  );
}

/** Ô chữ ký: chưa ký → nút "Ký"; đã ký → tên + thời điểm, bấm để huỷ ký. */
export function SignCell({
  signature,
  disabled,
  lockedReason,
  onToggle,
}: {
  signature: { signerName: string; signerPosition: string | null; signedAt: string; signatureUrl?: string | null } | null;
  disabled?: boolean;
  /** Có lý do = khoá do phân quyền: bấm vào hiện popup giải thích thay vì ký. */
  lockedReason?: string;
  onToggle: (remove: boolean) => void;
}) {
  if (signature) {
    return (
      <button
        type="button"
        disabled={disabled && !lockedReason}
        onClick={() => (lockedReason ? notifyPcccLocked(lockedReason) : onToggle(true))}
        title={lockedReason ?? (disabled ? "Kỳ đã chốt" : "Bấm để huỷ ký")}
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:border-emerald-300 disabled:opacity-60",
          lockedReason && "cursor-not-allowed opacity-60"
        )}
      >
        {signature.signatureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- ảnh chữ ký phục vụ qua proxy S3
          <img src={signature.signatureUrl} alt="" className="h-6 w-auto max-w-[80px] shrink-0 object-contain" />
        ) : (
          <ShieldCheck className="size-3 shrink-0" />
        )}
        {/* KHÔNG lặp lại ngày ký: cột "Ngày chốt" / "Ngày KT" ngay cạnh đã ghi đúng ngày đó. */}
        <span className="truncate">{signature.signerName}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled && !lockedReason}
      title={lockedReason}
      onClick={() => (lockedReason ? notifyPcccLocked(lockedReason) : onToggle(false))}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-accent/40 hover:text-accent disabled:opacity-50",
        lockedReason && "cursor-not-allowed opacity-50"
      )}
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
  lockedReason,
  onToggle,
}: {
  checked: boolean;
  tone: StatusTone;
  disabled?: boolean;
  /** Có lý do = ô khoá do phân quyền: bấm vào hiện popup giải thích thay vì tích. */
  lockedReason?: string;
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
      disabled={disabled && !lockedReason}
      title={lockedReason}
      onClick={() => (lockedReason ? notifyPcccLocked(lockedReason) : onToggle())}
      className={cn(
        "grid size-5 place-items-center rounded border transition",
        checked ? on[tone] : "border-slate-300 bg-white hover:border-accent/50",
        disabled && "opacity-50",
        lockedReason && "cursor-not-allowed"
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
        className="w-full rounded border border-accent/40 bg-white px-1 py-0.5 text-[12px] outline-none"
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

export function TableShell({
  children,
  className,
  fill,
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * Kéo bảng cao bằng đúng khung chứa nó, chia đều phần dư cho các hàng. Dùng khi bảng
   * nằm cạnh một khối cao hơn (biểu đồ) — không có nó thì khung bảng vẫn bị kéo cao
   * theo lưới nhưng các hàng đứng nguyên, để lại một mảng trắng ở đáy.
   */
  fill?: boolean;
}) {
  return (
    <div className={cn("overflow-auto rounded-xl border border-slate-200 bg-white", className)}>
      <table className={cn("w-full border-collapse text-[12px]", fill && "h-full")}>{children}</table>
    </div>
  );
}

export const TH_CLASS =
  "sticky top-0 z-10 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600";
export const TD_CLASS = "border-b border-slate-100 px-2 py-1.5 align-middle";
