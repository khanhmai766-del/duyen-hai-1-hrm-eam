# Bộ prompt triển khai: Mạch vòng kín vật tư

Phương án đầy đủ và căn cứ đối chiếu: https://claude.ai/code/artifact/5c95ea63-ca0b-44db-a42f-ad2c22e25c83

Mỗi giai đoạn là một prompt độc lập, chạy tuần tự. **Không gộp hai giai đoạn vào một phiên** — giai đoạn 3 sửa đường ghi lịch sử đang chạy thật trên prod, cần review riêng.

---

## Sự thật nền — dán kèm mọi prompt bên dưới

```
BỐI CẢNH ĐÃ ĐỐI CHIẾU TRÊN CODE (nhánh main, 24.08.2026) — dùng trực tiếp, không đoán lại:

1. Vòng lặp điểm thay thế hiện đóng qua nhánh SYC, KHÔNG qua phiếu vật tư.
   Chỗ ghi MaterialReplacementLog duy nhất lúc chạy thật: lib/defect-material-request.ts:201
   (hàm recordMaterialRequestReplacements), gọi từ app/api/defects/[id]/complete/route.ts:127
   và :218 khi phiếu khiếm khuyết chuyển "Đã xử lý".
   Nó ghi log rồi GỠ điểm (isActive = false), CỐ Ý không ghi đè lastReplacedAt và không tính
   lại nextDueAt — giá trị cũ là thứ duy nhất cho phép revertMaterialRequestReplacements()
   khôi phục đúng điểm khi SYC bị trả về. Đừng phá tính chất này.

2. Ba mắt xích đang đứt:
   - MaterialTicketItem.replacementPointKeys là mảng CHUỖI deviceSeq (xem
     replacementPointSelectionKey trong lib/material-replacement-display.ts:13), không phải
     khoá ngoại → biết phiếu phục vụ thiết bị nào, không biết phục vụ KỲ nào.
   - MaterialTicket.repairRequestNumber là chuỗi tự do, không phải FK tới Defect.
   - Log lấy DefectMaterialRequest.quantity = quantity × deviceCount (số KẾ HOẠCH lúc ra
     phiếu), không phải usedQuantity thực tế; log cũng không mang BBNT DO, số ĐXVT,
     số phiếu giao hàng.

3. Ba luồng và action tương ứng trong app/api/material-tickets/[id]/route.ts:
   - DE_XUAT ............ "receive"        (bước NHAN_VAT_TU "Xác nhận vật tư lãnh")
   - UNG ................ "vhvReceive"     (bước VHV_LANH_VAT_TU "VHV lãnh vật tư")
                          Lưu ý: action "receive" của luồng Ứng KIÊM LUÔN bước Thống kê
                          xác nhận ĐXVT — xem chú thích tại route.ts:1890.
   - SU_DUNG_HIEN_CO .... "receiveExisting" (bước NHAN_TU_HIEN_CO "Xác nhận vật tư lãnh";
                          luồng này KHÔNG có bước "VHV lãnh vật tư")
   - Quyết toán ......... "settle" (route.ts:2376)

4. Đã có sẵn, PHẢI dùng lại chứ không viết mới:
   - DefectMaterialRequest — cầu nối điểm thay thế ↔ SYC, @@unique([defectId, replacementId]),
     snapshot bất biến quantity/unitLabel/pointLabel.
   - resolveMaterialRequest() (lib/defect-material-request.ts) — server tự dựng lại tổ máy,
     cương vị, thiết bị chính, thiết bị liên quan và suggestedContent từ danh sách điểm.
   - Panel "Ra số yêu cầu thay thế vật tư" trong app/(dashboard)/materials/page.tsx:2530 —
     dùng chung DefectForm với màn Khiếm khuyết, tạo Defect thật, tự đẩy Google Sheet qua
     hộp thư đi (lib/defect-sheet-write-plan.ts).
   - ReplacementRequestChips (materials/page.tsx:2703) — chip số SYC trên dòng điểm thay thế.
   - MaterialStockLot + MaterialLotUsage — sổ lô FIFO theo phiếu giao hàng, đã mang
     deliveryPhotoKey (ảnh liên 3). usedLotsOfTicket() trả về lô + số lượng đã rút.
   - Module tồn kho hóa chất: ChemicalInventoryItem/Period/StockReading/Receipt/Contract,
     getAnnualSummary() (lib/chemical-inventory/queries.ts:436) đã trả ma trận mặt hàng ×
     12 tháng cho cả "nhập" lẫn "sử dụng". Đặc tả: docs/ton-kho-hoa-chat-spec.md.

5. RÀNG BUỘC BẮT BUỘC:
   - Toàn bộ chuỗi hiển thị và thông báo lỗi bằng TIẾNG VIỆT.
   - API theo lib/api.ts: handle() + requireUser() + requireRole()/rbac-guard + ok()/fail()
     + audit() cho mọi thao tác ghi.
   - Client không gọi fetch trực tiếp — qua hooks/ + TanStack Query, toast bằng sonner.
   - Đổi schema: sửa prisma/schema.prisma → TẮT dev server → npx prisma generate (Windows
     khoá query_engine DLL nếu server còn chạy) → viết SQL additive
     (ALTER TABLE ... ADD COLUMN IF NOT EXISTS) vào prisma/manual/, KHÔNG chạy db:push.
   - Không có test suite. Kiểm tra bằng npx tsc --noEmit + npx next lint + npm run build.
   - DB local chỉ có dữ liệu demo (12 ErpMaterial, 24 Material) — dữ liệu vật tư thật nằm
     trên prod. Đừng kết luận "không có dữ liệu" khi truy vấn local ra rỗng.
```

