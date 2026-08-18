/**
 * Chuẩn hoá cương vị / cấp giám sát của module PCCC về danh mục chức danh chung
 * (`lib/position-catalog.ts` — nguồn chuẩn duy nhất của hệ thống).
 *
 * QUY ƯỚC (đã chốt với nghiệp vụ):
 *  1. Nhãn KHÔNG mang hậu tố tổ máy: lưu "Lò phó", không lưu "LÒ PHÓ S1".
 *  2. Tổ máy tách thành trường riêng `machine` = S1 | S2 | COMMON — giống
 *     `EquipmentProfile.machine` / `DeviceQrCard.machine` đã có trong repo.
 *  3. PHÂN QUYỀN THEO MÃ chức danh, bỏ qua tổ máy: một người mang chức danh "Lò phó"
 *     vào được dữ liệu của cả S1 và S2, vì cùng một chức danh thực tế đi vận hành
 *     được cả hai tổ máy. Thu hẹp theo tổ máy chỉ là BỘ LỌC XEM, không phải rào quyền.
 *  4. Lưu cả mã (`cuongViCode`) và nhãn (`cuongVi`): đổi cách viết nhãn về sau không
 *     làm sai phân quyền hay lọc lịch sử.
 *
 * Cột "Người giám sát" trong bảng gốc KHÔNG phải tên người mà là CẤP GIÁM SÁT
 * (TKLM → TK Lò máy, TKĐ → Trưởng kíp điện, Trưởng ca) — chuẩn hoá cùng một danh mục.
 */
import { positionCatalogItem, positionCodeOf, type PositionCode } from "@/lib/position-catalog";

export const PCCC_MACHINES = ["S1", "S2", "COMMON"] as const;
export type PcccMachine = (typeof PCCC_MACHINES)[number];

export const MACHINE_LABEL: Record<PcccMachine, string> = {
  S1: "Tổ máy 1",
  S2: "Tổ máy 2",
  // Gọi "Common" cho khớp cách các module khác của hệ thống hiển thị phạm vi này
  // (vd thẻ thiết bị ghi "COMMON · Dùng chung").
  COMMON: "Common",
};

export function isPcccMachine(value: unknown): value is PcccMachine {
  return typeof value === "string" && (PCCC_MACHINES as readonly string[]).includes(value);
}

/**
 * Hậu tố "cả hai tổ máy": "ESP S1/S2", "ESP S1 & S2", "ESP S1, S2", "ESP S1-2"…
 * Có thật trong dữ liệu: nhà điều khiển ESP dùng chung cho cả hai tổ máy.
 *
 * Quy về COMMON chứ KHÔNG chọn bừa một tổ máy — theo quy ước 2/3 ở đầu file, tổ máy là
 * chiều LỌC XEM chứ không phải một phần của nhãn cương vị. Muốn tách S1/S2 thì dùng bộ
 * lọc Tổ máy trên trang.
 */
const BOTH_UNITS_SUFFIX = /[\s-]+S\s*1\s*[/&,+-]\s*(?:S\s*)?2\s*$/i;

/**
 * Tách hậu tố tổ máy khỏi chuỗi cương vị: "LÒ PHÓ S1" → { base: "LÒ PHÓ", machine: "S1" }.
 *
 * `explicit` = chuỗi CÓ nói rõ tổ máy hay không. Phân biệt "không có hậu tố" (giữ tổ máy
 * đang lưu trong DB) với "ghi rõ là dùng chung cả hai" (ép về COMMON) — thiếu cờ này thì
 * dòng ghi rõ S1/S2 lại bị kéo về tổ máy cũ đang lưu.
 */
export function splitMachineSuffix(raw: string): { base: string; machine: PcccMachine; explicit: boolean } {
  const value = raw.trim();
  const both = value.match(BOTH_UNITS_SUFFIX);
  if (both) return { base: value.slice(0, both.index).trim(), machine: "COMMON", explicit: true };
  const m = value.match(/[\s-]+(S\s*[12])\s*$/i);
  if (!m) return { base: value, machine: "COMMON", explicit: false };
  const machine = m[1].replace(/\s+/g, "").toUpperCase() as PcccMachine;
  return { base: value.slice(0, m.index).trim(), machine, explicit: true };
}

export type NormalizedPosition = {
  /** Nhãn hiển thị theo danh mục, không hậu tố tổ máy. Null nếu đầu vào rỗng. */
  label: string | null;
  code: PositionCode | null;
  machine: PcccMachine;
  /** true khi KHÔNG khớp danh mục — giữ nguyên nhãn gốc để không mất dữ liệu. */
  unmatched: boolean;
};

/**
 * Chuẩn hoá 1 giá trị cương vị. Không khớp danh mục thì GIỮ NGUYÊN nhãn gốc (đã bỏ
 * hậu tố tổ máy) và đánh dấu `unmatched` — thà hiện giá trị lạ để người dùng thấy còn
 * hơn âm thầm xoá dữ liệu.
 *
 * `currentMachine` là tổ máy đang lưu trong DB. BẮT BUỘC truyền vào khi chuẩn hoá lại
 * dữ liệu đã chuẩn hoá: lúc đó nhãn không còn hậu tố nữa, nếu chỉ suy từ nhãn thì mọi
 * dòng sẽ bị đưa về COMMON — mất tổ máy. Có hậu tố trong nhãn thì hậu tố thắng.
 */
export function normalizePosition(
  raw: string | null | undefined,
  currentMachine?: string | null
): NormalizedPosition {
  const value = String(raw ?? "").trim();
  const fallback: PcccMachine = isPcccMachine(currentMachine) ? currentMachine : "COMMON";
  if (!value) return { label: null, code: null, machine: fallback, unmatched: false };

  const split = splitMachineSuffix(value);
  const base = split.base;
  // Chuỗi có nói rõ tổ máy thì hậu tố THẮNG (kể cả khi nói rõ là dùng chung cả hai);
  // không nói gì thì giữ tổ máy đang lưu trong DB.
  const machine = split.explicit ? split.machine : fallback;
  // positionCodeOf tự bỏ hậu tố S1/S2 khi so khớp, nên tra bằng chuỗi gốc vẫn đúng.
  const item = positionCatalogItem(value) ?? positionCatalogItem(base);
  if (!item) return { label: base || value, code: null, machine, unmatched: true };

  // Chức danh chỉ tồn tại ở cấp dùng chung (units = ["COMMON"]) thì bỏ hậu tố tổ máy
  // nếu dữ liệu gốc có ghi nhầm.
  const supportsUnit = item.units.includes(machine);
  return {
    label: item.label,
    code: item.code,
    machine: supportsUnit ? machine : "COMMON",
    unmatched: false,
  };
}

/** Nhãn đầy đủ để hiển thị khi cần kèm tổ máy: "Lò phó · Tổ máy 1". */
export function positionWithMachine(label: string | null, machine: string | null) {
  if (!label) return "—";
  if (!machine || machine === "COMMON") return label;
  return `${label} ${machine}`;
}

export { positionCodeOf };
