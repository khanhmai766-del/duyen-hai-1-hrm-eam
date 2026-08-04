"use client";

import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, Download, Flame, Plus, Star, Trash2, Wind, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  parseSeparationLog,
  parseTimelineJson,
  reviewNote,
  stringifyTimeline,
  TIMELINE_SECTIONS,
  TIMELINE_SECTION_ORDER,
  type TimelineParseResult,
  type TimelineSection,
} from "@/lib/separation-timeline";
import { cn } from "@/lib/utils";

/** Một dòng đang soạn. `review` chỉ sống trên giao diện, không lưu xuống DB. */
type Row = {
  id: number;
  section: TimelineSection;
  date: string;
  time: string;
  actor: string;
  content: string;
  key: boolean;
  review: boolean;
  note: string;
};

const TONE: Record<TimelineSection, { on: string; text: string; icon: typeof Flame }> = {
  boiler: { on: "border-[#C0392B] bg-[#C0392B]", text: "text-[#C0392B]", icon: Flame },
  turbine: { on: "border-[#0E6E8C] bg-[#0E6E8C]", text: "text-[#0E6E8C]", icon: Wind },
  elec: { on: "border-[#B87400] bg-[#B87400]", text: "text-[#B87400]", icon: Zap },
};

const ACTOR_SUGGESTIONS = [
  "VHV Máy trưởng", "VHV Máy phó", "VHV Lò trưởng", "VHV Lò phó", "VHV TBTH",
  "VHV Trực chính điện", "VHV Trực phụ điện", "VHV Máy nghiền", "VHV Thải xỉ",
  "Trưởng ca", "Trợ thủ", "PX.SCĐTĐ", "Nhóm công tác",
];

/**
 * Lưới cột dùng chung cho hàng tiêu đề và các dòng nhập.
 * Chỉ bung 6 cột từ `md` — dưới mức đó cột nội dung bị bóp còn vài pixel và chữ
 * rơi thành một ký tự mỗi dòng.
 */
const GRID = "grid gap-2 md:grid-cols-[26px_108px_92px_150px_minmax(0,1fr)_auto]";

let uid = 0;

/**
 * Soạn "Tiến trình tách lưới / khởi động" thành từng mốc có cấu trúc.
 *
 * Mỗi thao tác là một dòng: ngày · giờ · cương vị · nội dung. Có trình "Nhập từ
 * văn bản cũ" để dán nguyên nhật ký rồi soát. Dòng nào parser không chắc sẽ hiện
 * nền vàng kèm lý do, và KHÔNG cho lưu cho tới khi soát hết — đúng nguyên tắc
 * người xác nhận, máy chỉ gợi ý.
 */