---

## Giai đoạn 1 — Nối liên kết (schema additive)

```
Nhiệm vụ: nối phiếu vật tư với điểm thay thế và với SYC, và bổ sung chỗ chứa số liệu thật
cho lịch sử thay thế. Giai đoạn này CHỈ thêm cấu trúc, KHÔNG đổi hành vi bất kỳ luồng nào.

1. prisma/schema.prisma:

   model MaterialTicketReplacement {
     id              String   @id @default(cuid())
     ticketId        String
     replacementId   String
     plannedQuantity Int?     // = quantity × deviceCount của điểm tại lúc gắn
     createdAt       DateTime @default(now())
     ticket      MaterialTicket      @relation(fields: [ticketId], references: [id], onDelete: Cascade)
     replacement MaterialReplacement @relation(fields: [replacementId], references: [id], onDelete: Cascade)
     @@unique([ticketId, replacementId])
     @@index([replacementId])
   }

   MaterialTicket:      + defectId String?  (FK tới Defect, onDelete: SetNull)
                        Giữ nguyên repairRequestNumber làm snapshot số hiệu.
   MaterialReplacement: + renewalAppliedAt DateTime?   // chống gia hạn hai lần
                        + autoRenew Boolean @default(true)  // công tắc theo điểm
   MaterialReplacementLog: + ticketId String?
                           + usedQuantity Int?          // khối lượng THỰC dùng
                           + bbntDoNumber String?
                           + bbntDoUrl String?
                           + proposalNumber String?
                           + deliveryNoteNumber String?
   (pctNumber, defectId, requestNumber ĐÃ CÓ SẴN trên log — không thêm lại.)

2. SQL additive tại prisma/manual/add-vong-kin-vat-tu.sql, dùng
   ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS. Áp local bằng
   npx prisma db execute --file ... --schema prisma/schema.prisma

3. Backfill (script riêng trong scripts/, chạy tay, in ra thống kê trước khi ghi):
   suy ngược replacementId cho phiếu cũ từ cặp (materialId, deviceSeq) — deviceSeq lấy từ
   MaterialTicketItem.replacementPointKeys. Khớp đúng MỘT điểm thì nối; khớp nhiều hoặc
   không khớp thì BỎ QUA và ghi vào báo cáo. Tuyệt đối không đoán.

4. Ghi song song từ nay: mọi chỗ đang ghi replacementPointKeys phải ghi thêm vào bảng nối.
   Giữ nguyên mảng cũ, KHÔNG xoá — lib/equipment-move.ts:232 còn dựa vào nó khi đổi mã
   thiết bị, và nó là snapshot khi điểm bị xoá.

Nghiệm thu: npx tsc --noEmit sạch, npm run build sạch, tạo phiếu mới sinh đủ dòng bảng nối,
mọi luồng cũ chạy y như trước.
```

