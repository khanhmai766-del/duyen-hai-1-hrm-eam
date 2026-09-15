import { prisma } from "@/lib/prisma";
import { closeDueInternalPermits } from "./work-permit-auto-close";

const runtime = globalThis as unknown as { permitAutoCloseTimer?: ReturnType<typeof setInterval>; permitAutoCloseRunning?: boolean };
export async function runInternalPermitAutoClose() {
  if (runtime.permitAutoCloseRunning) return;
  runtime.permitAutoCloseRunning = true;
  try {
    const count = await prisma.$transaction(tx => closeDueInternalPermits(tx), { timeout: 30_000 });
    if (count) console.info(`Sổ PCT: tự đóng ${count} phiếu nội bộ theo SYC đã xử lý.`);
  } catch (error) { console.error("Không thể tự đóng PCT nội bộ theo SYC:", error); }
  finally { runtime.permitAutoCloseRunning = false; }
}
export function startInternalPermitAutoClose() {
  if (runtime.permitAutoCloseTimer) return;
  runtime.permitAutoCloseTimer = setInterval(() => { void runInternalPermitAutoClose(); }, 60_000);
  runtime.permitAutoCloseTimer.unref();
  console.info("Sổ PCT: bật kiểm tra tự đóng nội bộ theo SYC mỗi phút.");
  void runInternalPermitAutoClose();
}
