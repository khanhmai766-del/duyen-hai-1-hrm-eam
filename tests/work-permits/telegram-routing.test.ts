import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { deliverTelegramNotification, telegramChatIds } from "../../lib/telegram";

function groups(t: TestContext, general: string | undefined, overhaul: string | undefined) {
  const saved = { general: process.env.TELEGRAM_CHAT_IDS, overhaul: process.env.TELEGRAM_OVERHAUL_CHAT_IDS, enabled: process.env.TELEGRAM_ALERT_ENABLED };
  const set = (key: string, value: string | undefined) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; };
  set("TELEGRAM_CHAT_IDS", general);
  set("TELEGRAM_OVERHAUL_CHAT_IDS", overhaul);
  process.env.TELEGRAM_ALERT_ENABLED = "true";
  t.after(() => { set("TELEGRAM_CHAT_IDS", saved.general); set("TELEGRAM_OVERHAUL_CHAT_IDS", saved.overhaul); set("TELEGRAM_ALERT_ENABLED", saved.enabled); });
}

test("Chuyển Trưởng ca DH1 sang đại tu, Báo cáo tự động giữ báo cáo chung", t => {
  groups(t, "truong-ca,bao-cao-tu-dong", "truong-ca");
  assert.deepEqual(telegramChatIds(), ["bao-cao-tu-dong"]);
  assert.deepEqual(telegramChatIds("overhaul"), ["truong-ca"]);
});
test("Thiếu danh sách đại tu không gửi đại tu nhầm tới nhóm khiếm khuyết", t => {
  groups(t, "bao-cao-tu-dong", undefined);
  assert.deepEqual(telegramChatIds("overhaul"), []);
  assert.deepEqual(telegramChatIds(), ["bao-cao-tu-dong"]);
});
test("Loại khoảng trắng, nhóm lặp; toàn bộ nhóm dành cho đại tu bị loại khỏi báo cáo chung", t => {
  groups(t, " a, b,a,c, ", " b,b, c ");
  assert.deepEqual(telegramChatIds(), ["a"]);
  assert.deepEqual(telegramChatIds("overhaul"), ["b", "c"]);
});
test("Dry-run báo khiếm khuyết nhận một nhóm; đại tu nhận nhóm riêng, không gửi hoặc ghi DB", async t => {
  groups(t, "truong-ca,bao-cao-tu-dong", "truong-ca");
  const common = await deliverTelegramNotification({ type: "DEFECT_SHIFT_DIGEST", periodKey: "test", message: "Minh họa", dryRun: true });
  const overhaul = await deliverTelegramNotification({ type: "OVERHAUL_WORK_PERMIT", periodKey: "test", message: "Minh họa", dryRun: true, chatIds: telegramChatIds("overhaul") });
  assert.equal(common.skipped, 1);
  assert.equal(overhaul.skipped, 1);
  assert.equal(common.sent + overhaul.sent, 0);
  assert.equal(common.allSucceeded && overhaul.allSucceeded, true);
});