---

## Giai đoạn 2 — Cổng vật tư và nút "Ra SYC sửa chữa" một chạm

```
Nhiệm vụ: đảo thứ tự nghiệp vụ — phiếu vật tư ra trước, SYC ra sau, để đội sửa chữa không
sang khi vật tư chưa về.

QUYẾT ĐỊNH ĐÃ CHỐT: nút MỘT CHẠM, KHÔNG tự động tạo SYC. Lý do đã cân nhắc và bác phương
án tự động: số yêu cầu là tài nguyên cấp phát một chiều rồi đẩy lên Google Sheet qua hộp thư
đi, luồng Ứng có nhiều ca VHV tự thay không cần đội sửa chữa, và nội dung SYC cần một người
chịu trách nhiệm.

1. Cổng vật tư — chặn ra SYC khi điểm chưa có vật tư.
   Cài tại app/api/defects/route.ts, ngay cạnh chỗ đang cảnh báo trùng SYC (~dòng 552), dùng
   ĐÚNG cơ chế đó: cảnh báo trả về cho client, client xác nhận thì gửi lại kèm cờ.
   - Điều kiện đạt: điểm có ít nhất một MaterialTicket qua bảng nối, phiếu đó đã qua bước
     xác nhận vật tư lãnh (receivedAt khác null, hoặc luồng Hiện có đã xác nhận), và phiếu
     chưa bị huỷ.
   - Không đạt → trả cảnh báo tiếng Việt nêu rõ điểm nào thiếu vật tư.
   - Cờ vượt cổng: allowWithoutMaterial + LÝ DO BẮT BUỘC (chuỗi không rỗng) + audit().
     KHÔNG chặn cứng — hỏng đột xuất là lúc cần ra SYC gấp nhất.

2. Nút "Ra SYC sửa chữa" trên phiếu vật tư, hiện ở đúng ba bước:
   - action "receive"         (Đề xuất — cùng chỗ nhập khối lượng lãnh, số phiếu giao hàng,
                               ảnh liên 3)
   - action "vhvReceive"      (Ứng)
   - action "receiveExisting" (Hiện có)
   Chỉ hiện khi phiếu có gắn điểm thay thế và điểm chưa có SYC đang mở.

3. Mồi sẵn 100% — người thao tác chỉ đọc lại rồi bấm:
   - Nội dung: ưu tiên MaterialTicket.proposalNote (lý do tạo đề xuất), ghép thêm số phiếu
     ĐXVT để đội sửa chữa tra ngược được. Chỉ khi proposalNote rỗng mới rơi về
     suggestedContent của resolveMaterialRequest().
   - Thiết bị chính, thiết bị liên quan, tổ máy, cương vị: KHÔNG tự dựng — gọi
     resolveMaterialRequest(prisma, replacementIds) rồi để nó ghi đè, đúng như
     app/api/defects/route.ts:537 đang làm.
   - Người dùng vẫn sửa được nội dung trước khi lưu.

4. Sau khi tạo SYC: ghi MaterialTicket.defectId và repairRequestNumber.

5. KHÔNG viết mới phần hiển thị: DefectForm đã tạo Defect thật và tự đẩy Google Sheet;
   ReplacementRequestChips đã hiện chip số SYC ở tab Danh mục. Chỉ gọi lại.

Nghiệm thu: ra SYC từ phiếu vật tư cho ra phiếu giống hệt ra từ Danh mục vật tư (cùng tổ máy,
cương vị, thiết bị chính/liên quan, cùng dòng DefectMaterialRequest); điểm chưa có vật tư thì
bị cảnh báo; vượt cổng không nêu lý do thì bị chặn.
```

