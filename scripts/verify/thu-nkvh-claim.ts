// Thử (rồi HOÀN TÁC) luồng tiện ích Cấp số PCT NKVH trên DB dev: lấy số, bấm lại không tốn số,
// đồng bộ nội dung, phiếu giấy lấy sau nhảy qua số đã cấp, báo hủy về sổ (số hủy bị bỏ).
// Không để lại dữ liệu.
//   npx tsx scripts/verify/thu-nkvh-claim.ts
import { PrismaClient } from "@prisma/client";
import { cancelNkvhPermit, claimNkvhPermit, parseNkvhPage, syncNkvhPermit } from "@/lib/server/work-permit-nkvh-claim";
import { reservePermitNumber } from "@/lib/server/work-permit-number-reservations";

const db = new PrismaClient();
const user = { id: "thu-nkvh", name: "Người Thử", role: "TECHNICAL" };
const PCT = "8bf98ecd-6b07-4a92-9d7a-92d4ed44b667";
const tcnh = {
  registrationNumber: "653326/ĐK-SCCN", teamCode: "PCN", teamLabel: "Phân xưởng Sữa chữa Cơ nhiệt", classification: "PLCT.PL.001",
  disciplines: ["Cơ", "Nhiệt"], location: "Bồn dầu tuabin chính - Tuabin S1 DH1",
  content: "Gia công, lắp đặt đường ống đầu hút/ thoát máy lọc dầu di động. KKS 10MAV10BB001.", workScope: "",
  plannedStartAt: "23/09/2026 13:30:00", plannedEndAt: "07/10/2026 17:00:00", commanderName: "", leaderName: "", workerCount: "",
  issuerName: "1453 - Mai Đoàn Kim Khánh",
};

async function main() {
  try {
    await db.$transaction(async tx => {
      const year = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric" }).format(new Date()));
      const baseline = await tx.workPermitNumberBaseline.findFirst({ where: { kind: "MECHANICAL", year } });
      if (!baseline) await tx.workPermitNumberBaseline.create({ data: { kind: "MECHANICAL", year, number: "4000", updatedById: "thu" } });

      const first = await claimNkvhPermit(tx, user, { kind: "MECHANICAL", nkvhPctId: PCT, page: parseNkvhPage(tcnh, "MECHANICAL"), unit: "S1", position: "Lò phó" });
      console.log("1) lấy số:", first.formatted, "| tạo mới:", first.created);
      const row = await tx.workPermit.findUniqueOrThrow({ where: { id: first.id } });
      console.log("   sổ ghi:", { status: row.status, format: row.format, teamType: row.teamType, teamName: row.teamName, disciplines: row.disciplines,
        sourceClassification: row.sourceClassification, workType: row.workType, commanderName: row.commanderName, workerCount: row.workerCount,
        issuerName: row.issuerName, workDate: row.workDate, plannedStartAt: row.plannedStartAt?.toISOString(), registrationNumber: row.registrationNumber });

      const again = await claimNkvhPermit(tx, user, { kind: "MECHANICAL", nkvhPctId: PCT, page: parseNkvhPage(tcnh, "MECHANICAL"), unit: "S1", position: "Lò phó" });
      console.log("2) bấm lại:", again.formatted, "| tạo mới:", again.created, again.number === first.number ? "✓ cùng số" : "✗ KHÁC SỐ");

      const synced = await syncNkvhPermit(tx, user, { kind: "MECHANICAL", nkvhPctId: PCT, page: parseNkvhPage({ ...tcnh, workScope: "Khu vực bồn dầu", commanderName: "0302 - Trương Đức Thiện", workerCount: "3" }, "MECHANICAL") });
      const after = await tx.workPermit.findUniqueOrThrow({ where: { id: synced.id } });
      console.log("3) đồng bộ:", { workScope: after.workScope, commanderName: after.commanderName, workerCount: after.workerCount, version: after.version });

      const paper = await reservePermitNumber(tx, { kind: "MECHANICAL", year, teamType: "CONTRACTOR", ownerId: "thu", ownerName: "Thu" });
      console.log("4) phiếu giấy lấy sau:", paper.number, BigInt(paper.number) > BigInt(first.number) ? "✓ nhảy qua số NKVH" : "✗ TRÙNG/NHỎ HƠN");

      for (const [label, input] of [
        ["thiếu cương vị", { unit: "S1", position: "" }], ["đơn vị ngoài", { unit: "S1", position: "Lò phó", teamCode: "2686f012-546a-48f0-b10b-91e728144357" }],
      ] as const) {
        try {
          await claimNkvhPermit(tx, user, { kind: "MECHANICAL", nkvhPctId: "11111111-2222-3333-4444-555555555555",
            page: parseNkvhPage({ ...tcnh, teamCode: "teamCode" in input ? input.teamCode : "PCN" }, "MECHANICAL"), unit: input.unit, position: input.position });
          console.log(`5) ${label}: ✗ lẽ ra phải bị chặn`);
        } catch (e) { console.log(`5) ${label}: chặn đúng →`, (await (e as Response).json()).error); }
      }

      // Phiếu ra sai: báo hủy về sổ; phiếu tạo lại trên NKVH (id_pct khác) lấy số MỚI, số hủy bị bỏ.
      const errorOf = async (run: () => Promise<unknown>) => {
        try { await run(); return "✗ lẽ ra phải bị chặn"; } catch (e) { return `chặn đúng → ${(await (e as Response).json()).error}`; }
      };
      const cancelled = await cancelNkvhPermit(tx, user, { kind: "MECHANICAL", nkvhPctId: PCT, reason: "hủy phiếu cấp sai NV cho phép" });
      const cancelledRow = await tx.workPermit.findUniqueOrThrow({ where: { id: cancelled.id } });
      console.log("6) báo hủy:", cancelled.formatted, cancelledRow.status, "|", cancelledRow.statusReason);
      const twice = await cancelNkvhPermit(tx, user, { kind: "MECHANICAL", nkvhPctId: PCT, reason: "x" });
      console.log("   bấm lại:", twice.id === cancelled.id ? "✓ trả lại phiếu đã hủy" : "✗");
      const redo = await claimNkvhPermit(tx, user, { kind: "MECHANICAL", nkvhPctId: "99999999-8888-4777-8666-555555555555",
        page: parseNkvhPage(tcnh, "MECHANICAL"), unit: "S1", position: "Lò phó" });
      console.log("7) phiếu tạo lại:", redo.formatted, BigInt(redo.number) > BigInt(paper.number) ? "✓ số mới, bỏ số đã hủy" : "✗ DÙNG LẠI SỐ");
      console.log("8) báo hủy phiếu không có trên sổ:", await errorOf(() => cancelNkvhPermit(tx, user, { kind: "MECHANICAL", nkvhPctId: "55555555-8888-4777-8666-555555555555", reason: "" })));
      throw new Error("HOAN_TAC");
    }, { timeout: 30000 });
  } catch (e) {
    if ((e as Error).message !== "HOAN_TAC") throw e;
    console.log("-- đã hoàn tác, không để lại dữ liệu");
  }
}
main().finally(() => db.$disconnect());
