import assert from "node:assert/strict";

export const materialProposalReceiptPreset = {
  description: "Xác nhận lãnh theo liên 3 khi nhập hồ sơ trễ — phiếu giả lập, không ghi dữ liệu",
  async prepare({ prisma }) {
    const ticket = await prisma.materialTicket.findFirst({
      where: { type: { in: ["DE_XUAT", "UNG"] }, items: { some: {} } },
      include: { items: { include: { material: true, device: { select: { seq: true, name: true, kks: true } } } } },
    });
    if (!ticket) throw new Error("Cần một phiếu vật tư trên DB dev để dựng bản giả lập");
    return { ticket: JSON.parse(JSON.stringify(ticket)) };
  },
  routes: () => ["/replacement-procedures?receiptUi=new", "/replacement-procedures?receiptUi=review"],
  async mock(context, { ticket }) {
    const row = { ...ticket, type: "DE_XUAT", materialCategory: "Dầu bôi trơn", sequenceMonth: "2026-10", sequenceNumber: 40,
      status: "NHAN_VAT_TU", proposalNumber: "2260/VH1", proposalNote: "Bổ sung", proposalReceiverName: "Trần Văn Hưởng",
      receivedAt: null, receivedQuantity: null, receivedMethod: null, deliveryNoteNumber: null, deliveryNoteDate: null,
      usedAt: null, usedQuantity: null, vhvReceivedQuantity: null,
      proposedAt: "2026-10-26T01:00:00Z", confirmedAt: "2026-10-26T02:00:00Z", statsAt: "2026-10-26T03:00:00Z",
      completedAt: null, settledAt: null, docUrl: null, bbktDocUrl: null, recoveryDocUrl: null,
      proposalDocUrl: null, recoveryDocNo: null, bbntDoNumber: null, repairRequestNumber: null,
      recoveryDocSentAt: null, recoveryDocSignedAt: null, activityLogs: [],
      items: [{ ...ticket.items[0], erpCode: "1.31.53.019.SIN.00.000", erpName: "Dầu Sinopec L-TSA46", quantity: 33,
        receivedQuantity: null, replacementPointKeys: [], deviceNameManual: "Bồn dầu ĐCC máy nghiền F; Bồn dầu ĐCC máy nghiền E",
        material: { ...ticket.items[0].material, name: "Dầu Sinopec L-TSA46", unit: "Lít", quantity: 0 } }],
    };
    const steps = Object.fromEntries(["create", "confirm", "receive", "issue", "use", "accept", "return", "stats", "statsHandover", "settle", "manage"].map(key => [key, true]));
    await context.route(/\/api\/material-tickets(?:\?.*)?$/, route => {
      assert.equal(route.request().method(), "GET", "Không được ghi phiếu thật");
      const review = route.request().headers().referer?.includes("receiptUi=review");
      return route.fulfill({ json: { data: [{ ...row, ...(review ? {
        status: "SU_DUNG_VAT_TU", receivedAt: "2026-10-28T01:00:00Z", receivedQuantity: 33,
        deliveryNoteNumber: "03.YY1.40.0453", deliveryNoteDate: "2026-10-27T00:00:00Z",
        items: row.items.map(item => ({ ...item, material: { ...item.material, quantity: 33 } })),
      } : {}) }], meta: { months: [{ month: "2026-10", count: 1 }], viewer: {
        id: ticket.createdById, name: "Người kiểm thử", position: ticket.assignedPosition,
        isAdmin: true, hasScope: true, canCreate: false, steps,
      } }, error: null } });
    });
    await context.route(/\/api\/material-tickets\//, route => {
      assert.equal(route.request().method(), "GET", "Không được ghi phiếu thật");
      const url = new URL(route.request().url());
      let data = {};
      if (url.pathname.endsWith("/photo-review-tasks")) data = [];
      if (url.pathname.endsWith("/usage-photos")) data = { photos: [] };
      if (url.pathname.endsWith("/options")) data = { materials: [], devices: [], positions: [] };
      if (url.pathname.endsWith("/replacement-request")) data = { eligible: false, reason: "Phiếu giả lập chưa liên kết SYC" };
      if (url.pathname.endsWith("/lots")) data = { unit: "Lít", usedQuantity: 0, lots: [
        { id: "ui-lot", label: "03.YY1.40.0453", available: 33, taken: 0, deliveryPhotoUrl: "/brand/4.png" },
      ] };
      return route.fulfill({ json: { data, meta: null, error: null } });
    });
    await context.route("**/api/grounding-lightning/reminder", route => route.fulfill({ json: { data: null, error: null } }));
    await context.route("**/api/overhaul-milestones", route => route.fulfill({ json: { data: { items: [], todayEvents: [] }, error: null } }));
  },
  async interact(page, route) {
    await page.getByRole("button", { name: /Mở chi tiết phiếu STT VT-40/ }).click();
    if (route.includes("receiptUi=review")) {
      await page.getByRole("button", { name: /Xác nhận vật tư lãnh.*Xem lại/ }).click();
      await page.getByText("Lưu chỉnh sửa", { exact: true }).waitFor();
      return;
    }
    const submit = page.getByRole("button", { name: "Xác nhận số phiếu giao hàng", exact: true });
    assert.equal(await submit.isDisabled(), true);
    await page.getByLabel("Số phiếu giao hàng *", { exact: true }).fill("03.YY1.40.0453");
    await page.getByLabel("Ngày phiếu giao hàng *", { exact: true }).fill("2026-10-27");
    assert.equal(await submit.isDisabled(), true, "Chưa có ảnh liên 3 thì chưa cho xác nhận");
    await page.locator('.act input[type="file"]').setInputFiles("public/brand/4.png");
    await page.getByText("Ảnh mới sẽ lưu khi xác nhận", { exact: true }).waitFor();
    assert.equal(await submit.isEnabled(), true, "Đủ chứng từ thì mở nút xác nhận");
    await page.getByLabel("Ngày phiếu giao hàng *", { exact: true }).fill("");
    assert.equal(await submit.isDisabled(), true, "Thiếu ngày thì chặn dù đã có ảnh");
    await page.getByLabel("Ngày phiếu giao hàng *", { exact: true }).fill("2026-10-27");
    await submit.click({ trial: true });
    // Không bấm xác nhận trên dữ liệu thật; chỉ chụp form và kiểm tra điều kiện mở nút.
  },
};