---

## Giai đoạn 3 — Đóng vòng: ghi lịch sử và gia hạn chu kỳ

```
Nhiệm vụ: chuyển đường ghi lịch sử thay thế từ SYC sang phiếu vật tư.
CẢNH BÁO: giai đoạn này đụng vào logic đang chạy thật trên prod. Đọc kỹ mục 1 của phần
"Sự thật nền" trước khi sửa, và giữ nguyên cơ chế hoàn tác.

1. Một cửa ghi duy nhất: action "settle" (route.ts:2376) của phiếu vật tư.
   Với mỗi điểm gắn qua bảng nối, ghi một dòng MaterialReplacementLog bằng
   buildReplacementLogData() (lib/material-replacement-log.ts:28), mang:
   - usedQuantity = khối lượng THỰC dùng của phiếu, phân bổ theo tỉ lệ
     quantity × deviceCount của từng điểm, phần dư dồn về điểm đầu.
   - pctNumber, bbntDoNumber, bbntDoUrl (docUrl), proposalNumber,
     deliveryNoteNumber (từ usedLotsOfTicket + deliveryNoteSummary), defectId, requestNumber.
   - replacedAt = NGÀY HOÀN THÀNH CÔNG VIỆC (workEndedAt của phiếu, không có thì lấy ngày
     SYC hoàn thành), KHÔNG phải ngày quyết toán. Quyết toán có thể muộn hơn rất nhiều và
     dùng nó làm mốc sẽ làm trôi toàn bộ chu kỳ.
   - Chống trùng: @@unique([replacementId, ticketId]) trên log. Gọi lại settle nhiều lần
     vẫn chỉ một dòng.

2. recordMaterialRequestReplacements RÚT VỀ ĐƯỜNG DỰ PHÒNG: chỉ ghi khi điểm KHÔNG có phiếu
   vật tư nào gắn qua bảng nối (dữ liệu cũ, trường hợp đặc biệt). Có phiếu thì bỏ qua, để
   bước quyết toán ghi. Giữ nguyên revertMaterialRequestReplacements.

3. Gia hạn chu kỳ, cùng transaction với việc ghi log:
   - Chỉ chạy khi point.autoRenew = true và point.renewalAppliedAt = null.
   - Đặt renewalAppliedAt, gỡ điểm cũ (isActive = false) theo đúng cách hiện tại, rồi TẠO
     ĐIỂM MỚI sao chép toàn bộ cấu hình với lastReplacedAt = replacedAt và
     nextDueAt = replacedAt + intervalMonths.
   - Điểm samplingOnly: vẫn gia hạn. Lý do "Bổ sung": KHÔNG gia hạn.

4. Trạng thái "đang thay thế" cho điểm đã gắn phiếu nhưng chưa quyết toán:
   - Không tính vào cảnh báo quá hạn của lịch thay thế (xem replacementDueStatus và
     app/api/material-replacements/route.ts:118).
   - Hiển thị riêng trên lịch, kèm số phiếu vật tư và số SYC.
   - Điểm chỉ rời lịch khi quyết toán xong.

Nghiệm thu: một lần thay chỉ sinh MỘT dòng lịch sử mang số THỰC DÙNG; gọi settle hai lần
không sinh dòng thứ hai; chu kỳ chỉ gia hạn một lần; trả SYC về vẫn hoàn tác đúng như trước;
điểm đã thay xong nhưng chờ quyết toán không hiện đỏ quá hạn.
```

