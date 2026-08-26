import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, auditDetailWithPosition, fail, handle, ok, requireUser } from "@/lib/api";
import {
  assertPcccScope,
  assertPeriodWritable,
  resolvePcccWriteScope,
  resolvePeriod,
  type PcccScopeTable,
} from "@/lib/pccc-service";
import { positionLabelOf, type PositionCode } from "@/lib/position-catalog";
import { isPcccMachine } from "@/lib/pccc-position";
import {
  ALARM_BUTTON_GROUPS,
  CHUNG_LOAI_OPTIONS,
  LIGHT_TINH_TRANG_OPTIONS,
  VALVE_LOAI_OPTIONS,
  deriveCabinetStatus,
  isPcccLightLoai,
} from "@/lib/pccc-status";

export const dynamic = "force-dynamic";

const KINDS = ["EXTINGUISHER", "CABINET", "FIRE_CONTROL_CABINET", "BULK", "FM200_PANEL", "ALARM_BUTTON", "VALVE", "EMERGENCY_LIGHT"] as const;
type CreateKind = (typeof KINDS)[number];

function text(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: unknown) {
  return text(value) || null;
}

function nullableNumber(value: unknown) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw fail("Giá trị số không hợp lệ");
  return parsed;
}

function componentsOf(groups: readonly { label: string; statuses: readonly string[] }[]) {
  return groups.flatMap((group, groupOrder) =>
    group.statuses.map((status, statusOrder) => ({ groupLabel: group.label, status, checked: statusOrder === 0, groupOrder, statusOrder }))
  );
}

async function nextStt(kind: CreateKind, periodId: string) {
  if (kind === "FM200_PANEL") return 1;
  const delegate = {
    EXTINGUISHER: prisma.pcccExtinguisher,
    CABINET: prisma.pcccCabinet,
    FIRE_CONTROL_CABINET: prisma.pcccFireControlCabinet,
    BULK: prisma.pcccBulk,
    ALARM_BUTTON: prisma.pcccAlarmButton,
    VALVE: prisma.pcccValve,
    EMERGENCY_LIGHT: prisma.pcccEmergencyLight,
  }[kind];
  const row = await (delegate as { findFirst(args: unknown): Promise<{ stt: number | null } | null> }).findFirst({
    where: { periodId },
    orderBy: { stt: "desc" },
    select: { stt: true },
  });
  return (row?.stt ?? 0) + 1;
}

function tableOf(kind: CreateKind): PcccScopeTable {
  if (kind === "EXTINGUISHER") return "EXTINGUISHER";
  if (kind === "CABINET") return "CABINET";
  if (kind === "FIRE_CONTROL_CABINET") return "FIRE_CONTROL_CABINET";
  if (kind === "BULK") return "BULK";
  if (kind === "FM200_PANEL") return "FM200_PANEL";
  if (kind === "ALARM_BUTTON") return "ALARM_BUTTON";
  if (kind === "VALVE") return "VALVE";
  return "EMERGENCY_LIGHT";
}

