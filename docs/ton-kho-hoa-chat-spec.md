# Prompt triển khai: Module "Tồn kho hóa chất" (PowerPlant EAM / dh1-app)

> **Bản 2** — đã gộp toàn bộ quyết định của người dùng (2026-08-20).
> Mục 3 là **sự thật đã đo trực tiếp** từ `exports/20260105 Theo dõi hóa chất nhập năm 2026.xlsx`
> và `NH3Tracker.jsx` — không phải suy đoán. Đừng khảo sát lại từ đầu.

---

## 0. VAI TRÒ VÀ MỤC TIÊU

Bạn là Senior Full-stack Engineer làm việc trực tiếp trong repository PowerPlant EAM / dh1-app.

Xây dựng module **"Tồn kho hóa chất"** production-ready: Prisma/PostgreSQL → service → API →
RBAC → audit → hooks TanStack Query → giao diện Next.js. Không dừng ở mockup.

**Nguồn dữ liệu**: `exports/20260105 Theo dõi hóa chất nhập năm 2026.xlsx` (đã có sẵn trong repo).
KHÔNG fetch Google Sheet lúc chạy. KHÔNG viết chức năng đồng bộ theo Sheet ID.
Import chỉ qua **upload file `.xlsx`**.

**Tham khảo giao diện**: `NH3Tracker.jsx` (người dùng cung cấp) — mượn **bố cục và luật kiểm tra**,
**KHÔNG mượn CSS**. Xem mục 12.2.

---

## 1. KHẢO SÁT BẮT BUỘC TRƯỚC KHI CODE

1. Đọc `CLAUDE.md` — tuân thủ toàn bộ convention.
2. Repo có `.codegraph/` → dùng `codegraph_explore` trước khi grep/đọc lan man.
3. Đọc các file mẫu (đã xác nhận tồn tại):
   - `prisma/schema.prisma`, `lib/api.ts`, `lib/fetcher.ts`, `lib/rbac-guard.ts`,
     `lib/rbac-permissions.ts`, `lib/rbac-defaults.ts`
   - `lib/position-catalog.ts`, `lib/nav.ts`, `lib/constants.ts`, `lib/parse-number.ts`
   - `lib/admin-user-import.ts` (mẫu **dry-run/commit** chuẩn của repo — bám sát mẫu này)
   - `lib/hc-period.ts` (mẫu khái niệm "kỳ" theo tháng)
   - `lib/material-workflow.ts`, `components/materials/MaterialTicketBoard.tsx`,
     `app/api/material-tickets/[id]/route.ts` (luồng phiếu hóa chất hiện có — **bắt buộc đọc kỹ**)
   - `hooks/useMaterialTickets.ts`, `hooks/useCurrentPosition.ts`
   - `components/shared/`: `page-header.tsx`, `search-bar.tsx`, `empty-state.tsx`,
     `skeletons.tsx`, `export-button.tsx`, `confirm-dialog.tsx`, `stat-card.tsx`,
     `rbac-protected-route.tsx`
4. Giữ nguyên mọi thay đổi không liên quan trong worktree.

**Thư viện đã có — KHÔNG thêm dependency**: `xlsx`, `exceljs`, `recharts`,
`@tanstack/react-query`, `sonner`, shadcn/ui, `lucide-react`.
Repo **không có** `zod` và `react-hook-form` → validate viết tay trong
`lib/chemical-inventory/validation.ts`.

---

## 2. RÀNG BUỘC KỸ THUẬT

- Next.js 14 App Router, TypeScript strict, Prisma + PostgreSQL, NextAuth v5, Tailwind + shadcn/ui.
- **Toàn bộ UI, nhãn, thông báo lỗi API, cảnh báo import đều bằng tiếng Việt.**
- Client tuyệt đối không gọi `fetch` trực tiếp — chỉ `apiGet` / `apiMutate` (`lib/fetcher.ts`).
- API trả envelope `{ data, meta, error }`.
- Mọi route handler:
  ```ts
  export const dynamic = "force-dynamic";
  export async function GET() {
    return handle(async () => {
      const user = await requireUser();
      await requirePermissionLevel(user, "material-manage", ["read", "personal", "manage", "full"]);
      // ...
      return ok(data, meta);
    });
  }
  ```
  Mutation phải gọi `audit(user.id, ACTION, entity, entityId, detail)`.
- RBAC thật nằm ở **server**, từng route và từng page. `middleware.ts` chỉ là edge guard.
- Tìm kiếm tiếng Việt: `normalizeText()` (`lib/nav.ts`). So khớp cương vị: `positionAliasKey()` /
  `positionsMatch()` (`lib/position-catalog.ts`).
- Không đưa dữ liệu lớn vào JWT/session.

---

## 3. SỰ THẬT ĐÃ XÁC MINH (dùng trực tiếp, không đoán lại)

### 3.0. Phát hiện then chốt — nhật ký ngày NH3 CHÍNH LÀ sổ tháng

Đối chiếu `NH3Tracker.jsx` (tháng 07/2026) với workbook:

| Đối chiếu | Nhật ký ngày | Sheet tháng | Lệch |
|---|---|---|---|
| Tồn 00h ngày 01/07 | 105,646 tấn | `062026!L6` = 105.646 kg | **0** |
| Số chuyến xe trong tháng | 17 | `NH3!E443:E459` = 17 dòng | **0** |
| Tổng khối lượng nhập | 354,18 tấn | 354.180 kg | **0** |
| Tồn 24h ngày 31/07 | 165,158 tấn | `072026!H6` = 165.158 kg | **0** |

⇒ Ô "tồn cuối NH3" và ô "nhập NH3" trong sổ tháng **không phải số nhập tay — chúng là kết quả
cộng dồn của nhật ký ngày**, hiện đang được chép tay sang. Module phải sinh tự động, không cho nhập tay.

### 3.1. Danh sách 31 sheet

| Nhóm | Sheet | Vai trò |
|---|---|---|
| Phiếu nhập | `NH3`, `NaClo 10%`, `HCl 31%`, `NaOH 32%`, `PAC lỏng`, `NH4OH` | Nguồn sự thật cho phiếu nhập |
| Báo cáo tháng | `122024`, `012025`…`122025`, `012026`…`072026` (20 tab) | Nguồn sự thật cho tồn theo cương vị |
| Đối soát | `Tổng 2025`, `Tổng 2026` | Chỉ đối soát, KHÔNG import |
| Hợp đồng | `Hợp đồng hóa chất 2025` | Xem mục 6.5 |
| Rác | `Theo dõi nhập hóa chất`, `Khối lượng XLNHH` | **BỎ QUA + cảnh báo** |

- `Theo dõi nhập hóa chất`: 12 dòng dữ liệu (03–04/2024), định dạng ngang, bản nháp cũ. Bỏ qua.
- `Khối lượng XLNHH`: bản nháp template, 2 hóa chất, không có định danh tháng, có `#REF!`. Bỏ qua.

### 3.2. Tab phiếu nhập — layout thật

Header ở **dòng 2**. Dữ liệu từ **dòng 3**.

| Tab | A | B | C | D | E | F | G | Tổng dòng | **Dòng 2026** |
|---|---|---|---|---|---|---|---|---|---|
| `NH3` | Ngày | Xe | Cân nhà máy | Cân nhà thầu | **KL nhập (tấn)** | **Tháng** | Tồn đầu | 463 | **154** |
| `NaClo 10%` | Ngày | Xe | Cân nhà máy | Cân nhà thầu | KL nhập | **Cương vị** | **Tháng** | 27 | **10** |
| `HCl 31%` | ″ | ″ | ″ | ″ | ″ | Cương vị | Tháng | 54 | **15** |
| `NaOH 32%` | ″ | ″ | ″ | ″ | ″ | Cương vị | Tháng | 41 | **13** |
| `PAC lỏng` | ″ | ″ | ″ | ″ | ″ | Cương vị | Tháng | 21 | **6** |
| `NH4OH` | ″ | ″ | ″ | ″ | ″ | Cương vị | Tháng | 40 | **15** |

**Phạm vi import = 213 phiếu** (chỉ 2026 — xem mục 4, quyết định 2).

> `NH3` **lệch cột 1 ô** so với 5 tab còn lại và **không có cột Cương vị**.
> ⇒ Mapping cột phải dò theo **chữ trong header dòng 2** (chuẩn hóa bằng `normalizeText`),
> KHÔNG hardcode chỉ số cột.

**Ngày**: cột A chỉ chứa **ngày trong tháng** (1–31), lẫn `string` và `number`.
**Tháng**: số nguyên `MMYYYY` — `12026` = 01/2026, `102024` = 10/2024.
Giải mã: `month = Math.floor(v / 10000)`, `year = v % 10000`.
`receivedAt = new Date(year, month - 1, day)`.

**Ô khối lượng có thể là công thức** (`=13270-6866`, `=4484+5396`).
⇒ Đọc workbook **không** dùng `cellFormula`, lấy **giá trị cached** (`cell.v`). Không tự eval.

### 3.3. Đơn vị NH3