---

## Giai đoạn 4 — Kế hoạch vật tư năm

```
Nhiệm vụ: dựng chỉ tiêu kế hoạch năm theo biểu QLVT.20 "Biểu tổng hợp nhu cầu vật tư".

CẤU TRÚC BIỂU (đã phân tích file 260725 BẢNG TỔNG HỢP DỰ TOÁN VTTB Thang 8.2026 VH1.xlsx):
mỗi sheet một tháng, cột A–L từ 2024, bản 2026 thêm lưới T1..T12 ở cột M–X.
  A STT (trùng lặp, KHÔNG dùng làm khoá) · B mã ERP · C tên quy cách · D ĐVT
  E kế hoạch năm · F luỹ kế đã sử dụng · G còn lại · H yêu cầu trong tháng
  I tồn kho · J mục đích/vị trí sử dụng · K tồn P.KHVT · L người đề xuất · M–X lưới T1..T12
E, F, G là chỉ tiêu THEO MÃ (lặp lại trên mọi dòng cùng mã); H, J, L là THEO DÒNG.
Ba nhóm: I dầu nhớt bôi trơn · II lọc dầu và lọc nước · III chai khí, hạt nhựa, dầu DO,
hóa chất và vật tư phụ khác.

1. Bảng mới MaterialAnnualPlan:
   year, materialCategory, materialNameKey (tên chữ đã chuẩn hoá bằng normalizeText của
   lib/nav.ts), materialNameLabel (nguyên văn), erpCode?, materialId?, unitLabel,
   plannedQuantity, note.
   Khoá duy nhất: @@unique([year, materialCategory, materialNameKey])
   QUYẾT ĐỊNH ĐÃ CHỐT: khoá theo loại vật tư + tên chữ chuẩn hoá, gắn mã ERP và materialId
   khi tra được — KHÔNG ép theo mã ERP.
   NGOẠI LỆ hóa chất: 6 mặt hàng tịnh kho đã xác minh khớp 6/6 mã ERP giữa hai file, nên
   với chúng phải gắn erpCode và ưu tiên tra theo mã.

2. Nhập kế hoạch đầu năm từ chính file QLVT.20: đọc cột B, C, D, E của một sheet tháng bất kỳ,
   bỏ dòng tiêu đề và dòng nhóm. Trước khi ghi phải chạy đối chiếu và BÁO CÁO:
   - mã ERP không khớp danh mục hệ thống (chưa đo được tỉ lệ này — DB local chỉ có demo),
   - mã xuất hiện nhiều dòng với giá trị kế hoạch KHÁC NHAU (file tháng 8.2026 có 20 mã như
     vậy) — phải buộc người dùng chọn một giá trị, không tự lấy dòng đầu.

3. Nguồn số liệu cho từng cột, chọn theo loại vật tư:
   - Mã có trong ChemicalInventoryItem.materialCode → MẠCH HÓA CHẤT:
       E ← ChemicalContract.contractQuantity / forecastDemand
       F ← getAnnualSummary() (tịnh kho: tồn cuối kỳ trước + nhập − tồn cuối)
       I, K ← ChemicalStockReading kind = MONTH_END
       M–X ← ma trận 12 tháng của getAnnualSummary()
     Chỉ tính tháng đã LOCKED; tháng DRAFT hiện riêng dạng tạm tính.
   - Còn lại → MẠCH VẬT TƯ:
       E ← MaterialAnnualPlan
       F ← Σ MaterialReplacementLog.usedQuantity theo năm
       I, K ← Σ MaterialStockLot.quantityLeft
       M–X ← tháng có phát sinh thay thế
   KHÔNG nhân bản số liệu, KHÔNG đồng bộ hai chiều giữa hai mạch.

4. Ba việc riêng của nhánh hóa chất:
   - NH3 chưa có dòng ChemicalContract (tab hợp đồng chỉ có 5 hóa chất) trong khi biểu dự
     toán đặt kế hoạch 5.922.674 kg — khoản lớn nhất toàn biểu. Cần bổ sung dòng hợp đồng
     cho NH3 hoặc lấy chỉ tiêu từ MaterialAnnualPlan.
   - Nhóm III trộn cả mặt hàng tịnh kho lẫn hạt nhựa Lewatit, Aceton, nước làm mát Turbocool
     — những thứ này KHÔNG phải mặt hàng tịnh kho, phải đi mạch vật tư.
   - Dữ liệu MaterialReplacementLog có importSource = "SHEET_VT" (07.2025→08.2026) chỉ mang
     tính THAM KHẢO, KHÔNG dùng làm căn cứ tính kế hoạch.

Nghiệm thu: nhập được kế hoạch từ file thật; mọi mã hóa chất tra đúng mạch tịnh kho; báo cáo
đối chiếu liệt kê đủ mã lệch và mã mâu thuẫn thay vì im lặng bỏ qua.
```