// POST /api/pccc/items — cửa tạo mới thống nhất cho mọi nhóm thiết bị PCCC.
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = (await req.json()) as Record<string, unknown>;
    const kind = text(body.kind) as CreateKind;
    if (!(KINDS as readonly string[]).includes(kind)) return fail("Loại thiết bị PCCC không hợp lệ");

    const period = await resolvePeriod(text(body.period) || null);
    assertPeriodWritable(period);
    if (!period.allowItemCreation) {
      return fail("Chức năng thêm thiết bị PCCC đang tắt. Cấp quản lý phải bật công tắc thêm mới trước khi thao tác.", 423);
    }
    const scope = await resolvePcccWriteScope(user, "Không đủ quyền thêm thiết bị PCCC", tableOf(kind));

    const cuongViCode = nullableText(body.cuongViCode) as PositionCode | null;
    const machine = isPcccMachine(body.machine) ? body.machine : "COMMON";
    assertPcccScope(scope, { cuongViCode });
    const common = { cuongViCode, cuongVi: cuongViCode ? positionLabelOf(cuongViCode) : null, machine };
    const stt = await nextStt(kind, period.id);
    let created: { id: string } & Record<string, unknown>;
    let detail = "";

    try {
      if (kind === "EXTINGUISHER") {
        const ma = text(body.ma);
        const chungLoai = text(body.chungLoai);
        if (!ma || !(CHUNG_LOAI_OPTIONS as readonly string[]).includes(chungLoai)) return fail("Nhập mã và chọn đúng chủng loại bình");
        created = await prisma.pcccExtinguisher.create({ data: {
          periodId: period.id, stt, ma, chungLoai, ...common,
          viTri: nullableText(body.viTri), viTriHienTai: nullableText(body.viTriHienTai) ?? nullableText(body.viTri),
          nguoiGiamSatCode: nullableText(body.nguoiGiamSatCode),
          nguoiGiamSat: body.nguoiGiamSatCode ? positionLabelOf(text(body.nguoiGiamSatCode)) : null,
          sl: nullableNumber(body.sl) ?? 1, dvt: nullableText(body.dvt) ?? "Bình",
          nguonGoc: nullableText(body.nguonGoc), tinhTrang: "Chưa cập nhật",
        } } as never) as typeof created;
        detail = ma;
      } else if (kind === "CABINET") {
        const ma = text(body.ma);
        if (!ma) return fail("Nhập mã tủ chữa cháy");
        const template = await prisma.pcccCabinet.findFirst({ where: { periodId: period.id }, include: { components: { orderBy: [{ groupOrder: "asc" }, { statusOrder: "asc" }] } } });
        if (!template?.components.length) return fail("Kỳ này chưa có mẫu cấu trúc linh kiện tủ chữa cháy để tạo mới");
        const components = template.components.map(({ groupLabel, status, groupOrder, statusOrder }) => ({ groupLabel, status, groupOrder, statusOrder, checked: statusOrder === 0 }));
        created = await prisma.pcccCabinet.create({ data: {
          periodId: period.id, stt, ma, ...common, ten: nullableText(body.ten), viTri: nullableText(body.viTri),
          sl: nullableNumber(body.sl) ?? 1, dvt: nullableText(body.dvt) ?? "Tủ", tinhTrangTongThe: deriveCabinetStatus(components),
          components: { create: components },
        }, include: { components: true } }) as typeof created;
        detail = ma;
      } else if (kind === "FIRE_CONTROL_CABINET") {
        const ma = text(body.ma); const heThong = text(body.heThong);
        if (!ma || !heThong) return fail("Nhập mã tủ và hệ thống chữa cháy");
        created = await prisma.pcccFireControlCabinet.create({ data: { periodId: period.id, stt, ma, heThong, ...common, viTri: nullableText(body.viTri), tinhTrang: "Chưa cập nhật", ghiChu: nullableText(body.ghiChu) } }) as typeof created;
        detail = ma;
      } else if (kind === "BULK") {
        const ten = text(body.ten);
        if (!["Bồn Foam", "Bồn CO2", "Mức dầu DO bơm chữa cháy Diesel"].includes(ten)) return fail("Chọn đúng loại bồn hoặc mức dầu Diesel");
        const thietKe = nullableNumber(body.khoiLuongThietKe); const hienTai = nullableNumber(body.khoiLuongHienTai);
        const phanTramConLai = thietKe && hienTai != null ? (hienTai / thietKe) * 100 : null;
        created = await prisma.pcccBulk.create({ data: { periodId: period.id, stt, ten, ...common, viTri: nullableText(body.viTri), dvt: nullableText(body.dvt) ?? "%", khoiLuongThietKe: thietKe, khoiLuongHienTai: hienTai, phanTramConLai, ghiChu: nullableText(body.ghiChu) } }) as typeof created;
        detail = ten;
      } else if (kind === "FM200_PANEL") {
        const panelKey = text(body.panelKey); const title = text(body.title); const labels = text(body.binhLabels).split(",").map((x) => x.trim()).filter(Boolean);
        if (!panelKey || !title || labels.length === 0) return fail("Nhập mã bảng, tên bảng và danh sách bình FM200");
        const emptyValues = Object.fromEntries(labels.map((label) => [label, null]));
        created = await prisma.pcccFm200Panel.create({ data: { periodId: period.id, panelKey, title, binhLabels: labels, ...common, mucMin: nullableNumber(body.mucMin), mucMax: nullableNumber(body.mucMax), mucDvt: nullableText(body.mucDvt), mucValues: emptyValues, apMin: nullableNumber(body.apMin), apMax: nullableNumber(body.apMax), apDvt: nullableText(body.apDvt), apValues: emptyValues } }) as typeof created;
        detail = title;
      } else if (kind === "ALARM_BUTTON") {
        const maKks = text(body.maKks); if (!maKks) return fail("Nhập mã KKS nút nhấn báo cháy");
        const components = componentsOf(ALARM_BUTTON_GROUPS);
        created = await prisma.pcccAlarmButton.create({ data: { periodId: period.id, stt, rowKey: `${maKks}#${stt}`, maKks, ...common, tenKhuVuc: nullableText(body.tenKhuVuc), viTri: nullableText(body.viTri), nguoiGiamSatCode: nullableText(body.nguoiGiamSatCode), nguoiGiamSat: body.nguoiGiamSatCode ? positionLabelOf(text(body.nguoiGiamSatCode)) : null, tinhTrangTongThe: deriveCabinetStatus(components), khac: nullableText(body.ghiChu), components: { create: components } }, include: { components: true } }) as typeof created;
        detail = maKks;
      } else if (kind === "VALVE") {
        const maKks = text(body.maKks); const tenVan = text(body.tenVan); const loaiVan = text(body.loaiVan);
        if (!maKks || !tenVan || !(VALVE_LOAI_OPTIONS as readonly string[]).includes(loaiVan)) return fail("Nhập mã KKS, tên van và chọn đúng loại van");
        created = await prisma.pcccValve.create({ data: { periodId: period.id, stt, rowKey: `${maKks}#${stt}`, maKks, tenVan, loaiVan, ...common, viTri: nullableText(body.viTri), nguoiGiamSatCode: nullableText(body.nguoiGiamSatCode), nguoiGiamSat: body.nguoiGiamSatCode ? positionLabelOf(text(body.nguoiGiamSatCode)) : null, tinhTrang: "Chưa cập nhật", moTa: nullableText(body.ghiChu) } }) as typeof created;
        detail = maKks;
      } else {
        const maKks = text(body.maKks); const loai = text(body.loai);
        if (!maKks || !isPcccLightLoai(loai)) return fail("Nhập mã KKS và chọn đúng loại đèn");
        created = await prisma.pcccEmergencyLight.create({ data: { periodId: period.id, stt, rowKey: `${maKks}#${stt}`, maKks, loai, ...common, tenKhuVuc: nullableText(body.tenKhuVuc), maBanVe: nullableText(body.maBanVe), soLuongKhuVuc: nullableNumber(body.soLuongKhuVuc), nguoiGiamSatCode: nullableText(body.nguoiGiamSatCode), nguoiGiamSat: body.nguoiGiamSatCode ? positionLabelOf(text(body.nguoiGiamSatCode)) : null, tinhTrang: LIGHT_TINH_TRANG_OPTIONS[0], ghiChu: nullableText(body.ghiChu) } }) as typeof created;
        detail = maKks;
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return fail("Mã hoặc tên thiết bị này đã tồn tại trong kỳ", 409);
      throw error;
    }

    await audit(user.id, `CREATE_PCCC_${kind}`, `Pccc${kind}`, created.id, auditDetailWithPosition(user, `${period.label} · ${detail}`), { afterData: created });
    return ok({ ...created, kind });
  });
}
