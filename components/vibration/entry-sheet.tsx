"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSaveVibrationRecords } from "@/hooks/useVibration";
import { MEASURE_GROUP_RANGES } from "@/lib/vibration/constants";
import type { VibrationDeviceDto, VibrationRecordDto, VibrationRecordInput } from "@/lib/vibration/types";
import { EntryGrid } from "./entry-grid";
import {
  applyUpdate, BLANK_ROW, enabledIdx, fmtDate, loadDraft, parseRow, rowFromRecord, storeDraft,
  type CellUpdate, type RowDraft,
} from "./entry-grid-model";

export interface EntrySheetProps {
  kind: "WEEKLY" | "MNK";
  date: string;
  /** Khoá nháp localStorage: Theo kỳ = ngày|cương vị, MNK = ngày|ca. Đổi khoá ⇒ remount (nạp nháp mới). */
  draftKey: string;
  /** Thiết bị đang xem (đã lọc theo cương vị/kỳ đo hoặc ca). */
  devices: VibrationDeviceDto[];
  /** Mọi bản ghi đã lưu của loại + ngày (không cần lọc theo thiết bị). */
  records: VibrationRecordDto[] | undefined;
  recordsLoading: boolean;
  /** Phần đầu dòng mô tả, ví dụ "Cương vị · Kỳ đo". */
  captionPrefix: string;
  noun: string;
  saveLabel: (n: number) => string;
  readOnly: boolean;
  /** Câu chỉ-xem thay cho câu mặc định (vd. ngoài cương vị). */
  readOnlyNotice?: string | null;
  showSystem: boolean;
  showPower: boolean;
  /** Các cột đo ẩn cố định (MNK_HIDE). */
  hiddenIdx?: readonly number[];
  /** Lớp bọc ngoài: `weekly-layout` | `mnk-layout`. */
  layoutClass: string;
  /** MNK: hướng dẫn nằm trong khung `.excel-entry`; Theo kỳ: nằm giữa dòng thông báo và bảng. */
  helpInside?: boolean;
  /** Thanh công cụ `.mill-toolbar` dựng bởi trang bọc ngoài; nhận ô Người đo và nút Lưu. */
  toolbar: (slots: { person: React.ReactNode; actions: React.ReactNode }) => React.ReactNode;
  /** Dòng nút xuất (Excel/PDF…) + hướng dẫn, dựng bởi trang bọc ngoài; nhận các hàm đọc dòng đang nhập. */
  exportSlot?: (api: SheetExportApi) => { caption: React.ReactNode; help: React.ReactNode };
}

/** Dữ liệu bảng đang nhập (gồm bản nháp chưa lưu) cho phần xuất file. */
export interface SheetExportApi {
  rowOf: (deviceId: string) => RowDraft;
  person: string;
  savedRecords: Record<string, VibrationRecordDto>;
  isDirty: (deviceId: string) => boolean;
  /** "Cương vị · Kỳ · dd/mm/yyyy · n/N thiết bị đã lưu" */
  summary: string;
  hint: string;
}

const DEFAULT_MESSAGE = "Lưu lại trong ngày sẽ thay số liệu cùng ngày; sang ngày mới bảng hiện số liệu ngày mới.";
const HINT = "Ô trống là chưa đo, không phải số 0 · dấu chấm thập phân (14.6).";
const SPARE_NOTE = "Thiết bị không vận hành phải ghi nhận xét “Máy dự phòng” hoặc “Ngừng sửa chữa”…";