- `NH3` dòng 3→60: cột E là **TẤN** (`=IF(C>D,D,C)/1000`, tháng 04–07/2024) — **ngoài phạm vi 2026**.
- `NH3` dòng 61 trở đi: cột E là **KG**. Toàn bộ dữ liệu 2026 nằm ở đây.
- Vẫn giữ quy tắc phòng vệ: nếu `E < plantWeight / 100` thì E đang là tấn → nhân 1000 + cảnh báo.
- `NH3` dòng 460–465 mang tháng `82026` — **có phiếu nhưng chưa có tab báo cáo `082026`**.
  Import phiếu, sinh kỳ 2026-08 DRAFT, cảnh báo `RECEIPT_WITHOUT_PERIOD`.

### 3.4. Cương vị trong tab phiếu nhập — 14 biến thể thật

| Số dòng | Giá trị thô | Xử lý |
|---|---|---|
| 104 | `Máy phó` | → `TURBINE_DEPUTY` |
| 54 | `XLNHH` | → `MIXED_WATER_TREATMENT` |
| 6 | `XLNT` | → `WASTEWATER_TREATMENT` |
| 1 | `xlnhh` | → `MIXED_WATER_TREATMENT` (fold hoa/thường) |
| 1 | `XLN thải` | → `WASTEWATER_TREATMENT` |
| 6 | `Máy phó + XLNT` | **đa cương vị** |
| 3 | `Máy phó, XLNHH` | **đa cương vị** |
| 2 | `XLHH + Máy phó` | **đa cương vị**, `XLHH` là biến thể của `XLNHH` |
| 1 | `Máy phó +XLNHH` | **đa cương vị** |
| 1 | `Máy phó + XLNHH` | **đa cương vị** |
| 1 | `Máy phó (5970kg)+ XLNHH (1800kg)` | **đa cương vị có kèm số lượng trong text** |
| 1 | `Máy phó + XLNKK` | **đa cương vị**, `XLNKK` không xác định |
| 1 | `Máy phó+ máyphó` | rác |
| 1 | *(trống)* | thiếu cương vị |
| 463 | *(NH3 không có cột)* | luôn là `AUX_BOILER_NH3` — xem 3.5 |

**Quy tắc đa cương vị**: KHÔNG tự chia khối lượng. Lưu nguyên văn vào `receivingPositionRaw`,
`receivingPosition = null`, cảnh báo `MULTI_POSITION`. Người dùng tách tay sau.

### 3.5. Tab báo cáo tháng — layout thật (đồng nhất 100% ở cả 20 tab)

- Dòng 4: `A` STT · `B` Tên hóa chất · `C` Qui cách · `D` Đơn vị · `E` "Cương vị" (nhãn gộp) ·
  `L` Tổng tồn cuối · `M` Tổng tồn cuối tháng trước · `N` Nhập trong tháng · `O` Lượng sử dụng · `P` Ghi chú
- Dòng 5 (header cương vị): `E5`..`K5` =
  `Trực phụ điện` · `XLN Hỗn hợp` · `XLN Thải - ND 5000` · `NH3 - LHP` · `Trạm nước thô` ·
  `Nhà dầu 300 -MNK` · `Máy phó`
- **Dòng 6 → 21 là 16 mặt hàng, nhãn `B6:B21` GIỐNG HỆT NHAU ở cả 20 tab.**
  Hơn nữa, **cột cương vị của mỗi mặt hàng cố định tuyệt đối qua cả 20 tab** (đã đối chiếu):

  | Dòng | Tên | Đơn vị | Loại | Cột cương vị |
  |---|---|---|---|---|
  | 6 | Dung dịch NH3 99% | kg | CHEMICAL | **H** (NH3-LHP) — luôn luôn |
  | 7 | Dung dịch NaClO 10% | kg | CHEMICAL | F |
  | 8 | Dung dịch HCl 31% | kg | CHEMICAL | F, G, K |
  | 9 | Dung dịch NaOH 32% | kg | CHEMICAL | F, G, K |
  | 10 | Dung dịch PAC 12% lỏng | kg | CHEMICAL | F |
  | 11 | Dung dịch NH4OH 20% | kg | CHEMICAL | K |
  | 12–14 | Bồn dầu HFO 1…3 | Tấn | HFO | G |
  | 15–16 | Bồn dầu HFO 4…5 | Tấn | HFO | J |
  | 17–18 | Mức bồn dầu Diesel khẩn 1, 2 | lít | DIESEL | E |
  | 19 | Mức bồn dầu Diesel TBNT | lít | DIESEL | I |
  | 20 | Mức bồn dầu DO chữa cháy | lít | DIESEL | H |
  | 21 | **Mức bồn dầu DO lò hơi phụ** | lít | **OTHER** | H (riêng `012026` có thêm I) |

  ⇒ Ánh xạ theo **dòng 6..21 + đối chiếu nhãn cột B**. Nhãn lệch → lỗi import, dừng tab đó.

- **Dòng 22–23 là rác** (`L22 = L21+L20+L19+L18+L17`, `E22 = 8.948`). Không import.
- **`B2 = 32024`** là rác sót lại ở mọi tab. Bỏ qua.

### 3.6. Bẫy dữ liệu đã xác minh

| # | Vấn đề | Bằng chứng | Trong phạm vi 2026? | Xử lý |
|---|---|---|---|---|
| 1 | **`DO lò hơi phụ` ghi bằng chữ** | `072026!H21 = "794 mm (DCS), 760 mm (Local)"` | **CÓ** | Là mức mm, không phải thể tích. Lưu `rawText`, `quantity = null`, cảnh báo `NON_NUMERIC_VALUE`. Không cộng vào bất kỳ tổng nào |
| 2 | **Số điều chỉnh tay** | `062026!L9 = sum(E9:K9)+0.004`; `062026!M9 = '052026'!L9-0.002`; `072026!L9 = sum(E9:K9)+0.004` | **CÓ** | Chỉ import ô `E..K`; tổng do backend tính. Cảnh báo `MANUAL_ADJUSTMENT` |
| 3 | **Tiêu đề tháng copy sai** | `052026/062026/072026` đều ghi `O4 = "Lượng sử dụng Tháng 5(xuất)"` | **CÓ** | Chỉ là nhãn. Kỳ lấy từ **tên tab** |
| 4 | **Cột N trỏ dải dòng cứng** | `072026!N6 = sum('NH3'!E443:E459)` | **CÓ** | Không import cột N. Backend tính lại từ phiếu |
| 5 | **`Tổng 2026` trỏ tab chưa tồn tại** | `='082026'!O6` … `='122026'!O6` | **CÓ** | Không import tab Tổng |
| 6 | **`#REF!`** | `HCl 31%!J6,K6` và `Khối lượng XLNHH!T6,T7,T9,T10` | Cột phụ trợ, không import | Vẫn quét và báo cáo |
| 7 | Tháng sai chính tả `72525` | `NH3`, 21.670 kg | không (2025) | Vẫn giữ validate `INVALID_PERIOD` |
| 8 | Điều chỉnh tay NH4OH 05/2025 | `O11` ghi 5.014,6 · tính lại 5.018,6 | không (2025) | — |
| 9 | Tab `122024` tự mâu thuẫn | tiêu đề ghi "THÁNG 11", `O21` sai dấu | không (2024) | — |
| 10 | **Chuỗi liên kết tháng bị đứt** | `052026!M21 = '032026'!L21` (đáng lẽ `042026`); `122025!M21 = '102025'!L21` (đáng lẽ `112025`) | **CÓ** | Không import cột M. Tồn đầu luôn tính từ tồn cuối kỳ trước ⇒ lỗi này không lây sang DB. *(Đính chính: bản 1 của tài liệu này khẳng định chuỗi đúng hoàn toàn — sai, vì lúc đó chỉ kiểm dòng 6 và 9. Dòng 21 thì hỏng.)* |
| 11 | **Ô ngày gõ nhầm thành chữ** | `NH4OH!A31 = "NHnh"`, mang 4.940 kg của tháng 03/2026 | **CÓ** | Tháng vẫn đọc được ⇒ tạm đặt ngày 01, gắn `INVALID_RECEIPT_DAY`. Bỏ cả dòng là lệch tổng tháng đúng 4.940 kg |
| 12 | **Nhiên liệu có lượng nhập ghi thẳng ở cột N** | `DO lò hơi phụ`, tháng 01 và 02/2026, mỗi lần 2.000 lít. Chín dòng nhiên liệu còn lại đều trống | **CÓ** | Mặt hàng không có tab phiếu thì đọc cột N và dựng thành một phiếu nhập đề ngày cuối tháng. Bỏ qua là lượng sử dụng âm khống đúng 2.000 lít |
| 13 | **Giá trị nhảy cột giữa các tháng** | `DO lò hơi phụ` nằm ở cột H mọi tháng, riêng `012026` nhảy sang cột I vì H bị chiếm bởi dòng chữ đo mm | **CÓ** | Importer quét cả 7 cột nên vẫn bắt được |

### 3.7. Tab `Hợp đồng hóa chất 2025` — hai lỗi đã xác minh

Header dòng 1, dữ liệu dòng 2–6 (**5 hóa chất, KHÔNG có NH3**):
`A` Danh mục · `B` **Mã vật tư ERP** · `C` NSX/Xuất xứ · `D` Đơn vị · `E` Khối lượng hợp đồng ·
`F` Phạm vi · `G..R` Tháng 01..12 · `S` Đã nhận · `T` Còn lại · `U` Nhu cầu · `V` Thiếu hụt

