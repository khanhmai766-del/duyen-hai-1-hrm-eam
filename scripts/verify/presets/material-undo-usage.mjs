import assert from "node:assert/strict";

export const materialUndoUsagePreset = {
  description: "ADMIN hủy nhập nhầm vật tư — phiếu và hộp thoại giả lập, không ghi dữ liệu",
  async prepare({ prisma }) {
    const ticket = await prisma.materialTicket.findFirst({
      where: { type: { in: ["DE_XUAT", "UNG", "SU_DUNG_HIEN_CO"] }, items: { some: {} } },
      include: { items: { include: { material: true, device: { select: { seq: true, name: true, kks: true } } } } },
    });
    if (!ticket) throw new Error("Cần một phiếu vật tư có vật tư trên DB dev để dựng bản giả lập");
    return { ticket: JSON.parse(JSON.stringify(ticket)) };
  },
  routes: () => ["/replacement-procedures", "/replacement-procedures?undo=1"],
  async mock(context, { ticket }) {
    const row = { ...ticket, type: "DE_XUAT", sequenceMonth: "2026-08", sequenceNumber: 10,
      status: "CHO_NGHIEM_THU", usedQuantity: 7, receivedQuantity: 10,
      usedAt: "2026-10-16T02:00:00.000Z", materialUserName: "Nguyễn Văn A (giả lập)",
      completedAt: null, settledAt: null, docUrl: null, bbktDocUrl: null, recoveryDocUrl: null,
      recoveryDocNo: null, bbntDoNumber: null, recoveryDocSentAt: null, recoveryDocSignedAt: null,
      usagePhotoReviewStatus: "PENDING", activityLogs: [],
    };
    const steps = Object.fromEntries(["create", "confirm", "vhvReceive", "receive", "issue", "use", "accept", "return", "recoveryReturn", "stats", "statsHandover", "settle", "manage"].map(key => [key, true]));
    await context.route(/\/api\/material-tickets(?:\?.*)?$/, route => {
      assert.equal(route.request().method(), "GET", "Preset không được ghi phiếu thật");
      return route.fulfill({ json: { data: [row], meta: {
        months: [{ month: "2026-08", count: 1 }],
        viewer: { id: ticket.createdById, name: "Quản trị viên", isAdmin: true, canCreate: false,
          position: ticket.assignedPosition, hasScope: true, steps },
      }, error: null } });
    });
  },
  async interact(page, route) {
    await page.getByRole("button", { name: /Mở chi tiết phiếu STT VT-10/ }).click();
    await page.getByRole("button", { name: "Hủy ghi nhận sử dụng", exact: true }).waitFor();
    if (!route.endsWith("?undo=1")) return;
    await page.getByRole("button", { name: "Hủy ghi nhận sử dụng", exact: true }).click();
    const submit = page.getByRole("button", { name: "Xác nhận hủy và hoàn tồn" });
    assert.equal(await submit.isDisabled(), true, "Phải nhập lý do trước khi xác nhận");
    await page.getByLabel("Lý do hủy").fill("Nhập nhầm VT-10 tháng 8, đúng ra là VT-24 tháng 10.");
    assert.equal(await submit.isEnabled(), true);
    // Thử thao tác con trỏ để bắt trường hợp hộp thoại bị lớp chi tiết phiếu che.
    await submit.click({ trial: true });
  },
};