/** Bảng nhập: giữ nháp, người đo, lưu cả bảng / lưu riêng. Thanh chọn (ngày, cương vị, ca…) do trang bọc ngoài. */
export function EntrySheet(props: EntrySheetProps) {
  const { kind, date, draftKey, devices, records, recordsLoading, captionPrefix, noun, saveLabel, readOnly, readOnlyNotice, showSystem, showPower, hiddenIdx, layoutClass, helpInside, toolbar, exportSlot } = props;
  const { data: session } = useSession();
  const qc = useQueryClient();
  const save = useSaveVibrationRecords();

  const [stored] = React.useState(() => loadDraft(draftKey));
  const [draft, setDraft] = React.useState<Record<string, RowDraft>>(stored.rows);
  const [personEdited, setPersonEdited] = React.useState<string | null>(stored.person);
  const [message, setMessage] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState<Set<string>>(() => new Set());
  const [savingId, setSavingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    storeDraft(draftKey, { person: personEdited, rows: draft });
  }, [draftKey, draft, personEdited]);

  const savedRecords = React.useMemo(() => {
    const ids = new Set(devices.map((d) => d.id));
    const map: Record<string, VibrationRecordDto> = {};
    for (const r of records ?? []) if (ids.has(r.deviceId)) map[r.deviceId] = r;
    return map;
  }, [records, devices]);
  const savedRows = React.useMemo(() => {
    const map: Record<string, RowDraft> = {};
    for (const [id, r] of Object.entries(savedRecords)) map[id] = rowFromRecord(r);
    return map;
  }, [savedRecords]);

  const savedPerson = Object.values(savedRecords)[0]?.person ?? "";
  const person = personEdited ?? (savedPerson || session?.user?.name || "");

  const visibleIdx = React.useMemo(() => {
    const hidden = new Set(hiddenIdx ?? []);
    const out: number[] = [];
    for (let i = 0; i < 23; i++) {
      if (hidden.has(i)) continue;
      const g = MEASURE_GROUP_RANGES.find((x) => i >= x.from && i <= x.to);
      // Ẩn cả nhóm khi không thiết bị nào trong danh sách bật nhóm đó (trừ khi đang có số nháp ở ô).
      const used = devices.some((d) => enabledIdx(d, i) || (draft[d.id]?.v[i] ?? "") !== "");
      if (g && used) out.push(i);
    }
    return out;
  }, [devices, draft, hiddenIdx]);

  const savedRowsRef = React.useRef(savedRows);
  React.useEffect(() => {
    savedRowsRef.current = savedRows;
  }, [savedRows]);

  const onUpdate = React.useCallback((updates: CellUpdate[]) => {
    setDraft((prev) => {
      const next = { ...prev };
      for (const u of updates) next[u.id] = applyUpdate(next[u.id] ?? savedRowsRef.current[u.id] ?? BLANK_ROW, u.col, u.value);
      return next;
    });
    setMissing((prev) => (prev.size ? new Set([...prev].filter((id) => !updates.some((u) => u.id === id))) : prev));
  }, []);
  const rowOf = (id: string) => draft[id] ?? savedRows[id] ?? BLANK_ROW;

  const total = devices.length;
  const savedCount = devices.filter((d) => savedRecords[d.id]).length;

  function fail(text: string) {
    setMessage(text);
    toast.error(`Chưa lưu: ${text}`);
  }

  /** Lưu các thiết bị đã chọn; trả true nếu thành công. */
  async function persist(list: VibrationDeviceDto[], whole: boolean): Promise<boolean> {
    if (!person.trim()) {
      fail("Vui lòng nhập người đo.");
      return false;
    }
    const items: VibrationRecordInput[] = [];
    for (const d of list) {
      const p = parseRow(d, rowOf(d.id), kind === "WEEKLY" && showPower);
      if (p.error) {
        fail(`${d.name}: ${p.error}`);
        return false;
      }
      if (!p.empty && p.item) items.push({ ...p.item, person: person.trim() });
    }
    if (!items.length) {
      fail(`Chưa có ${noun} nào được nhập thông số hoặc nhận xét. ${SPARE_NOTE}`);
      return false;
    }
    try {
      await save.mutateAsync({ kind, date, items });
      await qc.refetchQueries({ queryKey: ["vibration-records"] });
      const done = new Set(items.map((i) => i.deviceId));
      setDraft((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !done.has(id))));
      setPersonEdited(null);
      const text = whole ? `Đã lưu bảng ${items.length} thiết bị ngày ${date}; dữ liệu cùng ngày được thay thế.` : `Đã lưu riêng thiết bị ngày ${date}; dữ liệu cùng ngày được thay thế.`;
      setMessage(text);
      toast.success(text);
      return true;
    } catch (e) {
      fail(e instanceof Error ? e.message : "Không lưu được số đo");
      return false;
    }
  }

  async function saveRow(id: string) {
    const d = devices.find((x) => x.id === id);
    if (!d || readOnly) return;
    setSavingId(id);
    await persist([d], false);
    setSavingId(null);
  }

  async function saveAll() {
    if (readOnly || savingId) return;
    const empties = devices.filter((d) => parseRow(d, rowOf(d.id), false).empty);
    setMissing(new Set(empties.map((d) => d.id)));
    if (empties.length === devices.length) {
      fail(`Chưa có thiết bị nào được nhập thông số hoặc nhận xét (${empties.length} thiết bị). ${SPARE_NOTE}`);
      return;
    }
    if (empties.length) {
      const list = empties.slice(0, 15).map((d) => `• ${d.name}`).join("\n") + (empties.length > 15 ? `\n… và ${empties.length - 15} thiết bị khác` : "");
      const ok = window.confirm(
        `Còn ${empties.length} thiết bị CHƯA nhập thông số và CHƯA có nhận xét:\n${list}\n\n${SPARE_NOTE}\n\nOK: lưu các thiết bị đã nhập · Hủy: quay lại nhập tiếp (dòng thiếu được tô màu).`
      );
      if (!ok) {
        setMessage(`Còn ${empties.length} thiết bị chưa nhập thông số và chưa có nhận xét (đã tô màu). Thiết bị không vận hành ghi “Máy dự phòng” hoặc “Ngừng sửa chữa”.`);
        toast.warning(`Chưa lưu — còn ${empties.length} thiết bị chưa nhập (đã tô màu dòng thiếu).`);
        return;
      }
    }
    setSavingId("all");
    const ok = await persist(devices, true);
    if (ok) setMissing(new Set());
    setSavingId(null);
  }

  const summary = `${captionPrefix} · ${fmtDate(date)} · ${savedCount}/${total} ${noun} đã lưu`;
  const exp = exportSlot?.({ rowOf, person, savedRecords, isDirty: (id) => draft[id] !== undefined, summary, hint: HINT });

  const personField = (
    <label>
      Người đo
      <input id="weekPerson" value={person} disabled={readOnly} maxLength={120} placeholder="Họ tên người đo" onChange={(e) => setPersonEdited(e.target.value)} />
    </label>
  );
  const actions = (
    <div className="mill-actions">
      <button id="saveWeek" type="button" className="primary-button" disabled={readOnly || savingId !== null || !total} onClick={() => saveAll()}>
        {savingId === "all" ? "Đang lưu…" : saveLabel(total)}
      </button>
    </div>
  );

  const help = exp?.help;
  return (
    <section className={`mill-entry ${layoutClass}`}>
      {toolbar({ person: personField, actions })}
      {exp?.caption}
      <p id="weekMessage" role="status">{message ?? DEFAULT_MESSAGE}</p>
      {readOnly && <p className="rs-msg" data-kind="warn">{readOnlyNotice || "Bạn chỉ có quyền xem — không thể nhập hoặc lưu số đo."}</p>}
      {!helpInside && help}
      <section className={`panel excel-entry${helpInside ? " mnk-entry" : ""}`}>
        {helpInside && help}
        {recordsLoading ? (
          <p className="rs-msg">Đang tải số đo đã lưu...</p>
        ) : (
          <EntryGrid
            date={date}
            person={person}
            devices={devices}
            draft={draft}
            savedRows={savedRows}
            missing={missing}
            readOnly={readOnly}
            showSystem={showSystem}
            showPower={showPower}
            visibleIdx={visibleIdx}
            savingId={savingId}
            onUpdate={onUpdate}
            onSaveRow={saveRow}
            onMessage={setMessage}
          />
        )}
      </section>
    </section>
  );
}