| Mã vật tư ERP | Hàng hóa | KL hợp đồng (kg) | NSX |
|---|---|---|---|
| `1.61.06.038.VIE.00.000` | Hydrochloric acid (HCL) 31% | 458.723 | NM Hóa Chất Biên Hòa |
| `1.61.26.003.VIE.00.000` | Sodium Hypochloride (NaClO 10%) | 90.533 | NM Hóa Chất Biên Hòa |
| `1.61.16.008.VIE.00.000` | Natri Hidroxit (NaOH 32%) | 326.244 | NM Hóa Chất Biên Hòa |
| `1.61.86.518.VIE.00.000` | Ammonium hydroxite 20% (NH4OH) | 162.902 | Kim Phong |
| `1.61.86.566.VIE.02.000` | Poly aluminium chloride 12% (PAC) lỏng | 412.088 | NM Hóa Chất Biên Hòa |

**Lỗi 1 — "Đã nhận" trộn lẫn lượng sử dụng.** `G..N` (tháng 1–8) là số nhập ghi tay, nhưng
`O..R` (tháng 9–12) trỏ `='Tổng 2025'!L5` … tức **khối SỬ DỤNG (dòng 3–8)**, không phải khối
NHẬP (dòng 11–16). `S = sum(G:R)` sai từ tháng 9.
⇒ **Không import `G..S`.** `received` do backend tính từ `ChemicalReceipt`.

**Lỗi 2 — "Lượng thiếu hụt" đảo dấu.** `V = T - U` là **thặng dư**, không phải thiếu hụt.
Đúng: `shortfall = MAX(0, forecastDemand − remaining)`, `surplus = MAX(0, remaining − forecastDemand)`.

### 3.8. ĐỐI SOÁT — mốc nghiệm thu của pha 2

Tính lại `consumed = tồn cuối kỳ trước + Σ phiếu nhập trong kỳ − tồn cuối kỳ`:

| Hóa chất | Sử dụng 01–07/2026 (tính lại) | Sheet | Lệch |
|---|---|---|---|
| NH3 | 3.172.847 | 3.172.847 | **0** |
| NaClO 10% | 76.780,85 | 76.780,85 | **0** |
| HCl 31% | 91.942,02 | 91.942,025 | −0,005 |
| NaOH 32% | 132.299,132 | 132.299,13 | +0,002 |
| PAC 12% lỏng | 62.182 | 62.182 | **0** |
| NH4OH 20% | 36.263,43 | 36.263,43 | **0** |

⇒ Sau import, script đối soát **phải tái lập đúng bảng này**. Hai khoản lệch ±0,005 là
**số điều chỉnh tay của sheet gốc** — hiện ra dưới dạng cảnh báo, **không ép khớp, không hardcode**.

---

## 4. QUYẾT ĐỊNH NGHIỆP VỤ ĐÃ CHỐT

1. **Tồn hóa chất để chung toàn phân xưởng.** Không có chiều S1/S2/COMMON.
   Không gọi `positionAllowedForUnit()`. `TURBINE_DEPUTY` và `ELECTRICAL_ASSISTANT_OPERATOR`
   khai `units: UNIT_1_2` trong catalog — ở đây bỏ qua ràng buộc đó, chỉ dùng `code` làm khóa.

2. **Chỉ import dữ liệu 2026.** Không đưa 2024–2025 lên web.
   ⚠️ **Vẫn BẮT BUỘC import tab `122025` làm kỳ mồi** (`isSeed = true`) — tồn đầu tháng 01/2026
   chính là tồn cuối 12/2025. Kỳ mồi không hiển thị trên giao diện, không tính tiêu hao.
   Phạm vi: `122025` (mồi) + `012026`…`072026` + `082026` (DRAFT, có phiếu chưa có tab).

3. **KHÔNG áp quy tắc khóa kỳ** ("n−1 phải khóa trước"). Người dùng muốn chạy thực tế xem sao.
   Vẫn **giữ cột `status DRAFT|LOCKED`** trong schema để bật sau mà không phải migrate.

4. **Phân quyền chi tiết để sau.** Tạm dùng `material-manage` mức mặc định. Xem mục 9.

5. **Bồn nhiên liệu giữ nguyên logic sheet**: `consumed = opening + received − closing`, với
   `received = 0` vì không có nguồn nhập. Kết quả **âm là bình thường, giữ nguyên**, kèm cảnh báo
   "chưa ghi nhận lượng bơm vào bồn". Tuyệt đối không kẹp về 0.

6. **NH3 nhập qua phiếu vật tư, theo đợt nhiều xe.**
   - Một phiếu đề xuất NH3 = **nhiều xe**, đề xuất định kỳ cách 2–3 ngày.
   - **Lượng đề xuất chỉ là số tham khảo.** Lượng nhập thực tế thường khác.
   - ⛔ **KHÔNG tạo bất kỳ logic hay cảnh báo nào so sánh lượng đề xuất với lượng nhập.**
     Mọi tính toán tồn/tiêu hao/hợp đồng chỉ dùng **lượng nhập thực tế** (`acceptedWeight`).

7. **Một chỗ lưu, hai chỗ nhìn — KHÔNG làm đồng bộ hai chiều.** Xem mục 7.

---

## 5. THIẾT KẾ DATABASE

### 5.1. Nguyên tắc

Không ép dùng `Material.quantity` / `MaterialStockLot`: các model đó dùng `Int`, phục vụ FIFO
theo phiếu vật tư kho DH1. Hóa chất là số thập phân, do nhà thầu giao thẳng.

**Decimal là hoàn toàn mới với repo này** (0 lần xuất hiện trong 2.140 dòng `schema.prisma`).
Dùng `Decimal @db.Decimal(18, 4)`, và **bắt buộc**:
- Tạo `lib/chemical-inventory/serialize.ts` với `toNumber(d: Prisma.Decimal | null)`.
- **Mọi Decimal phải qua hàm này trước khi vào `ok()`.** API contract là `number`.
  Trả thẳng object `Decimal` ra ngoài → Next 14 ném *"Only plain objects can be passed to Client Components"*.

### 5.2. Model

```prisma
model ChemicalInventoryItem {
  id                 String   @id @default(cuid())
  code               String   @unique   // NH3_99, NACLO_10, HCL_31, NAOH_32, PAC_12, NH4OH_20, HFO_1..5, DIESEL_KHAN_1...
  name               String             // đúng nhãn cột B của sheet
  concentration      String?
  itemType           String             // CHEMICAL | HFO | DIESEL | OTHER
  baseUnit           String             // KG | TON | LITER — đơn vị LƯU TRỮ
  displayUnit        String?            // đơn vị hiển thị nếu khác (NH3: lưu KG, hiện TON ở nhật ký)
  trackingMode       String   @default("MONTHLY") // MONTHLY | DAILY — NH3 là DAILY
  sheetRow           Int?               // 6..21
  receiptSheet       String?            // tên tab phiếu nhập, null với nhiên liệu
  materialCode       String?            // mã ERP
  tankCapacity       Decimal? @db.Decimal(18, 4) // sức chứa bồn, vẽ thanh mức
  lowStockThreshold  Decimal? @db.Decimal(18, 4) // ngưỡng cảnh báo tồn thấp
  sortOrder          Int      @default(0)
  isActive           Boolean  @default(true)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([itemType, sortOrder])
}

model ChemicalInventoryPeriod {
  id            String    @id @default(cuid())
  periodKey     String    @unique            // "YYYY-MM"
  status        String    @default("DRAFT")  // DRAFT | LOCKED — CHƯA áp ràng buộc chuỗi (quyết định 3)
  isSeed        Boolean   @default(false)    // true cho 2025-12
  generationMwh Decimal?  @db.Decimal(18, 3) // sản lượng điện S1+S2, tính suất hao đầu cực
  lockedAt      DateTime?
  lockedById    String?
  note          String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  readings ChemicalStockReading[]
  @@index([status])
}

/// Bản đọc tồn — THAY cho ChemicalInventoryBalance.
/// Một khái niệm duy nhất phục vụ cả lưới tháng lẫn nhật ký ngày NH3.
model ChemicalStockReading {
  id           String   @id @default(cuid())
  periodId     String
  periodKey    String                     // denormalize để truy vấn lưới tháng bằng 1 câu
  itemId       String
  positionCode String                     // PositionCode; "UNASSIGNED" nếu sheet không ghi
  readDate     DateTime @db.Date          // ngày đọc (24h00 của ngày đó)
  kind         String                     // DAILY | MONTH_END
  quantity     Decimal? @db.Decimal(18, 4) // null = CHƯA ĐỌC (khác 0!)
  rawText      String?                    // nguyên văn khi ô là chữ (vd mức mm DO LHP)
  note         String?
  source       String   @default("MANUAL") // MANUAL | SHEET_IMPORT | DERIVED
  updatedById  String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  period ChemicalInventoryPeriod @relation(fields: [periodId], references: [id], onDelete: Cascade)
  item   ChemicalInventoryItem   @relation(fields: [itemId], references: [id])

  @@unique([itemId, positionCode, readDate, kind])
  @@index([periodKey, kind, itemId])
  @@index([itemId, readDate])
}

model ChemicalReceipt {
  id                   String   @id @default(cuid())
  itemId               String
  receivedAt           DateTime @db.Date            // ngày nhập
  periodKey            String                       // suy từ receivedAt theo giờ VN — SERVER tính, client KHÔNG gửi
  vehicleNumber        String?                      // biển số xe
  plantWeight          Decimal? @db.Decimal(18, 4)
  contractorWeight     Decimal? @db.Decimal(18, 4)
  acceptedWeight       Decimal  @db.Decimal(18, 4)  // luôn quy về baseUnit của item
  receivingPosition    String?
  receivingPositionRaw String?
  note                 String?
  source               String   @default("MANUAL")  // MANUAL | SHEET_IMPORT | MATERIAL_TICKET | DAILY_LOG
  sourceSheet          String?
  sourceRow            Int?
  sourceKey            String?  @unique             // "<fileHash>|<sheet>|<row>" — idempotent khi import
  materialTicketId     String?                      // phiếu vật tư đã gắn (nếu có)
  warnings             String[] @default([])
  createdById          String?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  item ChemicalInventoryItem @relation(fields: [itemId], references: [id])

  /// KHÓA CHỐNG TRÙNG HAI CỬA — xem mục 7.2. Bắt buộc.
  @@unique([itemId, receivedAt, vehicleNumber])
  @@index([periodKey, itemId])
  @@index([itemId, receivedAt])
  @@index([materialTicketId])
}

model ChemicalContract {
  id               String   @id @default(cuid())
  year             Int
  itemId           String
  materialCode     String?
  supplier         String?
  origin           String?
  contractQuantity Decimal  @db.Decimal(18, 4)
  forecastDemand   Decimal  @db.Decimal(18, 4) @default(0)
  note             String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  item ChemicalInventoryItem @relation(fields: [itemId], references: [id])
  @@unique([year, itemId])
  @@index([year])
}

model ChemicalImportBatch {
  id           String   @id @default(cuid())
  fileName     String
  fileHash     String
  status       String                       // PREVIEW | COMMITTED | FAILED
  importedRows Int      @default(0)
  updatedRows  Int      @default(0)
  skippedRows  Int      @default(0)
  errorRows    Int      @default(0)
  detail       Json
  createdById  String
  createdAt    DateTime @default(now())

  @@index([createdAt])
}
```

