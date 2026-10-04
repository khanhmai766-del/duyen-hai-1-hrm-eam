// Thử (rồi HOÀN TÁC) luồng tiện ích Cấp số PCT NKVH trên DB dev: lấy số, bấm lại không tốn số,
// đồng bộ nội dung, phiếu giấy lấy sau nhảy qua số đã cấp, báo dừng (Tạm dừng, giữ số), báo hủy về sổ (số hủy bị bỏ),
// chống lệch số (Sửa sổ theo NKVH + sổ ghi nhận số gõ tay — mục 9–11).
// Không để lại dữ liệu.
//   npx tsx scripts/verify/thu-nkvh-claim.ts
import { PrismaClient } from "@prisma/client";
import { cancelNkvhPermit, claimNkvhPermit, closeNkvhPermit, importExistingNkvhPermit, observeNkvhNumbers, parseNkvhPage, renumberNkvhPermit, stopNkvhPermit, syncNkvhPermit } from "@/lib/server/work-permit-nkvh-claim";
import { permitNumberHighWater, reservePermitNumber } from "@/lib/server/work-permit-number-reservations";

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

      // ---------- Chống lệch số: dựng lại ca 4463/4464 (10/2026) ----------
      const fmt = (n: bigint) => `${n}/${year}/VH1-NĐDH`;
      const floorNow = async () => {
        const base = (await tx.workPermitNumberBaseline.findFirstOrThrow({ where: { kind: "MECHANICAL", year } })).number;
        const high = await permitNumberHighWater(tx, "MECHANICAL", year);
        return BigInt(base) > BigInt(high) ? BigInt(base) : BigInt(high);
      };
      const page = parseNkvhPage(tcnh, "MECHANICAL");
      const issue = (nkvhPctId: string, actor = user) => claimNkvhPermit(tx, actor, { kind: "MECHANICAL", nkvhPctId, page, unit: "S1", position: "Lò phó" });
      const importAs = (nkvhPctId: string, number: bigint, actor = user) => importExistingNkvhPermit(tx, actor, { kind: "MECHANICAL", nkvhPctId, page, unit: "S1", position: "Lò phó", formattedNumber: fmt(number) });
      const renumber = (nkvhPctId: string, number: bigint, actor = user) => renumberNkvhPermit(tx, actor, { kind: "MECHANICAL", nkvhPctId, formattedNumber: fmt(number) });
      const user2 = { id: "thu-nkvh-2", name: "Người Thử 2", role: "TECHNICIAN" };
      const [pctA, pctB, pctC, pctD, pctE, pctG, pctH] = ["a1", "b2", "c3", "d4", "e5", "f6", "a7"].map(p => `${p}${p}${p}${p}-1111-4222-8333-444444444444`.slice(0, 36).padEnd(36, "0"));

      // Lớp 1. A gõ tay N trên NKVH (sổ không biết) → B lấy số được đúng N (lỗi cũ) → VHV sửa B thành N+1.
      const n = (await floorNow()) + BigInt(1);
      const b = await issue(pctB);
      console.log("9) [lỗi cũ] B lấy số khi A đã gõ tay", fmt(n), "→", b.formatted, b.number === n.toString() ? "(tái hiện đúng: trùng số A)" : "✗");
      const fixed = await renumber(pctB, n + BigInt(1));
      const bRow = await tx.workPermit.findUniqueOrThrow({ where: { id: b.id } });
      const bReservations = await tx.workPermitNumberReservation.findMany({ where: { kind: "MECHANICAL", year, number: { in: [n.toString(), (n + BigInt(1)).toString()] } }, orderBy: { number: "asc" } });
      console.log("   Sửa sổ theo NKVH:", fixed.previous, "→", fixed.formatted,
        bRow.number === (n + BigInt(1)).toString() && bRow.searchText.includes((n + BigInt(1)).toString()) ? "✓ phiếu + searchText đổi số" : "✗",
        "| lượt giữ:", bReservations.map(r => `${r.number}:${r.status}${r.permitId === b.id ? "(B)" : ""}`).join(", "));
      const again2 = await renumber(pctB, n + BigInt(1));
      console.log("   bấm lại:", again2.changed === false ? "✓ không đổi gì" : "✗ ĐỔI LẦN NỮA");
      const a = await importAs(pctA, n);
      console.log("   A đồng bộ số hiện có", fmt(n), "→", a.formatted, a.number === n.toString() ? "✓ nhận lại số cũ của B" : "✗");
      const c = await issue(pctC);
      console.log("   lượt lấy số sau:", c.formatted, c.number === (n + BigInt(2)).toString() ? "✓ không trùng nữa" : "✗ TRÙNG/LỆCH");
      console.log("   sửa C sang số của A:", await errorOf(() => renumber(pctC, n)));
      console.log("   sửa C nhảy cóc:", await errorOf(() => renumber(pctC, n + BigInt(9))));
      await closeNkvhPermit(tx, user, { kind: "MECHANICAL", nkvhPctId: pctC, sourceStatus: "Khóa phiếu" });
      console.log("   sửa số phiếu đã Kết thúc (không phải quản trị):", await errorOf(() => renumber(pctC, n + BigInt(3))));

      // Lớp 2. D, E gõ tay F+1, F+2; một số gõ nhầm F+9; kèm số đã có và số năm khác.
      const f = await floorNow();
      const observed = await observeNkvhNumbers(tx, user, { kind: "MECHANICAL", entries: [
        { formattedNumber: fmt(f + BigInt(2)) }, { formattedNumber: fmt(f + BigInt(1)), nkvhPctId: pctD },
        { formattedNumber: fmt(f + BigInt(9)) }, { formattedNumber: fmt(n) }, { formattedNumber: `${f + BigInt(3)}/${year - 1}/VH1-NĐDH` },
      ] });
      console.log("10) ghi nhận số gõ tay:", observed.recorded.join(", "), "| vượt dãy:", observed.ahead.map(x => `${x.formatted} (kế tiếp ${x.expected})`).join(", "),
        observed.recorded.length === 2 && observed.ahead.length === 1 ? "✓" : "✗");
      const reservedList = await tx.workPermitNumberReservation.count({ where: { kind: "MECHANICAL", year, status: "RESERVED", number: { in: [(f + BigInt(1)).toString(), (f + BigInt(2)).toString()] } } });
      console.log("    không hiện ở \"Số đã lấy, chưa lưu phiếu\":", reservedList === 0 ? "✓" : "✗ HIỆN NHƯ LƯỢT GIỮ SỐ");
      const observedAgain = await observeNkvhNumbers(tx, user, { kind: "MECHANICAL", entries: [{ formattedNumber: fmt(f + BigInt(1)) }, { formattedNumber: fmt(f + BigInt(2)) }] });
      console.log("    gửi lại:", observedAgain.recorded.length === 0 ? "✓ không ghi trùng" : "✗ GHI TRÙNG");
      const g = await issue(pctG);
      console.log("    lấy số sau đó:", g.formatted, g.number === (f + BigInt(3)).toString() ? "✓ nhảy qua số gõ tay" : "✗ CẤP TRÙNG");
      const d = await importAs(pctD, f + BigInt(1), user2);
      const dRows = await tx.workPermitNumberReservation.findMany({ where: { kind: "MECHANICAL", year, number: (f + BigInt(1)).toString() } });
      console.log("    người khác đồng bộ số hiện có của D:", d.formatted, dRows.length === 1 && dRows[0].status === "ISSUED" && dRows[0].permitId === d.id
        ? "✓ dùng chính lượt OBSERVED" : `✗ ${dRows.map(r => r.status).join(",")}`);

      // Hai lớp phối hợp: H lấy số F+4 nhưng trên NKVH lưu F+5 → danh sách báo F+5 → Sửa sổ theo NKVH nhận lượt OBSERVED.
      const h = await issue(pctH);
      const seen = await observeNkvhNumbers(tx, user, { kind: "MECHANICAL", entries: [{ formattedNumber: fmt(f + BigInt(5)), nkvhPctId: pctH }] });
      const hFixed = await renumber(pctH, f + BigInt(5), user2);
      const hRows = await tx.workPermitNumberReservation.findMany({ where: { kind: "MECHANICAL", year, number: (f + BigInt(5)).toString() } });
      console.log("11) H:", h.formatted, "→ NKVH", fmt(f + BigInt(5)), "| ghi nhận:", seen.recorded.join(","), "| sửa sổ:", hFixed.formatted,
        hRows.length === 1 && hRows[0].permitId === h.id ? "✓ dùng lượt OBSERVED" : "✗");
      console.log("    E đồng bộ số hiện có", fmt(f + BigInt(2)), "→", (await importAs(pctE, f + BigInt(2))).formatted);
      const next = await issue("b8b8b8b8-1111-4222-8333-444444444444");
      console.log("    lấy số tiếp:", next.formatted, next.number === (f + BigInt(6)).toString() ? "✓" : "✗");
      throw new Error("HOAN_TAC");
    }, { timeout: 30000 });
  } catch (e) {
    if ((e as Error).message !== "HOAN_TAC") throw e;
    console.log("-- đã hoàn tác, không để lại dữ liệu");
  }
}
main().finally(() => db.$disconnect());
