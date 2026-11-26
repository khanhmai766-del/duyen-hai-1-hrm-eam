import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handle, ok } from "@/lib/api";
import { foldVn } from "@/lib/vibration/parse";
import { groupsOf, inWeekly } from "@/lib/vibration/classify";
import { MNK_SHIFT_NAMES, SHIFT_IDS } from "@/lib/vibration/constants";
import { requireVibrationView, toDeviceDto } from "@/lib/vibration/server";

export const dynamic = "force-dynamic";

const nfc = (s: string) => s.normalize("NFC").toLocaleLowerCase("vi");

/** Danh sách thiết bị đo độ rung kèm ánh xạ cây thiết bị.
 *  Query: kind=WEEKLY|MNK|MILL|TBNT, area, active=true|false|all (mặc định true), mapStatus=none|auto|confirmed,
 *  group (kỳ đo, chỉ có nghĩa với kind=WEEKLY), q (tìm không dấu theo tên/hệ thống/khu vực/mã cũ). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireVibrationView();
    const p = req.nextUrl.searchParams;
    const kind = p.get("kind");
    const area = p.get("area")?.trim();
    const active = p.get("active") ?? "true";
    const mapStatus = p.get("mapStatus");
    const group = p.get("group");
    const q = foldVn(p.get("q")?.trim() ?? "");

    const where: Prisma.VibrationDeviceWhereInput = {
      ...(area ? { area } : {}),
      ...(active === "all" ? {} : { active: active !== "false" }),
      ...(mapStatus === "none" || mapStatus === "auto" || mapStatus === "confirmed" ? { mapStatus } : {}),
    };
    const rows = await prisma.vibrationDevice.findMany({ where, orderBy: [{ area: "asc" }, { sortOrder: "asc" }, { name: "asc" }] });
    let dtos = rows.map((r) => toDeviceDto(r));

    if (kind === "WEEKLY") {
      dtos = dtos.filter((d) => inWeekly(d) && (!group || groupsOf(d.measureGroups).includes(group)));
    } else if (kind === "MNK" || kind === "MILL" || kind === "TBNT") {
      dtos = dtos.filter((d) => d.kind === kind);
    }
    if (q) dtos = dtos.filter((d) => foldVn(`${d.name} ${d.system} ${d.area} ${d.legacyId}`).includes(q));

    const collator = new Intl.Collator("vi", { numeric: true });
    if (kind === "MNK") {
      const order = SHIFT_IDS.flatMap((s) => MNK_SHIFT_NAMES[s].map(nfc));
      dtos.sort((a, b) => order.indexOf(nfc(a.name)) - order.indexOf(nfc(b.name)));
    } else if (kind === "MILL" || kind === "TBNT") {
      dtos.sort((a, b) => collator.compare(a.name, b.name));
    }

    const seqs = [...new Set(dtos.flatMap((d) => [d.equipmentSeq, d.suggestSeq].filter((x): x is string => !!x)))];
    if (seqs.length) {
      const nodes = await prisma.equipmentNode.findMany({ where: { seq: { in: seqs } }, select: { seq: true, name: true } });
      const names = new Map(nodes.map((n) => [n.seq, n.name]));
      for (const d of dtos) {
        d.equipmentName = d.equipmentSeq ? names.get(d.equipmentSeq) ?? null : null;
        d.suggestName = d.suggestSeq ? names.get(d.suggestSeq) ?? null : null;
      }
    }
    return ok(dtos, { total: dtos.length });
  });
}
