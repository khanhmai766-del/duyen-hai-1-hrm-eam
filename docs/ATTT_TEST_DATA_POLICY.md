# Chinh sach du lieu test va file export

Tai lieu nay dung lam bang chung cho CS-ATTT-KTAT-21, muc A.8.29 va A.8.28: du lieu test khong duoc la du lieu van hanh that neu chua masking, va khong dua du lieu nhay cam vao ma nguon.

## 1. Nguyen tac

- Khong commit file export nguoi dung, nhan su, anh dai dien, chu ky, du lieu cham cong hoac du lieu van hanh that vao Git.
- Khong dung du lieu Production de test neu chua duoc phe duyet.
- Neu bat buoc dung du lieu that cho test, phai masking cac truong nhay cam.
- File export chi duoc luu tai kho luu tru noi bo duoc phe duyet, khong luu trong repo.

## 2. Cac loai du lieu nhay cam

- Ho ten, email, so dien thoai, ma nhan vien.
- Anh dai dien, chu ky, file dinh kem.
- Lich truc, cham cong, nhat ky van hanh.
- Thong tin tai khoan, role, phan quyen.
- Thong tin thiet bi/van hanh co tinh nhay cam.

## 3. Kiem soat Git

Repo da ignore cac file export nguoi dung:

```gitignore
users_export*.json
*_users_export*.json
```

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

- File `users_export.json` da duoc xoa khoi trang thai hien tai cua repo.
- `.gitignore` da bo sung pattern chan file export nguoi dung.
- Script export van co the su dung noi bo, nhung file sinh ra khong duoc commit vao Git.

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