**`quantity` phải nullable.** `null` = chưa đọc; `0` = đã đọc và bằng 0. Sheet phân biệt hai thứ
này. Gộp lại là hỏng số liệu.

**Không lưu** `openingTotal`, `receivedTotal`, `consumedTotal` — tính trong `queries.ts`.

### 5.3. Quy tắc `ChemicalStockReading`

| Mặt hàng | `trackingMode` | Dữ liệu |
|---|---|---|
| NH3 | `DAILY` | 1 dòng `DAILY`/ngày tại `AUX_BOILER_NH3` (28–31 dòng/tháng) |
| 5 hóa chất còn lại + 10 dòng nhiên liệu | `MONTHLY` | 1 dòng `MONTH_END`/tháng/cương vị |

**Dòng `MONTH_END` của NH3 do server sinh, không cho nhập tay:**
- Bằng đúng dòng `DAILY` của **ngày cuối cùng theo lịch** của tháng đó, `source = "DERIVED"`.
- Ngày cuối tháng chưa có bản đọc → `MONTH_END` = `null`, lưới tháng hiện `—` kèm ghi chú
  *"nhật ký mới tới ngày N"*. **Không lấy bản đọc giữa tháng làm tồn cuối tháng.**
- Recompute trong cùng transaction mỗi khi bản đọc `DAILY` của ngày cuối tháng thay đổi.

**Lưới tháng luôn truy vấn `kind = "MONTH_END"`** — một câu Prisma đơn giản, không N+1,
không cần `DISTINCT ON` / SQL thô.

### 5.4. Kỳ nhập liệu tách theo tháng

Sheet gốc gộp nhiều năm phiếu vào một tab dài — module này **không lặp lại**:

- `ChemicalInventoryPeriod` là đơn vị làm việc; mở kỳ trước khi nhập
  (`POST .../periods/[periodKey]/open`).
- `ChemicalReceipt.periodKey` **do server suy từ `receivedAt`** theo giờ Việt Nam. Client gửi
  `periodKey` thì **bỏ qua**.
- Giao diện luôn làm việc trong ngữ cảnh **một tháng đang chọn**.
- Tạo/sửa phiếu: ngày mặc định trong tháng đang chọn. Đổi sang tháng khác → cảnh báo
  *"Phiếu sẽ chuyển sang kỳ 09/2026"* trước khi lưu.
- Kỳ `LOCKED`: chặn thêm/sửa/xóa phiếu và bản đọc thuộc kỳ đó.
  **Không** áp ràng buộc "n−1 phải khóa trước" (quyết định 3).
- Tồn đầu kỳ `n` = tổng `MONTH_END` kỳ `n−1`. Không cho nhập tay.

---

## 6. IMPORT

Bám sát mẫu `lib/admin-user-import.ts` (dry-run/commit + audit + `status`).

### 6.1. Hai bước

**A. Preview (`POST /api/chemical-inventory/import/preview`)**
`multipart/form-data`, chỉ `.xlsx`, tối đa 10 MB. Đọc, chuẩn hóa, đối soát. **Không ghi DB.** Trả:
```
{
  fileHash,
  bySheet: [{ sheet, rowsRead, rowsValid, rowsSkipped, rowsError }],
  issues:  [{ severity: "error"|"warning", sheet, row, column, message }],
  reconcile: [{ itemCode, periodKey, field, computed, sheetValue, delta }],
  summary: { willCreate, willUpdate, willSkip }
}
```

**B. Commit (`POST /api/chemical-inventory/import/commit`)**
Một transaction. Idempotent qua `ChemicalReceipt.sourceKey` (unique) và
`ChemicalStockReading @@unique([itemId, positionCode, readDate, kind])` (upsert).
Import lại đúng file → 0 bản ghi mới. Ghi `ChemicalImportBatch` +
`audit(..., "IMPORT_CHEMICAL_INVENTORY", ...)`.
Chặn commit khi còn `severity: "error"`; `warning` thì cho qua.

### 6.2. Phạm vi (quyết định 2)

- **Tab tháng**: `122025` (mồi) → `012026` → … → `072026`. Bỏ toàn bộ tab 2024 và 012025–112025.
- **Tab phiếu nhập**: chỉ dòng có `Tháng % 10000 === 2026` (213 dòng).
- Sinh kỳ DRAFT cho `2026-08` (có phiếu, chưa có tab).

### 6.3. Thứ tự xử lý

1. Seed/upsert 16 `ChemicalInventoryItem` (idempotent theo `code`).
2. Tab tháng theo thứ tự thời gian → `ChemicalInventoryPeriod` + `ChemicalStockReading`
   (`kind = "MONTH_END"`) từ ô `E..K` dòng 6..21. Bỏ `L/M/N/O/P/Q` và dòng 22–23.
   `122025` đặt `isSeed = true`.
3. Sáu tab phiếu nhập → `ChemicalReceipt` (`source = "SHEET_IMPORT"`).
4. `Hợp đồng hóa chất 2025` → xem 6.5.
5. Bỏ qua `Tổng 2025`, `Tổng 2026`, `Theo dõi nhập hóa chất`, `Khối lượng XLNHH` — mỗi tab một
   dòng `warning` giải thích vì sao bỏ.

> **Lưu ý NH3**: import sheet chỉ sinh `MONTH_END` cho NH3, không sinh `DAILY` (sheet không có
> dữ liệu ngày). Nhật ký ngày bắt đầu được ghi từ khi module chạy thật. `MONTH_END` của các
> tháng đã import giữ `source = "SHEET_IMPORT"` và **không bị recompute** — chỉ các tháng có
> bản đọc `DAILY` mới chuyển sang `source = "DERIVED"`.

### 6.4. Chuẩn hóa

`normalizeChemicalName()` — khớp nhãn cột B với `ChemicalInventoryItem.name`, fold dấu + hoa
thường + khoảng trắng thừa (chú ý `"Dung dịch PAC 12% lỏng "` có dấu cách cuối).

`normalizeInventoryPeriod(v)` — nhận `MMYYYY` (số/chuỗi) và tên tab `MMYYYY`, trả `"YYYY-MM"`.
Ném lỗi nếu `year < 2020 || year > 2100` hoặc `month` ngoài 1..12.

`normalizeInventoryPosition(raw)`:
1. Trống → `null`.
2. Chứa `+` / `,` / `&` → `{ code: null, raw, multi: true }` + cảnh báo `MULTI_POSITION`.
3. Ngược lại `positionAliasKey()` → `positionCodeOf()`.
4. Các cách viết riêng của workbook nằm ở bảng `SHEET_POSITION_ALIASES` **trong
   `lib/chemical-inventory/normalize.ts`**, KHÔNG thêm vào `lib/position-catalog.ts`:
   đó là thói quen ghi chép của một file Excel cụ thể, không phải danh mục cương vị của
   nhà máy — sửa catalog dùng chung là mở rộng ảnh hưởng sang PCCC và phiếu vật tư mà
   không được lợi gì. Đã phủ: `xlnhh`, `xlhh`, `xln hon hop`, `xlnt`, `xln thai`,
   `xln thai nd 5000`, `nha dau 300 mnk`, `nh3 lhp`, `tram nuoc tho`.
   (`"XLNKK"` KHÔNG thêm — để rơi vào cảnh báo `UNKNOWN_POSITION`)

   ⚠️ Dò dấu phân cách đa cương vị phải chạy trên `normalizeText(text)` (chỉ bỏ dấu tiếng Việt),
   KHÔNG chạy trên khóa đã lọc ký tự đặc biệt — lọc rồi thì `+` và `,` biến mất và không
   dòng nào bị nhận là đa cương vị nữa.

