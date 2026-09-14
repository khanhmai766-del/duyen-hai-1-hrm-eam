# Chinh sach du lieu test va file export

Tai lieu nay dung lam bang chung cho CS-ATTT-KTAT-21, muc A.8.29 va A.8.28: du lieu test khong duoc la du lieu van hanh that neu chua masking, va khong dua du lieu nhay cam vao ma nguon.

## 1. Nguyen tac

- Khong commit file export nguoi dung, nhan su, anh dai dien, chu ky, du lieu cham cong hoac du lieu van hanh that vao Git.
- Khong dung du lieu Production de test neu chua duoc phe duyet.
- Neu bat buoc dung du lieu that cho test, phai masking cac truong nhay cam.
- File export chi duoc luu tai kho luu tru noi bo duoc phe duyet, khong luu trong repo va khong de trong thu muc web cua server.

## 2. Cac loai du lieu nhay cam

- Ho ten, email, so dien thoai, ma nhan vien.
- Anh dai dien, chu ky, file dinh kem.
- Lich truc, cham cong, nhat ky van hanh.
- Thong tin tai khoan, role, phan quyen.
- Thong tin thiet bi/van hanh co tinh nhay cam.
- Secret/cau hinh: file `.env` va cac ban sao luu cua no.

## 3. Kiem soat Git

Repo da ignore cac file export nguoi dung va ket qua chay kiem thu:

```gitignore
users_export*.json
*_users_export*.json
reports/verify/
```

File duoc phep commit trong `reports/`: ket qua `npm audit` (`reports/npm-audit-*.json`) — chi chua ten va phien ban goi thu vien, khong co du lieu nguoi dung.

Truoc khi commit can kiem tra:

```bash
git status --short
git diff --cached --name-only
```

Neu thay file export/backup du lieu trong danh sach commit, phai bo khoi commit:

```bash
git restore --staged <file>
```

## 4. Masking du lieu test

Khi tao bo du lieu test tu du lieu that, toi thieu phai masking:

- Email: doi thanh domain noi bo test, vi du `user001@example.test`.
- So dien thoai: thay bang so gia.
- Ho ten: thay bang ten demo.
- Anh/chu ky: xoa hoac thay bang anh/chu ky demo.
- Ma nhan vien: doi thanh ma demo neu khong can doi chieu that.

## 5. Xu ly khi lo du lieu vao Git

1. Xoa file khoi commit hien tai hoac tao commit xoa file neu da push.
2. Danh gia du lieu co phai du lieu that/nhay cam hay khong.
3. Neu da push du lieu nhay cam len remote, can xem xet lam sach lich su Git bang cong cu chuyen dung va/hoac GitHub sensitive data removal.
4. Neu co password/API key bi lo, phai rotate ngay.
5. Ghi nhan su co va bien phap khac phuc.

## 6. Bang chung hien tai

Cap nhat: 2026-09-14

- File `users_export.json` da duoc xoa khoi repo; `.gitignore` chan pattern file export nguoi dung.
- Script xuat nguoi dung `export_users.mjs` (ghi cung thong tin ket noi DB local) da **xoa khoi repo** ngay 2026-09-14 (commit `cc0b30e`) va da go khoi server Production o lan deploy `2357768`. Repo khong con script export nguoi dung.
- Don thu muc web Production (`/var/www/dh1-app`) ngay 2026-09-14:
  - Xoa 3 ban sao luu `.env.backup_*` (chua khoa bi mat cu, quyen 644).
  - Chuyen file du lieu nghiep vu ra khoi thu muc web sang `/root/luu-tru-goc-app-20260914/` (thu muc 700, file 600): sao luu PCCC thang 08/2026, `data-import-FM200.xlsx`, bang doi chieu so thu tu phieu vat tu.
  - Sau khi don, thu muc app khong con file nao nam ngoai Git.
- Bo kiem thu nang cap `scripts/verify/` (crawl 55 trang, hydration, anh):
  - Chi chay voi DB Dev local; tu choi neu `DATABASE_URL` hoac dia chi trang khong phai localhost (`scripts/verify/_safety.mjs`).
  - Tao tai khoan ADMIN tam (ten `TEST ... (tam)`, email `@local.test`, mat khau ngau nhien), ky cookie bang secret DEV, xoa tai khoan ngay sau khi chay.
  - Khong tao tai khoan va khong ky token tren Production; kiem tra Production chi goi URL cong khai (vd `scripts/verify/image-check.mjs`).
  - Ket qua ghi vao `reports/verify/` (gitignore).
- Ket qua `npm audit` luu trong `reports/` lam bang chung dependency check.

## 7. Mau ghi nhan bo du lieu test

```text
Ten bo du lieu:
Nguon du lieu:
Ngay tao:
Nguoi tao:
Co du lieu Production khong:
Da masking cac truong nao:
Noi luu tru:
Thoi han luu:
Nguoi phe duyet:
```