---

## Giai đoạn 5 — Báo cáo QLVT.20 và dự toán năm sau

```
Nhiệm vụ: thay file Excel gõ tay bằng màn hình tự sinh số.

1. Màn hình theo tháng dựng đúng bố cục QLVT.20. Ranh giới bắt buộc:
   - E, F, G, I, K và lưới T1..T12 là số HỆ THỐNG TỰ SINH, không cho nhập tay.
   - Người dùng chỉ nhập H (yêu cầu trong tháng) và J (mục đích, vị trí sử dụng).
   - G luôn = E − F, không lưu cột riêng. (File hiện tại có 41/238 dòng G ≠ E − F.)

2. Mỗi ô luỹ kế bấm được để xem danh sách phiếu tạo ra con số đó — đây là thứ Excel không
   làm được và là lý do số liệu hiện tại trôi. Ví dụ đã đo: dầu Total Preslia 32 giữ luỹ kế
   832 lít suốt tháng 6, 7, 8 trong khi vẫn yêu cầu thêm 1.248 lít; sáu hóa chất lệch
   39–64% so với sổ tịnh kho.

3. Xuất Excel giữ nguyên biểu mẫu QLVT.20 để nộp P.KHVT: cùng khối tiêu đề, cùng ba nhóm,
   cùng thứ tự cột A–X.

4. Dự toán năm sau:
     Còn lại trong kế hoạch năm = Kế hoạch năm − Thực dùng luỹ kế đến tháng N
     Nhu cầu năm sau = Nhu cầu định kỳ (Σ quantity × deviceCount của các điểm có nextDueAt
                                        rơi vào năm đó)
                     + Bình quân phát sinh (thực dùng KHÔNG gắn điểm, 2–3 năm gần nhất)
                     × Hệ số dự phòng (cấu hình theo nhóm vật tư)
                     − Tồn có thể dùng chuyển năm (Σ MaterialStockLot.quantityLeft còn hạn)
   Phải TÁCH RÕ ba thành phần trên báo cáo — gộp chung là mất khả năng giải trình căn cứ.

LƯU Ý VỀ MỐC THỜI GIAN: dữ liệu Sheet cũ chỉ để tham khảo, nên 2026 sẽ không có luỹ kế đầy đủ
theo chuẩn mới. 2027 là năm đầu tiên tự tính được dự toán hoàn toàn từ số liệu hệ thống; kế
hoạch 2027 vẫn phải lập tay nhưng đối chiếu được với phần thực dùng ghi nhận từ nay.

Nghiệm thu: số luỹ kế trên màn hình khớp với tổng các phiếu truy ngược ra; số hóa chất khớp
getAnnualSummary(); xuất Excel mở được bằng Excel và đúng biểu mẫu.
```