### 6.5. Hợp đồng — file KHÔNG có dữ liệu 2026

Workbook chỉ có `Hợp đồng hóa chất 2025`, và tab đó **không có dòng NH3**.

Xử lý:
- Import tab này thành `ChemicalContract` **`year = 2025`**, chỉ lấy `A` (tên), `B` (materialCode),
  `C` (origin), `E` (contractQuantity), `F` (supplier), `U` (forecastDemand).
  **Không import `G..S`** (mục 3.7, lỗi 1).
- Đồng thời dùng cột `B` để **điền `materialCode` cho `ChemicalInventoryItem`** — giá trị này
  dùng được cho mọi năm.
- Tab Hợp đồng của giao diện khi chọn 2026 sẽ **trống**, hiện empty state:
  *"Chưa có hợp đồng năm 2026 — bấm Thêm để nhập"*. Hợp đồng 2026 (kể cả NH3) **nhập tay**.

### 6.6. Đối soát tự động sau import

Chạy và trả về, **không ép khớp**:
- `acceptedWeight` vs `MIN(plantWeight, contractorWeight)`
- Σ `quantity` theo cương vị vs cột `L`
- Tồn đầu vs `MONTH_END` kỳ trước
- Σ phiếu nhập trong kỳ vs cột `N`
- `consumed` tính lại vs cột `O` → **phải khớp bảng ở mục 3.8**
- Tổng 01–07/2026 vs `Tổng 2026`

---

## 7. LIÊN KẾT VỚI PHIẾU VẬT TƯ — "MỘT CHỖ LƯU, HAI CHỖ NHÌN"

### 7.1. Nguyên tắc

⛔ **KHÔNG làm đồng bộ hai chiều.** Hai bảng cùng giữ một số rồi đẩy qua đẩy lại là nguồn sai
lệch kinh điển (repo đã có `lib/defect-two-way-sync.ts` đủ để biết nó đắt cỡ nào).

Thay vào đó:
- Ba trường *ngày nhập · biển số xe · khối lượng nhập* **chỉ tồn tại trong `ChemicalReceipt`**.
- `MaterialTicket` giữ `chemicalReceiptIds`, **không giữ bản sao số liệu**.
- Tab theo dõi vật tư và màn tồn kho hóa chất **đọc/ghi cùng một dòng**.

Sửa ở đâu cũng thấy ngay ở chỗ kia, vì chỉ có một bản. Không job đồng bộ, không trạng thái lệch.

### 7.1b. Biển số xe — chuẩn hóa, tối đa 8 ký tự

Cột "Xe" trong sổ Excel **là biển số**, chỉ được ghi tắt (thường vài chữ số cuối:
`478`, `269`, `504`). Nhật ký ngày ghi đủ: `51C-214.77`.

- `vehicleNumber` = biển số đã chuẩn hóa: bỏ gạch/chấm/khoảng trắng, viết hoa,
  **tối đa 8 ký tự** (`"51C-214.77"` → `"51C21477"`). Người dùng gõ kiểu nào cũng được.
  Quá 8 ký tự sau khi bỏ dấu phân cách → báo lỗi, không cắt ngầm.
- `vehicleRef` = nguyên văn ô "Xe" trong sổ, giữ để đối chiếu bản gốc.
- Khi hai nguồn cùng ghi một chuyến: **giữ bản đầy đủ hơn**. Nếu bên này là phần đuôi
  của bên kia thì coi như cùng một biển; khác hẳn nhau thì gắn `VEHICLE_CONFLICT`,
  **không tự chọn hộ**.
- Cảnh báo của phiếu phải **suy từ trạng thái cuối cùng**, không cộng dồn — sau khi
  gộp hai nguồn mà phiếu đã đủ hai số cân thì `MISSING_WEIGHT` phải biến mất.

### 7.1c. Bước lãnh chỉ có MỘT số cân

Sổ Excel cũ có hai cột *cân nhà máy* và *cân nhà thầu*, tồn cuối lấy `MIN(hai số)`.
Nhưng ở **bước xác nhận lãnh**, VHV chỉ cầm **một tờ phiếu cân xe của nhà máy**, và con
số cần lấy là dòng **"Trọng lượng hàng"** — phần hàng đã trừ bì xe
(ví dụ: xe & hàng 35.170 kg − xe 14.090 kg = **hàng 21.080 kg**).

Vì vậy bảng chuyến xe ở phiếu vật tư **chỉ có một cột khối lượng**:

- Ghi vào `plantWeight`, và `acceptedWeight` bằng đúng nó — không lấy MIN vì không có
  số thứ hai để so.
- **KHÔNG đòi ghi chú lý do** và **KHÔNG gắn cờ `MISSING_WEIGHT`** cho phiếu có
  `source = "MATERIAL_TICKET"`. Cảnh báo đó nghĩa là "không đối chứng được hai số cân";
  ở đây vốn dĩ chỉ có một tờ phiếu cân, gắn cờ chỉ tạo ra cảnh báo luôn bật mà không ai
  xử lý được.
- Màn **nhật ký ngày** và tab **Phiếu nhập** vẫn giữ đủ hai ô: dữ liệu lịch sử nhập từ
  sổ có cả hai số, và quy tắc `MIN` là thứ tái lập đúng tổng năm của sổ.

Khi sau đó import sổ mang về đủ hai số cho cùng chuyến xe, cơ chế gắn ở 7.2 sẽ bổ sung
`contractorWeight` vào chính dòng đó.

### 7.1d. Luồng NH3: đề xuất → ghi chuyến xe → hoàn tất

Trước 2026-08-21 phiếu NH3 (`type = "GHI_NHAN"`) **hoàn tất ngay lúc lập** — không có
chỗ nào ghi lại hàng thực đã về. Nay:

```
Lập phiếu (đề xuất)  →  status NHAN_VAT_TU  →  VHV ghi chuyến xe  →  HOAN_TAT
                        "Chờ VHV ghi chuyến xe"    (khối lượng + biển số + ngày)
```

- Chỉ **chính VHV được giao phiếu** (hoặc ADMIN) ghi được — không rào theo bước
  "Nhận vật tư" vì bước đó có phạm vi toàn phân xưởng.
- Hành động `chemicalTrucks` là **ngoại lệ duy nhất** được thao tác trên phiếu đã
  `HOAN_TAT`: xe về rải rác vài ngày sau, và phiếu cũ lập trước thay đổi này đã ở trạng
  thái hoàn tất sẵn — chặn thì không bao giờ bổ sung được chuyến xe.
- `receivedQuantity` (Int) trên phiếu chỉ để hiển thị nhanh; số chính xác tới 4 số lẻ
  nằm ở `ChemicalReceipt`. `receivedAt` = ngày muộn nhất trong các chuyến.

### 7.1e. Cương vị nhận — mặc định theo hóa chất, luôn lưu dạng MÃ

`ChemicalInventoryItem.defaultPosition` giữ cương vị NHẬN hàng mặc định, suy từ dữ
liệu thật (155 phiếu NH3 + 213 phiếu nhập import):

| Mặt hàng | Cương vị nhận | Cương vị GIỮ TỒN trên lưới tháng |
|---|---|---|
| NH3 99% | NH3 - Lò hơi phụ | NH3 - Lò hơi phụ |
| NaClO 10% · PAC 12% | XLN hỗn hợp | XLN hỗn hợp |
| HCl 31% · NaOH 32% | **Máy phó** | XLN hỗn hợp · XLN thải · Máy phó |
| NH4OH 20% | Máy phó | Máy phó |

Hai cột khác nhau là có thật: HCl giữ tồn ở ba nơi nhưng **luôn do Máy phó nhận** rồi
mới phân về. Đừng dùng cương vị giữ tồn làm mặc định cho ô "Cương vị nhận".

Hai quy tắc bắt buộc:

- **Luôn lưu MÃ cương vị**, không lưu nhãn tự do. `MaterialTicket.assignedPosition` là
  nhãn ("Trưởng kíp Lò - Máy") nên phải qua `positionCodeOf()` trước khi ghi vào
  `ChemicalReceipt.receivingPosition` — ghi thẳng nhãn thì ô chọn trên giao diện không
  khớp và hiện "Chưa xác định".
- Sổ chỉ theo dõi **bảy** cương vị (cột E..K). Phiếu giao cho cương vị ngoài bảy cái đó
  thì **lùi về `item.defaultPosition`** — hàng vẫn về đúng trạm của hóa chất.

### 7.2. Chống trùng hai cửa — BẮT BUỘC

NH3 chiếm **154/213 = 72%** lượng phiếu 2026 và có **hai cửa vào**: phiếu vật tư (VHV đề xuất
nhập liệu) và nhật ký ngày (VHV trực NH3-LHP ghi xe). Cùng một chuyến xe. Không chặn thì cộng đôi.

Đã kiểm dữ liệu thật: **trong cùng một ngày, các biển số luôn khác nhau** (ngày 06/07 có 3 xe,
3 biển khác nhau). Nên `(itemId, receivedAt, vehicleNumber)` là khóa tự nhiên tin cậy **trong cùng
một nguồn**.

