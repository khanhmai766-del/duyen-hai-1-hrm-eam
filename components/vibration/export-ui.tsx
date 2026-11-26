"use client";

import * as React from "react";

export interface ExportAction {
  key: string;
  label: string;
  title?: string;
  /** Đặt nút trước ô chọn phạm vi xuất (vd. "Copy báo cáo ngày" của MNK). */
  beforeScope?: boolean;
  /** Chạy xuất; trả câu thông báo thành công, hoặc ném Error (hiện ngay dưới dòng nút xuất như bản cũ). */
  run: () => Promise<string | void> | string | void;
}

/** Tiêu đề trang kiểu web độ rung cũ (`.page-title-row > h1`). */
export function VcPageTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-title-row">
      <h1 id="title">{children}</h1>
    </div>
  );
}

/** Dòng chú thích (tiêu đề + gợi ý) kèm hàng nút xuất `.mill-caption`: dùng chung cho cả 4 màn. */
export function EntryCaption({
  title, hint, scopes, scope, onScope, actions, className, bare, messageId, onMessage,
}: {
  /** Có ⇒ thông báo xuất gửi lên trang bọc ngoài (vd. `#millMessage`) thay vì hiện tại chỗ. */
  onMessage?: (m: string) => void;
  title?: React.ReactNode;
  hint?: React.ReactNode;
  scopes: { value: string; label: string }[];
  scope: string;
  onScope: (v: string) => void;
  actions: ExportAction[];
  className?: string;
  /** true ⇒ chỉ dùng `className` (vd. `tbnt-caption`), không thêm `mill-caption`. */
  bare?: boolean;
  /** id của dòng thông báo xuất (`#dailyExportMessage`…); không truyền ⇒ không dựng dòng riêng. */
  messageId?: string;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState("");
  async function run(a: ExportAction) {
    if (busy) return;
    setBusy(a.key);
    try {
      const msg = await a.run();
      if (msg) (onMessage ?? setMessage)(msg);
      else setMessage("");
    } catch (e) {
      (onMessage ?? setMessage)(e instanceof Error ? e.message : "Không xuất được");
    } finally {
      setBusy(null);
    }
  }
  const btn = (a: ExportAction) => (
    <button key={a.key} type="button" className="secondary-button small" title={a.title} disabled={busy !== null} onClick={() => run(a)}>
      {busy === a.key ? "Đang xử lý…" : a.label}
    </button>
  );
  return (
    <>
      <div className={bare ? className : className ? `mill-caption ${className}` : "mill-caption"}>
        {(title || hint) && (
          <div>
            {title && <strong>{title}</strong>}
            {hint && <span>{hint}</span>}
          </div>
        )}
        <div className="mill-export">
          {actions.filter((a) => a.beforeScope).map(btn)}
          <select aria-label="Phạm vi xuất" title="Phạm vi xuất" value={scope} onChange={(e) => onScope(e.target.value)}>
            {scopes.map((s) => <option key={s.value} value={s.value}>Xuất: {s.label}</option>)}
          </select>
          {actions.filter((a) => !a.beforeScope).map(btn)}
        </div>
      </div>
      {messageId && <span id={messageId} role="status" aria-live="polite">{message}</span>}
      {!messageId && message && <p className="rs-msg" role="status" aria-live="polite">{message}</p>}
    </>
  );
}

/** Khung "Cách nhập" thu gọn. `list` = kiểu Mill (`details.mill-help > ul`), mặc định = `details.sheet-help-box > p`. */
export function EntryHelp({ title = "Cách nhập", list, children }: { title?: string; list?: boolean; children: React.ReactNode }) {
  if (list) {
    return (
      <details className="mill-help">
        <summary>{title}</summary>
        <ul>{children}</ul>
      </details>
    );
  }
  return (
    <details className="sheet-help-box">
      <summary>{title}</summary>
      <p className="sheet-help">{children}</p>
    </details>
  );
}

export function Swatch({ kind, children }: { kind: "red" | "yellow"; children: React.ReactNode }) {
  return <span className={kind === "red" ? "mill-key up2" : "mill-key up"}>{children}</span>;
}