export function SeparationTimelineEditor({
  value,
  rawProgress,
  defaultDate,
  label = "Tiến trình tách lưới",
  context,
  onChange,
}: {
  /** timelineJson hiện có. */
  value?: string | null;
  /** Văn bản gốc, dùng làm nội dung mặc định cho trình nhập. */
  rawProgress?: string | null;
  defaultDate?: string | Date | null;
  /** "Tiến trình tách lưới" hoặc "Tiến trình khởi động". */
  label?: string;
  /** Dòng ngữ cảnh nhỏ phía trên tiêu đề: thư mục · tổ máy. */
  context?: string;
  onChange: (timelineJson: string | null) => void;
}) {
  const [rows, setRows] = React.useState<Row[]>(() =>
    parseTimelineJson(value).map((e) => ({
      id: ++uid,
      section: e.section,
      date: e.date,
      time: e.time,
      actor: e.actor,
      content: e.content,
      key: e.key,
      review: false,
      note: "",
    }))
  );
  const [section, setSection] = React.useState<TimelineSection>("boiler");
  const [importOpen, setImportOpen] = React.useState(false);

  // Đẩy ngược lên form cha mỗi khi danh sách đổi. Còn dòng cần soát thì gửi null
  // để nút Lưu của form cha không nhận được dữ liệu nửa vời.
  const reviewCount = rows.filter((r) => r.review).length;
  React.useEffect(() => {
    if (reviewCount > 0) return;
    onChange(stringifyTimeline(rows.map(({ section, date, time, actor, content, key }) => ({ section, date, time, actor, content, key }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, reviewCount]);

  const visible = rows.filter((r) => r.section === section);
  const countOf = (s: TimelineSection) => rows.filter((r) => r.section === s).length;

  function patch(id: number, part: Partial<Row>) {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...part } : r)));
  }

  function addRow(inheritTime: boolean) {
    const last = [...rows].reverse().find((r) => r.section === section);
    setRows((list) => [
      ...list,
      {
        id: ++uid,
        section,
        date: last?.date ?? "",
        time: inheritTime ? nextMinute(last?.time ?? "") : "",
        actor: "",
        content: "",
        key: false,
        review: false,
        note: "",
      },
    ]);
  }

  function applyImport(parsed: TimelineParseResult) {
    const added: Row[] = parsed.events.map((e) => ({
      id: ++uid,
      // Không đoán được phần thì tạm xếp vào Lò hơi và bắt buộc soát —
      // không tự ý quyết định thay người dùng.
      section: e.section ?? "boiler",
      date: e.dateText,
      time: e.timeText,
      actor: e.actor ?? "",
      content: e.content + (e.subItems.length ? "\n" + e.subItems.map((x) => "• " + x).join("\n") : ""),
      key: e.isKey,
      review: e.needsReview || !e.section,
      note: e.needsReview || !e.section ? reviewNote(e) : "",
    }));
    setRows((list) => [...list, ...added]);
    setImportOpen(false);
    toast.success(`Đã chèn ${added.length} mốc${parsed.stats.needsReview ? ` · ${parsed.stats.needsReview} mốc cần soát` : ""}`);
  }

  return (
    <div className="space-y-3">
      {/* ----- Đầu mục ----- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {context && (
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{context}</div>
          )}
          <h3 className="mt-0.5 text-[24px] font-bold uppercase leading-none text-ink">Nhập {label.toLowerCase()}</h3>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Mỗi thao tác là một dòng. Nhập giờ riêng để hệ thống sắp xếp và tra cứu được về sau.
          </p>
        </div>
        <Button type="button" variant="outline" className="h-9 shrink-0" onClick={() => setImportOpen(true)}>
          <Download className="h-4 w-4" /> Nhập từ văn bản cũ
        </Button>
      </div>

      <div className="overflow-hidden rounded-[11px] border border-border bg-white">
      {/* ----- Thanh phần ----- */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {TIMELINE_SECTION_ORDER.map((s) => {
            const active = s === section;
            const Icon = TONE[s].icon;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={() => setSection(s)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-[15px] font-semibold uppercase tracking-[0.06em] transition-colors",
                  active ? `${TONE[s].on} text-white` : "border-input bg-white text-muted-foreground hover:text-ink"
                )}
              >
                <Icon className="h-4 w-4" />
                {TIMELINE_SECTIONS[s]}
                <span className={cn("rounded-full px-[7px] font-mono text-[11px]", active ? "bg-white/25" : "bg-muted")}>
                  {countOf(s)}
                </span>
              </button>
            );
          })}
        </div>
        {reviewCount > 0 ? (
          <span className="ml-auto text-[12.5px] font-semibold text-[#B87400]">
            ⚠ {reviewCount} dòng cần kiểm tra lại
          </span>
        ) : (
          <span className="ml-auto text-[12.5px] font-semibold text-[#0E8A5F]">
            ✓ Không còn dòng nào cần kiểm tra
          </span>
        )}
      </div>

      <div className="p-4">
        {reviewCount > 0 && (
          <p className="mb-3 flex items-start gap-2 rounded-lg border border-[#EBD4A6] bg-[#FDF4E3] px-3 py-2 text-[12px] text-[#7A4E00]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <b>{reviewCount} dòng</b> đang chờ soát. Xác nhận hoặc sửa hết thì tiến trình mới được lưu —
              văn bản gốc vẫn giữ nguyên nên không mất gì.
            </span>
          </p>
        )}

        {/* ----- Tiêu đề cột ----- */}
        <div className={cn(GRID, "hidden border-b border-border pb-1.5 md:grid")}>
          {["", "Ngày", "Giờ", "Cương vị", "Nội dung thao tác", ""].map((h, i) => (
            <span key={i} className="font-mono text-[10.5px] uppercase tracking-[0.13em] text-muted-foreground">
              {h}
            </span>
          ))}
        </div>

        {/* ----- Các dòng ----- */}
        <div>
          {visible.length === 0 ? (
            <p className="py-9 text-center text-[13px] text-muted-foreground">
              Chưa có dòng nào trong phần {TIMELINE_SECTIONS[section]}. Bấm “Thêm dòng” hoặc “Nhập từ văn bản cũ”.
            </p>
          ) : (
            visible.map((r, i) => (
              <div
                key={r.id}
                className={cn(
                  "border-b border-border/60 py-2.5 last:border-b-0",
                  r.review && "-mx-4 border-l-[3px] border-l-[#B87400] bg-[#FDF4E3] px-4"
                )}
              >
                <div className={GRID}>
                  <span className="hidden pt-2 text-center font-mono text-[11.5px] text-muted-foreground md:block">
                    {i + 1}
                  </span>
                  <Field
                    mono
                    placeholder="dd/mm/yyyy"
                    value={r.date}
                    onChange={(v) => patch(r.id, { date: v })}
                  />
                  <Field mono placeholder="hh:mm" value={r.time} onChange={(v) => patch(r.id, { time: v })} />
                  <Field
                    list="tl-actors"
                    placeholder="—"
                    value={r.actor}
                    onChange={(v) => patch(r.id, { actor: v })}
                  />
                  <AutoTextarea
                    value={r.content}
                    bold={r.key}
                    placeholder="Nội dung thao tác..."
                    onChange={(v) => patch(r.id, { content: v })}
                  />
                  <div className="flex gap-1 pt-0.5">
                    <IconButton
                      title="Đánh dấu mốc quan trọng"
                      active={r.key}
                      onClick={() => patch(r.id, { key: !r.key })}
                    >
                      <Star className={cn("h-3.5 w-3.5", r.key && "fill-current")} />
                    </IconButton>
                    <IconButton
                      title="Nhân đôi"
                      onClick={() =>
                        setRows((l) => {
                          const at = l.findIndex((x) => x.id === r.id);
                          return [...l.slice(0, at + 1), { ...r, id: ++uid, review: false, note: "" }, ...l.slice(at + 1)];
                        })
                      }
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton title="Xoá dòng" onClick={() => setRows((l) => l.filter((x) => x.id !== r.id))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                </div>

                {r.review && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-[#B87400] md:pl-[34px]">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <b className="font-semibold">Cần kiểm tra:</b> {r.note}
                    </span>
                    {/* Đổi phần ngay tại chỗ — lý do cần soát hay gặp nhất là xếp nhầm phần. */}
                    {TIMELINE_SECTION_ORDER.filter((s) => s !== r.section).map((s) => (
                      <Button
                        key={s}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => patch(r.id, { section: s })}
                      >
                        → {TIMELINE_SECTIONS[s]}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => patch(r.id, { review: false, note: "" })}
                    >
                      <Check className="h-3 w-3" /> Đã xác nhận đúng
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => addRow(false)}>
            <Plus className="h-3.5 w-3.5" /> Thêm dòng
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => addRow(true)}>
            <Plus className="h-3.5 w-3.5" /> Thêm nối giờ dòng cuối
          </Button>
          <span className="ml-auto text-[12.5px] text-muted-foreground">
            {rows.length} mốc · phần {TIMELINE_SECTIONS[section]}: {visible.length}
          </span>
        </div>
      </div>
      </div>

      <datalist id="tl-actors">
        {ACTOR_SUGGESTIONS.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        initialText={rawProgress ?? ""}
        defaultDate={defaultDate}
        onApply={applyImport}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Ô nhập                                                              *
 * ------------------------------------------------------------------ */

const FIELD =
  "w-full rounded-[7px] border border-input bg-white px-2.5 py-1.5 text-[13.5px] text-ink outline-none focus:border-[#00558F] focus:ring-1 focus:ring-[#00558F]";

function Field({
  value,
  onChange,
  placeholder,
  mono,
  list,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  list?: string;
}) {
  return (
    <input
      type="text"
      list={list}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(FIELD, mono && "font-mono")}
    />
  );
}

/** Ô nội dung tự cao dần theo số dòng — nhật ký hay có mốc dài vài câu. */
function AutoTextarea({
  value,
  onChange,
  placeholder,
  bold,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  bold?: boolean;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(FIELD, "min-h-[38px] resize-y leading-[1.5]", bold && "font-semibold")}
    />
  );
}

function IconButton({
  children,
  title,
  active,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border transition-colors",
        active
          ? "border-[#C0392B] bg-[#FCEDEB] text-[#C0392B]"
          : "border-input bg-white text-muted-foreground hover:border-[#00558F] hover:bg-[#EAF3FA] hover:text-[#00558F]"
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Trình nhập từ văn bản cũ                                            *
 * ------------------------------------------------------------------ */

const STEPS = ["1 · Dán nội dung", "2 · Soát kết quả", "3 · Chèn vào biểu mẫu"];

function ImportDialog({
  open,
  onClose,
  initialText,
  defaultDate,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  initialText: string;
  defaultDate?: string | Date | null;
  onApply: (parsed: TimelineParseResult) => void;
}) {
  const [text, setText] = React.useState(initialText);
  const [parsed, setParsed] = React.useState<TimelineParseResult | null>(null);

  React.useEffect(() => {
    if (open) {
      setText(initialText);
      setParsed(null);
    }
  }, [open, initialText]);

  function run() {
    if (!text.trim()) return toast.error("Chưa có nội dung để bóc tách");
    setParsed(
      parseSeparationLog(text, {
        defaultDate: defaultDate ?? null,
        defaultYear: defaultDate ? new Date(defaultDate).getFullYear() : undefined,
      })
    );
  }

  const step = parsed ? 2 : 1;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          "flex max-h-[88vh] w-[min(940px,100%)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-[14px]",
          "[&>button]:right-5 [&>button]:top-[18px] [&>button]:z-10 [&>button]:rounded-lg [&>button]:border [&>button]:border-white/20 [&>button]:bg-white/10 [&>button]:p-2 [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:opacity-100"
        )}
      >
        <div className="flex-none bg-gradient-to-b from-[#00426F] to-[#00558F] px-5 py-4 pr-16 text-white">
          <DialogTitle className="text-[22px] font-bold uppercase leading-none text-white">
            Nhập từ văn bản cũ
          </DialogTitle>
          <p className="mt-1 text-[12.5px] text-[#BFDCEE]">
            Dán nguyên nội dung trường tiến trình — hệ thống sẽ tự tách thành từng mốc.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3.5 flex gap-1.5">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={cn(
                  "flex-1 rounded-[7px] px-2.5 py-1.5 text-center text-[12px] font-semibold",
                  i + 1 === step ? "bg-[#00558F] text-white" : "bg-slate-100 text-muted-foreground"
                )}
              >
                {s}
              </div>
            ))}
          </div>

          {!parsed ? (
            <div className="space-y-3">
              <p className="rounded-lg border border-[#C5DEF0] bg-[#EAF3FA] px-3 py-2.5 text-[12.5px] leading-relaxed text-[#003A63]">
                Hệ thống nhận nhiều kiểu ghi giờ: <b>09:16</b>, <b>09h07&apos;16&quot;</b>,{" "}
                <b>Lúc 15h55&apos; ngày 08/07/2026</b>, và cả dòng chỉ ghi ngày đứng riêng. Tiêu đề{" "}
                <b>PHẦN LÒ HƠI / PHẦN MÁY / PHẦN ĐIỆN</b> dùng để chia nhóm. Dòng nào máy không chắc sẽ được đánh dấu
                vàng để soát, <b>không tự ý bỏ qua</b>.
              </p>
              <textarea
                rows={12}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Dán nội dung tiến trình vào đây..."
                className={cn(FIELD, "min-h-[220px] font-mono text-[12.5px] leading-[1.6]")}
              />
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[9px] border border-border bg-border sm:grid-cols-6">
                <Stat n={parsed.stats.total} label="Mốc bóc được" tone="ok" />
                {TIMELINE_SECTION_ORDER.map((s) => (
                  <Stat key={s} n={parsed.stats.bySection[s]} label={TIMELINE_SECTIONS[s]} color={TONE[s].text} />
                ))}
                <Stat n={parsed.stats.needsReview} label="Cần soát" tone={parsed.stats.needsReview ? "warn" : "ok"} />
                <Stat n={parsed.stats.orphanLines} label="Dòng sót" tone={parsed.stats.orphanLines ? "warn" : "ok"} />
              </div>

              <div className="max-h-[42vh] overflow-y-auto rounded-lg border border-border px-2.5">
                {parsed.events.map((e) => (
                  <div
                    key={e.seq}
                    className={cn(
                      "grid grid-cols-[86px_74px_1fr] items-start gap-2.5 border-b border-border/60 py-2 text-[13px] last:border-b-0",
                      e.needsReview && "-mx-2.5 rounded bg-[#FDF4E3] px-2.5"
                    )}
                  >
                    <div className="font-mono text-[12.5px] text-muted-foreground">
                      {e.dateText || "??/??"}
                      <br />
                      {e.timeText}
                    </div>
                    <div>
                      <span
                        className={cn(
                          "inline-block rounded px-2 text-[12px] font-bold uppercase tracking-[0.08em]",
                          e.section === "boiler" && "bg-[#FCEDEB] text-[#C0392B]",
                          e.section === "turbine" && "bg-[#E6F2F6] text-[#0E6E8C]",
                          e.section === "elec" && "bg-[#FDF4E3] text-[#B87400]",
                          !e.section && "bg-slate-100 text-muted-foreground"
                        )}
                      >
                        {e.section ? TIMELINE_SECTIONS[e.section] : "?"}
                      </span>
                    </div>
                    <div className="min-w-0 text-ink">
                      {e.actor && <b>{e.actor} · </b>}
                      {e.content}
                      {e.subItems.map((s, i) => (
                        <div key={i} className="mt-1 border-l-2 border-border pl-3 text-[12.5px] text-muted-foreground">
                          {s}
                        </div>
                      ))}
                      {e.measurements.length > 0 && (
                        <div className="mt-1 border-l-2 border-[#B87400] pl-3 text-[12.5px] text-muted-foreground">
                          {e.measurements.length} bảng số liệu đo đã nhận dạng
                        </div>
                      )}
                      {e.needsReview && (
                        <div className="mt-1 text-[11.5px] font-semibold text-[#B87400]">⚠ {reviewNote(e)}</div>
                      )}
                    </div>
                  </div>
                ))}

                {parsed.orphans.length > 0 && (
                  <div className="my-3 rounded-lg border border-[#EBD4A6] bg-[#FDF4E3] px-3 py-2.5 text-[12.5px] text-[#7A4E00]">
                    <b>{parsed.orphans.length} dòng không nhận được mốc thời gian</b> — sẽ không được chèn, cần nhập
                    tay:
                    {parsed.orphans.map((o, i) => (
                      <div key={i} className="mt-1 truncate font-mono text-[11.5px]">
                        {o.line}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-t border-border bg-slate-50 px-5 py-3">
          <span className="text-[12.5px] text-muted-foreground">
            {parsed
              ? parsed.stats.needsReview
                ? `${parsed.stats.needsReview} mốc sẽ được chèn kèm cờ vàng để soát lại.`
                : "Tất cả các mốc đều rõ ràng, có thể chèn thẳng."
              : "Văn bản gốc luôn được giữ nguyên trong cơ sở dữ liệu."}
          </span>
          <div className="flex gap-2">
            {parsed && (
              <Button type="button" variant="outline" onClick={() => setParsed(null)}>
                Quay lại
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="h-4 w-4" /> Đóng
            </Button>
            {parsed ? (
              <Button type="button" onClick={() => onApply(parsed)}>
                Chèn {parsed.stats.total} mốc
              </Button>
            ) : (
              <Button type="button" onClick={run}>
                Bóc tách
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ n, label, tone, color }: { n: number; label: string; tone?: "ok" | "warn"; color?: string }) {
  return (
    <div className="bg-white px-3 py-2.5">
      <div
        className={cn(
          "font-mono text-[20px] font-semibold leading-none",
          color ?? (tone === "warn" ? "text-[#B87400]" : tone === "ok" ? "text-[#0E8A5F]" : "text-ink")
        )}
      >
        {n}
      </div>
      <div className="mt-1 text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
    </div>
  );
}

/** "09:33" → "09:34". Dùng cho nút thêm dòng nối tiếp mốc cuối. */
function nextMinute(time: string): string {
  const [h, m] = time.split(/[:']/).map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const t = new Date(0, 0, 0, h, m + 1);
  return String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
}