⚠️ **Giữa hai nguồn thì KHÔNG dò theo biển số** — sổ ghi tắt (`478`) còn nhật ký ghi đủ
(`51C21477`), hai chuỗi khác hẳn nhau cho cùng một chuyến. Khóa nối hai nguồn là
**(mặt hàng + ngày + khối lượng công nhận)**; đã thử trên tháng 07/2026: khớp 17/17 chuyến,
đúng từng ki-lô-gam.

Quy tắc:
1. `@@unique([itemId, receivedAt, vehicleNumber])` trên `ChemicalReceipt`.
2. Cửa nào vào trước thì **tạo** dòng.
3. Cửa sau nhập trùng `(ngày + biển số)` thì **tìm thấy và gắn vào dòng đó**, KHÔNG tạo mới —
   kèm thông báo *"Chuyến xe này đã được ghi ở nhật ký ngày 06/07, phiếu sẽ gắn vào chuyến đó"*.
4. Nếu **khối lượng hai bên khác nhau** → hiện xung đột cho người dùng chọn giữ số nào.
   **Tuyệt đối không tự ghi đè.** Ghi `audit` khi người dùng chọn.
5. Xe không có biển số → không áp unique được, tạo dòng mới + cảnh báo `MISSING_VEHICLE`.

### 7.3. Thay đổi ở luồng phiếu vật tư

1. Thêm cột vào `MaterialTicket` (SQL `ADD COLUMN IF NOT EXISTS`):
   ```prisma
   chemicalReceiptIds String[] @default([])  // các chuyến xe đã gắn
   ```
2. Bước xác nhận lãnh (`action: "receive"`) của **luồng hóa chất** mở ra **BẢNG NHIỀU DÒNG XE**,
   không phải ba ô đơn:

   | Ngày nhập | Biển số xe | Cân nhà máy | Cân nhà thầu | KL được công nhận |
   |---|---|---|---|---|

   - Nút "+ Thêm xe", xóa từng dòng, tổng ở chân bảng.
   - `KL được công nhận` = `MIN(hai số cân)`, tính ngay khi gõ, chỉ đọc.
   - Chỉ một số cân → cảnh báo vàng + bắt buộc ghi chú.
   - Áp dụng cho **cả NH3 lẫn 5 hóa chất còn lại** (NaOH đã có phiếu ghi "Máy phó + XLNHH" —
     nhiều điểm nhận trong một lần giao).
3. Lưu bước này → tạo/gắn `ChemicalReceipt` cho từng dòng xe, `source = "MATERIAL_TICKET"`,
   `receivingPosition = ticket.assignedPosition` (NH3 luôn là `AUX_BOILER_NH3`).
4. **Giữ nguyên quyết định của commit `83aa5b5`**: luồng hóa chất **không cộng tồn kho phân xưởng,
   không trừ ERP**. Bước này chỉ ghi nhận khối lượng.
5. `ChemicalReceipt` đã gắn ticket: **sửa được từ cả hai màn**, nhưng **xóa thì phải hủy phiếu gốc**
   — nếu không sẽ có ticket trỏ vào khoảng trống.

### 7.4. ⛔ Không so lượng đề xuất với lượng nhập

Một phiếu đề xuất NH3 = nhiều xe, đề xuất định kỳ 2–3 ngày một lần. **Lượng đề xuất chỉ là số
tham khảo**, lượng nhập thực tế thường khác.

**Không tạo bất kỳ validate, cảnh báo, badge hay cột "chênh lệch đề xuất/nhập" nào.**
Hiển thị lượng đề xuất như thông tin thuần túy. Mọi tính toán tồn / tiêu hao / hợp đồng chỉ dùng
`acceptedWeight`.

---

## 8. SERVICE VÀ API

### 8.1. Tách logic khỏi route

```
lib/chemical-inventory/
  constants.ts     // mã mặt hàng, thứ tự cương vị, nhãn tiếng Việt
  calculations.ts  // pure functions, không import Prisma
  normalize.ts     // normalizeChemicalName / normalizeInventoryPeriod / normalizeInventoryPosition
  validation.ts    // validate payload, chặn NaN/Infinity/âm
  queries.ts       // truy vấn tổng hợp, tránh N+1
  readings.ts      // ghi bản đọc + recompute MONTH_END của NH3
  receipts.ts      // tạo/gắn receipt, xử lý chống trùng hai cửa (7.2)
  importer.ts      // đọc xlsx, dry-run, commit
  serialize.ts     // Decimal → number
  permissions.ts   // helper quyền
```

`calculations.ts` — pure, không phụ thuộc Prisma:
```
calculateAcceptedWeight(plant, contractor)          // MIN của hai số có mặt; một số → chính nó + warning
calculateClosingTotal(readings)                     // bỏ qua null, KHÔNG coi null là 0
calculateOpeningBalance(prevPeriodClosingTotal)
calculateReceivedTotal(receipts)
calculateConsumedTotal(opening, received, closing)  // CÓ THỂ ÂM — trả nguyên giá trị
calculateDailyUsed(open, imported, close)           // nhật ký NH3
calculateSpecificConsumption(usedKg, generationMwh) // suất hao đầu cực kg/MWh
calculateDaysOfStock(closing, dailyUsedMedian)
calculateContractReceived(receipts)
calculateContractRemaining(contractQuantity, received)
calculateContractShortfall(forecastDemand, remaining) // MAX(0, demand - remaining)
calculateContractSurplus(forecastDemand, remaining)   // MAX(0, remaining - demand)
convertUnit(value, fromUnit, toUnit)
```

### 8.2. Danh sách API

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/api/chemical-inventory?month=YYYY-MM&q=&itemType=&position=` | lưới tháng |
| GET | `/api/chemical-inventory/daily?month=YYYY-MM&itemId=` | nhật ký ngày (NH3) |
| PUT | `/api/chemical-inventory/daily/[date]` | ghi tồn 24h một ngày |
| GET | `/api/chemical-inventory/annual?year=` | ma trận 12 tháng |
| GET | `/api/chemical-inventory/receipts?month=&itemId=&position=&q=&page=&pageSize=` | phân trang |
| POST | `/api/chemical-inventory/receipts` | có xử lý chống trùng 7.2 |
| PUT | `/api/chemical-inventory/receipts/[id]` | |
| DELETE | `/api/chemical-inventory/receipts/[id]` | chặn nếu có `materialTicketId` |
| PUT | `/api/chemical-inventory/periods/[periodKey]/readings` | cập nhật lưới tháng, transaction |
| PUT | `/api/chemical-inventory/periods/[periodKey]/generation` | sản lượng điện S1+S2 |
| POST | `/api/chemical-inventory/periods/[periodKey]/open` | |
| POST | `/api/chemical-inventory/periods/[periodKey]/lock` \| `/unlock` | không ràng buộc chuỗi |
| GET/POST | `/api/chemical-inventory/contracts?year=` | |
| PUT/DELETE | `/api/chemical-inventory/contracts/[id]` | |
| POST | `/api/chemical-inventory/import/preview` \| `/commit` | |
| GET | `/api/chemical-inventory/import/history` | |
| GET | `/api/chemical-inventory/export?month=&year=` | |

Yêu cầu chung:
- Validate ở server. Chặn `NaN`, `Infinity`, chuỗi rỗng, số âm khi không hợp lệ.
- **Không tin derived field từ client** (`acceptedWeight`, `periodKey`, `openingTotal`,
  `receivedTotal`, `consumedTotal`, `remaining`, `MONTH_END` của NH3). Tính lại hết.
- Transaction cho mọi mutation chạm nhiều bảng.
- Phân trang `receipts` (mặc định 50, tối đa 200), trả `meta.total`.
- Không N+1: `GET /api/chemical-inventory` làm được bằng ~4 truy vấn
  (items · readings kỳ này · readings kỳ trước · `groupBy` receipts theo `periodKey+itemId`).
- Serialize Decimal → `number` qua `serialize.ts`.
- `audit` cho create/update/delete/import/open/lock/unlock và **cho lựa chọn xử lý xung đột 7.2**.
- Lỗi tiếng Việt cụ thể: *"Kỳ 07/2026 đã khóa sổ"*, không phải *"Forbidden"*.

---

## 9. RBAC — TẠM THỜI, SẼ THIẾT KẾ LẠI

> ⚠️ Người dùng đã hoãn phần này và yêu cầu **nhắc lại trước khi module chạy với dữ liệu thật**.
> Không tự thiết kế phân quyền chi tiết theo cương vị ở pha này.

Tạm dùng permission **`material-manage`** đã có sẵn (không phá cấu hình role hiện tại).
4 mức thật trong repo: `read` · `personal` · `manage` · `full` (`lib/rbac-permissions.ts`).

| Mức | Tạm thời cho phép |
|---|---|
| `read` | Xem toàn bộ, xuất báo cáo |
| `personal` | Ghi nhật ký ngày, tạo/sửa phiếu nhập, sửa bản đọc |
| `manage` | Thêm: xóa phiếu, mở/khóa kỳ, hợp đồng, preview import |
| `full` | Thêm: commit import, mở khóa kỳ |
| ADMIN | Toàn quyền |

Xác định cương vị: `session.user.currentPosition` trước, fallback `session.user.position`.
So khớp bằng `positionsMatch()`, không so chuỗi thô.

Frontend ẩn/disable thao tác không được phép — **backend vẫn kiểm tra lại**.

```tsx
<RbacProtectedRoute permissionId="material-manage" featureLabel="Tồn kho hóa chất">
```

**Khi bàn giao pha 3, nhắc người dùng chốt: ai nhập · ai duyệt · ai chỉ xem · có bật khóa kỳ chưa.**

---

## 10. HOOKS

`hooks/useChemicalInventory.ts` — type đầy đủ, **không dùng `any`**.

```
useChemicalInventory(filters)      → ["chemical-inventory", filters]
useChemicalDailyLog(month, itemId) → ["chemical-daily", month, itemId]
useChemicalAnnualSummary(year)     → ["chemical-inventory-annual", year]
useChemicalReceipts(filters)       → ["chemical-receipts", filters]
useChemicalContracts(year)         → ["chemical-contracts", year]
useChemicalImportHistory()         → ["chemical-import-history"]

