/** Kiểm tra luồng giữ → lưu → đồng bộ trong một giao dịch luôn HOÀN TÁC. Chỉ DB localhost. */
import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { claimNkvhPermit, importExistingNkvhPermit, parseNkvhPage } from "@/lib/server/work-permit-nkvh-claim";
import { reservePermitNumber } from "@/lib/server/work-permit-number-reservations";
loadEnvConfig(process.cwd(), true);
const url = new URL(process.env.DATABASE_URL || "");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Chỉ chạy trên DB dev localhost");
const db = new PrismaClient();
const rollback = new Error("HOÀN TÁC KIỂM TRA");
const user = { id: "verify-pct", name: "Người kiểm tra", role: "SUPERVISOR" };
const kind = "MECHANICAL" as const;
const nkvhPctId = "8bf98ecd-6b07-4a92-9d7a-92d4ed44b667";
const now = new Date();
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric" }).format(now));
const page = parseNkvhPage({ qlvhCode: "VH", teamCode: "PCN", content: "Kiểm tra luồng cấp PCT — hoàn tác", authorizerPosition: "Máy phó" }, kind);
async function main() {
  try {
    await db.$transaction(async tx => {
      const first = await claimNkvhPermit(tx, user, { kind, nkvhPctId, page, unit: "", position: "" });
      assert.equal(first.status, "RESERVED");
      assert.equal(await tx.workPermit.count({ where: { kind, nkvhPctId } }), 0);
      assert.equal((await claimNkvhPermit(tx, user, { kind, nkvhPctId, page, unit: "", position: "" })).id, first.id);
      const input = { kind, nkvhPctId, page, formattedNumber: first.formatted, unit: "", position: "" };
      const issued = await importExistingNkvhPermit(tx, user, input);
      assert.equal(issued.status, "ISSUED");
      const repeated = await importExistingNkvhPermit(tx, user, input);
      assert.equal(repeated.id, issued.id);
      assert.equal(repeated.changed, false);
      const paper = await reservePermitNumber(tx, { kind, year, teamType: "CONTRACTOR", ownerId: user.id, ownerName: user.name });
      assert.notEqual(paper.number, issued.number);
      console.log("✓ Giữ số chưa tạo phiếu; bấm lại cùng lượt; đồng bộ lặp một hồ sơ; giấy không cấp trùng");
      throw rollback;
    }, { timeout: 30_000 });
  } catch (error) { if (error !== rollback) throw error; }
}
main().finally(() => db.$disconnect());
