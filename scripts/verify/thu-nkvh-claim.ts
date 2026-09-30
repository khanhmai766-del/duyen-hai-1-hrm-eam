// Thử (rồi HOÀN TÁC) luồng tiện ích Cấp số PCT NKVH trên DB dev: lấy số, bấm lại không tốn số,
// đồng bộ nội dung, phiếu giấy lấy sau nhảy qua số đã cấp, báo dừng (Tạm dừng, giữ số), báo hủy về sổ (số hủy bị bỏ).
// Không để lại dữ liệu.
//   npx tsx scripts/verify/thu-nkvh-claim.ts
import { PrismaClient } from "@prisma/client";
import { cancelNkvhPermit, claimNkvhPermit, closeNkvhPermit, importExistingNkvhPermit, parseNkvhPage, stopNkvhPermit, syncNkvhPermit } from "@/lib/server/work-permit-nkvh-claim";
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

      const importedNumber = (BigInt(paper.number) + BigInt(1)).toString();
      const imported = await importExistingNkvhPermit(tx, user, { kind: "MECHANICAL",
        nkvhPctId: "22222222-3333-4444-8555-666666666666", page: parseNkvhPage(tcnh, "MECHANICAL"),
        unit: "S1", position: "Lò phó", formattedNumber: `${importedNumber}/${year}/VH1-NĐDH` });
      console.log("4b) nhận số đã cấp trên NKVH:", imported.formatted,
        imported.number === importedNumber ? "✓ đúng số, không lấy số mới" : "✗ SAI SỐ");
      await tx.workPermit.update({ where: { id: imported.id }, data: { nkvhPctId: null } });
      const relinked = await importExistingNkvhPermit(tx, user, { kind: "MECHANICAL",
        nkvhPctId: "23232323-3434-4545-8666-676767676767", page: parseNkvhPage({ ...tcnh, content: "Nội dung đồng bộ lại" }, "MECHANICAL"),
        unit: "S1", position: "Lò phó", formattedNumber: `${importedNumber}/${year}/VH1-NĐDH` });
      console.log("    số đã có trên sổ nhưng thiếu link:", relinked.id === imported.id && !relinked.created
        ? "✓ gắn vào hồ sơ cũ" : "✗ TẠO TRÙNG HỒ SƠ");
      try {
        await importExistingNkvhPermit(tx, user, { kind: "MECHANICAL",
          nkvhPctId: "33333333-4444-4555-8666-777777777777", page: parseNkvhPage(tcnh, "MECHANICAL"),
          unit: "S1", position: "Lò phó", formattedNumber: `${importedNumber}/${year}/VH1-NĐDH` });
        console.log("    trùng số với phiếu NKVH khác: ✗ lẽ ra phải bị chặn");
      } catch (e) { console.log("    trùng số với phiếu NKVH khác: chặn đúng →", (await (e as Response).json()).error); }
      try {
        await importExistingNkvhPermit(tx, user, { kind: "MECHANICAL",
          nkvhPctId: "44444444-5555-4666-8777-888888888888", page: parseNkvhPage(tcnh, "MECHANICAL"),
          unit: "S1", position: "Lò phó", formattedNumber: `${BigInt(importedNumber) + BigInt(2)}/${year}/VH1-NĐDH` });
        console.log("    số nhảy vượt dãy: ✗ lẽ ra phải bị chặn");
      } catch (e) { console.log("    số nhảy vượt dãy: chặn đúng →", (await (e as Response).json()).error); }

      for (const [label, input] of [
        ["thiếu cương vị", { unit: "S1", position: "" }], ["đơn vị ngoài", { unit: "S1", position: "Lò phó", teamCode: "2686f012-546a-48f0-b10b-91e728144357" }],
        ["phiếu PXVH2 (QLVH VH3)", { unit: "S1", position: "Lò phó", qlvhCode: "VH3" }],
      ] as const) {
        try {
          await claimNkvhPermit(tx, user, { kind: "MECHANICAL", nkvhPctId: "11111111-2222-3333-4444-555555555555",
            page: parseNkvhPage({ ...tcnh, teamCode: "teamCode" in input ? input.teamCode : "PCN", qlvhCode: "qlvhCode" in input ? input.qlvhCode : "VH" }, "MECHANICAL"), unit: input.unit, position: input.position });
          console.log(`5) ${label}: ✗ lẽ ra phải bị chặn`);
        } catch (e) { console.log(`5) ${label}: chặn đúng →`, (await (e as Response).json()).error); }
      }

      // Phiếu ra sai: báo hủy về sổ; phiếu tạo lại trên NKVH (id_pct khác) lấy số MỚI, số hủy bị bỏ.
      const errorOf = async (run: () => Promise<unknown>) => {
        try { await run(); return "✗ lẽ ra phải bị chặn"; } catch (e) { return `chặn đúng → ${(await (e as Response).json()).error}`; }
      };
      // Dừng trên NKVH (sự cố thiết bị / tai nạn lao động) → sổ Tạm dừng, số GIỮ; bấm lại không lỗi.
      const stopped = await stopNkvhPermit(tx, user, { kind: "MECHANICAL", nkvhPctId: PCT, reason: "Sự cố rò hơi đường ống" });
      const stoppedRow = await tx.workPermit.findUniqueOrThrow({ where: { id: stopped.id } });
      console.log("5b) báo dừng:", stopped.formatted, stoppedRow.status, "|", stoppedRow.statusReason, stopped.number === first.number ? "✓ giữ số" : "✗ ĐỔI SỐ");
      const stoppedAgain = await stopNkvhPermit(tx, user, { kind: "MECHANICAL", nkvhPctId: PCT, reason: "bấm lại" });
      console.log("    bấm lại:", stoppedAgain.status, stoppedAgain.id === stopped.id ? "✓ cùng phiếu, không lỗi" : "✗");
      const reserved = await tx.workPermitNumberReservation.findUnique({ where: { permitId: stopped.id } });
      console.log("    lượt giữ số:", reserved?.status ?? "(không có)", reserved?.status === "CANCELLED" ? "✗ SỐ BỊ BỎ" : "✓ số không bị bỏ");

      // B5 T-C-N-H / B8 Điện hoàn thành → tự đóng; gọi lại không ghi thêm lịch sử.
      const historyBeforeClose = await tx.workPermitHistory.count({ where: { permitId: stopped.id } });
      const closed = await closeNkvhPermit(tx, user, { kind: "MECHANICAL", nkvhPctId: PCT, sourceStatus: "Khóa phiếu" });
      const closedRow = await tx.workPermit.findUniqueOrThrow({ where: { id: closed.id } });
      const closedAgain = await closeNkvhPermit(tx, user, { kind: "MECHANICAL", formattedNumber: closed.formatted, sourceStatus: "Khóa phiếu" });
      const historyAfterClose = await tx.workPermitHistory.count({ where: { permitId: stopped.id } });
      console.log("5c) tự đóng theo NKVH:", closedRow.status, closedRow.closedAt?.toISOString(),
        closedAgain.id === closed.id && historyAfterClose === historyBeforeClose + 1 ? "✓ lặp lại an toàn" : "✗ ghi trùng");

      // Dùng phiếu khác để kiểm tra Tạm dừng → Hủy; phiếu đã đóng không được hủy.
      const cancelPct = "77777777-8888-4999-8aaa-bbbbbbbbbbbb";
      const cancelClaim = await claimNkvhPermit(tx, user, { kind: "MECHANICAL", nkvhPctId: cancelPct,
        page: parseNkvhPage(tcnh, "MECHANICAL"), unit: "S1", position: "Lò phó" });
      await stopNkvhPermit(tx, user, { kind: "MECHANICAL", nkvhPctId: cancelPct, reason: "Dừng để thử hủy" });
      // Phiếu đang Tạm dừng vẫn hủy được (PAUSED → CANCELLED).
      const cancelled = await cancelNkvhPermit(tx, user, { kind: "MECHANICAL", nkvhPctId: cancelPct, reason: "hủy phiếu cấp sai NV cho phép" });
      const cancelledRow = await tx.workPermit.findUniqueOrThrow({ where: { id: cancelled.id } });
      console.log("6) báo hủy:", cancelled.formatted, cancelledRow.status, "|", cancelledRow.statusReason);
      const twice = await cancelNkvhPermit(tx, user, { kind: "MECHANICAL", nkvhPctId: cancelPct, reason: "x" });
      console.log("   bấm lại:", twice.id === cancelled.id && cancelClaim.id === cancelled.id ? "✓ trả lại phiếu đã hủy" : "✗");
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