useSaveChemicalDailyReading()
useCreateChemicalReceipt / useUpdateChemicalReceipt / useDeleteChemicalReceipt
useUpdateChemicalReadings / useUpdatePeriodGeneration
useOpenChemicalPeriod / useLockChemicalPeriod / useUnlockChemicalPeriod
useUpsertChemicalContract / useDeleteChemicalContract
useChemicalImportPreview / useCommitChemicalImport
```

Invalidate: mọi mutation phiếu/bản đọc/kỳ phải invalidate `["chemical-inventory"]`,
`["chemical-daily"]`, `["chemical-inventory-annual"]`, `["chemical-receipts"]`;
mutation hợp đồng thêm `["chemical-contracts"]`; commit import invalidate tất cả +
`["chemical-import-history"]`. Tạo receipt từ phiếu vật tư → invalidate thêm `["material-tickets"]`.

Chỉ dùng `apiGet` / `apiMutate`. Toast tiếng Việt qua `sonner`.

---

## 11. MIGRATION & DEPLOY

1. Sửa `prisma/schema.prisma`.
2. **Dừng dev/preview server trước `npx prisma generate`** trên Windows (nếu không sẽ `EPERM`).
3. `npx prisma generate`.
4. **KHÔNG chạy `db:push --accept-data-loss`** — DB dev có bảng ngoài schema, sẽ bị drop.
5. Viết SQL thủ công tại **`prisma/manual/add-chemical-inventory.sql`**, toàn bộ dùng
   `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
   ```bash
   npx prisma db execute --file prisma/manual/add-chemical-inventory.sql --schema prisma/schema.prisma
   ```
   File này **bắt buộc phải có** — trên production `prisma migrate deploy` không dùng được (P3005).
6. Seed 16 mặt hàng bằng **`scripts/seed-chemical-inventory.ts`** (`npm run seed:chemical`),
   idempotent (`upsert` theo `code`).
   ⚠️ **KHÔNG gắn vào `prisma/seed.ts`** — file đó mở đầu bằng một loạt `deleteMany()` xoá sạch
   `User` / `Material` / `Shift`; gắn vào là mỗi lần ai chạy `npm run db:seed` sẽ mất dữ liệu thật.
   Đặt sẵn `trackingMode`, `baseUnit`, `displayUnit`, `tankCapacity`, `lowStockThreshold`:
   - `NH3_99`: `trackingMode = "DAILY"`, `baseUnit = "KG"`, `displayUnit = "TON"`,
     `tankCapacity = 220000` (220 tấn), `lowStockThreshold = 80000` (80 tấn)
   - còn lại: `trackingMode = "MONTHLY"`
7. Không ghi đè `Material` hiện có. Không sửa module không liên quan.

---

## 12. FRONTEND

Route: `app/(dashboard)/chemical-inventory/page.tsx`
Nav: thêm vào mục **"QUẢN LÝ VẬT TƯ"** trong `lib/nav.ts` (sau "Vật tư theo ERP"):
```ts
{
  label: "Tồn kho hóa chất",
  href: "/chemical-inventory",
  icon: FlaskConical,
  permissionIds: ["material-manage"],
  keywords: "ton kho hoa chat nh3 naoh hcl naclo pac nh4oh amoniac xut clo bon dau hfo diesel do chua chay nhap hoa chat hop dong nhat ky suat hao",
}
```

### 12.1. Hai màn nhập liệu, một ngôn ngữ thiết kế

Tần suất nhập khác nhau thì công cụ phải khác nhau — ép cả hai vào một lưới 16×7 là sai.

| Mặt hàng | Màn hình | Vì sao |
|---|---|---|
| **NH3** | **Nhật ký ngày** | Nhập hằng ngày, có phương trình cân bằng tự kiểm |
| 5 hóa chất + 10 dòng nhiên liệu | **Lưới tháng** | Nhập 1 lần/tháng, ma trận là đúng công cụ |

### 12.2. ⚠️ Cách dùng `NH3Tracker.jsx`

File tham khảo **tự dựng design system riêng**: `@import` Google Fonts (IBM Plex), bảng biến CSS
riêng, style nhúng trong component. Trong app **phải dựng lại bằng Tailwind + shadcn/ui và token
màu sẵn có**.

**Mượn**: bố cục, luồng thao tác, luật kiểm tra, cách trình bày phương trình cân bằng.
**Không mượn**: font, biến CSS, `<style>` nhúng, bảng màu.

Lý do: `CLAUDE.md` yêu cầu hòa vào ứng dụng hiện có; và người dùng đã từng bác một bản redesign
vật tư vì **thêm quá nhiều thứ cùng lúc, rối mắt** — ưu tiên thứ bậc rõ và khoảng trắng.

### 12.3. Màn nhật ký ngày NH3

Giữ nguyên bố cục của `NH3Tracker.jsx`:

- **Dải 31 ngày bên trái**: số ngày · thanh mức tiêu thụ · lượng đã dùng · chấm báo "chưa lưu".
- **Phương trình cân bằng làm trung tâm**:
  `Tồn 00h  +  Nhập trong ngày  −  Tồn 24h  =  NH3 đã dùng`
  - `Tồn 00h`: **tự lấy từ tồn 24h ngày trước**, khóa sẵn, có nút "Sửa thủ công" +
    nút "Khôi phục theo chuỗi".
  - `Nhập trong ngày`: **chỉ đọc**, tự cộng từ `ChemicalReceipt` có `receivedAt` = ngày đó.
  - `Tồn 24h`: ô nhập chính, `autoFocus`.
  - Ô kết quả **đổi sang nền đỏ khi âm**.
- **Thanh mức bồn**: `tankCapacity` 220 tấn, vạch đỏ ở `lowStockThreshold` 80 tấn,
  kèm dự báo *"Đủ dùng khoảng N ngày ở mức tiêu thụ hiện tại"*.
- **Bảng xe nhập trong ngày**: STT · biển số · khối lượng · nút xóa · tổng ở chân bảng.
  Thêm xe từ đây tạo `ChemicalReceipt` `source = "DAILY_LOG"` (đi qua chống trùng 7.2).
  Xe đến từ phiếu vật tư hiện badge *"Từ phiếu #…"* kèm link.
- **Khối kiểm tra dữ liệu** (giữ đúng các luật của file mẫu):
  - lỗi: lượng dùng âm · đứt chuỗi tồn (`|tồn 00h − tồn 24h hôm trước| > 0,001`) · tồn vượt sức chứa
  - lưu ý: dùng > 1,5× trung vị tháng · dùng < 0,5× trung vị · tồn dưới ngưỡng ·
    xe ngoài dải 15–25 tấn
  - hợp lệ: "Cân bằng khối lượng hợp lệ."
- **Nút lưu bị khóa khi còn lỗi**, kèm dòng đối soát tháng ở cạnh.
- **Đơn vị**: lưu kg, **hiển thị tấn** ở màn này (`displayUnit`). Một điểm quy đổi duy nhất
  trong `convertUnit`.

### 12.4. Màn tồn kho tháng

**A. Page header** — tiêu đề, chọn tháng (dropdown kỳ đã có + "Mở kỳ mới"), badge trạng thái kỳ,
nút "Nhập từ Excel", "Xuất báo cáo", "Khóa sổ tháng".

**B. KPI** — **tách theo đơn vị, không cộng chung kg + tấn + lít**:
- Nhóm hóa chất (kg): tổng tồn cuối · tổng nhập · tổng sử dụng
- Nhóm HFO (tấn): tổng tồn cuối
- Nhóm Diesel/DO (lít): tổng tồn cuối
- **Suất hao đầu cực NH3 (kg/MWh)** — ô nhập sản lượng điện S1+S2 ngay trên KPI
- Số mặt hàng có cảnh báo · Trạng thái kỳ

**C. Tabs**: Tổng quan · Nhật ký NH3 · Tồn theo cương vị · Phiếu nhập · Tổng hợp năm · Hợp đồng ·
Lịch sử đồng bộ.

**D. Tồn theo cương vị** — ma trận 16 dòng × 7 cột.
- Chỉ ô `quantity` (`kind = MONTH_END`) sửa được; `L/M/N/O` là cột dẫn xuất, chỉ đọc, nền khác biệt.
- **Dòng NH3 chỉ đọc**, ghi chú *"tự động từ nhật ký ngày 31"* + link sang nhật ký.
  Nếu ngày cuối tháng chưa có bản đọc → hiện `—` + *"nhật ký mới tới ngày N"*.
- Ô chưa nhập hiện `—`, **khác hẳn `0`**.
- Sticky header + sticky cột "Tên hóa chất". Vùng cuộn ngang riêng, body trang không cuộn ngang.
- Ô có trạng thái lưu riêng (đang lưu / đã lưu / lỗi), lỗi validate hiện ngay tại ô.
- Kỳ đã khóa: toàn bộ read-only + nút "Mở khóa" nếu đủ quyền.
- Dòng `DO lò hơi phụ` khi có `rawText` thì hiện nguyên văn + icon cảnh báo.

**E. Phiếu nhập**
- Mặc định lọc theo tháng đang chọn; có công tắc "Xem tất cả các tháng".
- Tìm kiếm không dấu (`normalizeText`), lọc hóa chất/cương vị, phân trang.
- Dialog tạo/sửa dùng **bảng nhiều dòng xe** như 7.3.
- Trùng `(ngày + biển số)` → hiện hộp gắn vào chuyến đã có, không tạo mới.
- Phiếu từ `MATERIAL_TICKET`: badge + link, xóa phải hủy phiếu gốc.
- Phiếu có `receivingPositionRaw`: badge "Cần tách cương vị".
- Xóa: `ConfirmDialog`.

**F. Tổng hợp năm**
- Bảng 12 tháng × mặt hàng, chuyển giữa "Nhập" / "Sử dụng".
- Biểu đồ `recharts`, **mỗi đơn vị một biểu đồ riêng** — không gộp kg với tấn với lít.
- Tháng chưa có dữ liệu hiện "Chưa có dữ liệu", **không mặc định 0**.

**G. Hợp đồng** — khối lượng HĐ · đã nhận (tính từ phiếu) · còn lại · nhu cầu · thiếu hụt/thặng dư ·
thanh tiến độ. Năm 2026 trống → empty state hướng dẫn nhập tay (xem 6.5).
Màu chỉ dùng khi mang nghĩa, luôn kèm nhãn chữ.

**H. Dialog import** — chọn file → preview (bảng lỗi/cảnh báo theo sheet + dòng + cột, lọc được
theo mức độ) → commit khi hết `error`. Hiện số dòng thêm/cập nhật/bỏ qua.
**Không đóng được dialog khi request đang chạy.**

**UX bắt buộc**: responsive desktop/tablet/mobile · skeleton loading · empty state ·
error state có nút thử lại · toast tiếng Việt · truy cập được bằng bàn phím ·
số định dạng `vi-VN` (`toLocaleString("vi-VN", { maximumFractionDigits: 3 })`) ·
không làm tròn mất dữ liệu gốc · dùng shadcn/ui và `components/shared/`.

---

## 13. CẢNH BÁO CẦN SINH RA

| Mã | Điều kiện |
|---|---|
| `MISSING_WEIGHT` | Thiếu một trong hai số cân |
| `ACCEPTED_MISMATCH` | `acceptedWeight` ≠ `MIN(hai số cân)` |
| `MISSING_VEHICLE` | Phiếu không có biển số (không áp được khóa chống trùng) |
| `DUPLICATE_VEHICLE_DAY` | Trùng `(mặt hàng + ngày + biển số)` — đề nghị gắn vào chuyến đã có |
| `WEIGHT_CONFLICT` | Hai cửa nhập khối lượng khác nhau cho cùng chuyến xe |
| `CHAIN_BREAK` | Tồn 00h ≠ tồn 24h ngày trước (nhật ký) |
| `OPENING_MISMATCH` | Tồn đầu tháng ≠ `MONTH_END` kỳ trước |
| `NEGATIVE_CLOSING` | Tồn cuối âm |
| `NEGATIVE_CONSUMED` | Lượng sử dụng âm — **giữ nguyên giá trị, không kẹp về 0** |
| `OVER_CAPACITY` | Tồn vượt `tankCapacity` |
| `LOW_STOCK` | Tồn dưới `lowStockThreshold` |
| `USAGE_OUTLIER` | Lượng dùng ngày > 1,5× hoặc < 0,5× trung vị tháng |
| `TRUCK_WEIGHT_OUTLIER` | Khối lượng xe ngoài dải 15–25 tấn |
| `RECEIPT_WITHOUT_PERIOD` | Có phiếu nhập nhưng chưa có kỳ (vd 2026-08) |
| `MONTH_END_INCOMPLETE` | NH3 chưa có bản đọc ngày cuối tháng |
| `PERIOD_GAP` | Thiếu tháng trong chuỗi |
| `UNIT_MISMATCH` | Đơn vị không khớp `baseUnit` |
| `INVALID_PERIOD` | Tháng không hợp lệ (vd `72525`) |
| `NON_NUMERIC_VALUE` | Ô đáng lẽ là số nhưng là chữ (mức mm DO LHP) |
| `MULTI_POSITION` | Phiếu ghi nhiều cương vị, cần tách tay |
| `UNKNOWN_POSITION` | Cương vị không map được (vd `XLNKK`) |
| `MANUAL_ADJUSTMENT` | Công thức nguồn có số cộng thêm thủ công |
| `SOURCE_FORMULA_ERROR` | `#REF!` hoặc công thức lưu dạng text |

⛔ **KHÔNG có cảnh báo so sánh lượng đề xuất với lượng nhập** (quyết định 6).

---

## 14. CHIA PHA (bắt buộc — không làm một lượt)

Sau mỗi pha: `npx tsc --noEmit` sạch và báo cáo ngắn trước khi sang pha sau.

| Pha | Nội dung | Tiêu chí xong |
|---|---|---|
| **1** ✅ | Schema + `prisma/manual/add-chemical-inventory.sql` + seed 16 mặt hàng + hàm tính thuần | **XONG 2026-08-20**: 6 model · 16 mặt hàng · 39/39 phép kiểm (`npm run check:chemical`) |
| **2** ✅ | `importer.ts` + `import-commit.ts` + `scripts/import-chemical-inventory.ts` | **XONG 2026-08-20**: 0 lỗi · 215 phiếu (213 từ tab phiếu + 2 dựng từ cột N) · 161 bản đọc · 9 kỳ · 5 hợp đồng. Đối soát 6 hóa chất: 4 khớp tuyệt đối, 2 lệch ≤ 6 g do sheet cộng tay, **0 ô lệch thật**. Chạy lại lần hai: 0 dòng mới (idempotent) |
| **3** ✅ | API + hooks + audit (RBAC tạm) | **XONG 2026-08-20**: 16 route · 5 module dịch vụ · 20 hook · 51/51 phép kiểm round-trip (`npm run check:chemical-api`). **Còn treo: phân quyền chi tiết — phải hỏi lại người dùng trước khi chạy dữ liệu thật** |
| **4** ✅ | Frontend: nhật ký NH3 + lưới tháng + 5 tab còn lại + nav | **XONG 2026-08-20**: 8 component + 1 route + mục nav. `tsc`/`eslint` sạch, `next build` OK (trang 23,5 kB) |
| **5** ✅ | Bảng nhiều dòng xe ở bước lãnh của `MaterialTicket` (mục 7.3) | **XONG 2026-08-21**: cột `chemicalReceiptIds` · `lib/chemical-inventory/ticket-link.ts` · bảng nhiều dòng xe ở bước lãnh · hành động `chemicalTrucks` cho phiếu NH3 đã hoàn tất · gỡ liên kết khi xóa phiếu · 28/28 phép kiểm (`npm run check:chemical-link`) |

**Pha 2 là cửa ải**: số không tái lập được thì dừng, báo cáo, đừng làm tiếp UI.

---

## 15. KIỂM THỬ VÀ HOÀN THÀNH

1. Chạy đủ: `npx prisma generate` → `npx tsc --noEmit` → `npm run lint` → `npm run build`.
2. Kiểm tra chống trùng 7.2 bằng cả hai cửa với cùng `(ngày + biển số)`.
3. Kiểm tra `MONTH_END` của NH3 tự sinh đúng khi sửa bản đọc ngày cuối tháng.
4. Kiểm tra invalidate cache sau mutation.
5. Kiểm tra desktop + mobile.
6. **Không thao tác phá hủy trên dữ liệu thật.** Các bảng của module này độc lập nên test cục bộ được.
7. Repo không có test runner — **không thêm framework test**. Giữ `calculations.ts` thuần, kiểm
   bằng script `tsx` + typecheck + API round-trip.

---

## 16. BÁO CÁO CUỐI

- Model/bảng đã thêm; đường dẫn file SQL thủ công.
- API, hook, trang/component đã thêm.
- Quy tắc import + **kết quả đối soát thực đo** đặt cạnh bảng mục 3.8.
- Cơ chế chống trùng hai cửa đã hoạt động thế nào.
- Lỗi dữ liệu nguồn phát hiện được (số dòng mỗi loại cảnh báo).
- Kết quả `tsc` / `lint` / `build`.
- **Nhắc lại hai việc còn treo**: phân quyền chi tiết và quy tắc khóa kỳ.

**Không** sửa module không liên quan · **không** đổi convention API hiện có ·
**không** đặt logic tính toán quan trọng chỉ ở frontend · **không** dùng Google Sheet làm DB runtime ·
**không** hardcode tổng năm hay số liệu báo cáo · **không** so lượng đề xuất với lượng nhập.
