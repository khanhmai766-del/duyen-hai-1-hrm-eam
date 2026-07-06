# Kiem soat thu vien va dependency

Tai lieu nay dung lam bang chung cho CS-ATTT-KTAT-21, muc A.8.28: phai kiem tra lo hong cua thu vien ben thu ba truoc khi su dung va trong qua trinh van hanh.

## 1. Muc tieu

- Phat hien som thu vien co lo hong bao mat.
- Co bang chung dependency check truoc khi nghiem thu/trien khai.
- Co ke hoach xu ly lo hong theo muc do uu tien.

## 2. Lenh kiem tra

Chay lenh sau tu thu muc goc du an:

```bash
npm audit --omit=dev
```

Co the xuat JSON de luu ho so:

```bash
npm audit --omit=dev --json > reports/npm-audit-$(date +%Y%m%d).json
```

Neu can kiem tra ca dependency phuc vu build/dev:

```bash
npm audit
```

## 3. Ket qua kiem tra gan nhat

Ngay kiem tra: 2026-07-06

Lenh da chay:

```bash
npm audit --omit=dev --json
```

Tom tat ket qua:

| Goi | Muc do | Ghi chu xu ly |
| --- | --- | --- |
| `next` | Critical | Can len ke hoach nang cap Next.js len ban da va; viec nang cap co the anh huong runtime nen can test rieng. |
| `next-auth` | Moderate | Co ban fix `5.0.0-beta.31`; can test login/session/WebAuthn truoc khi dua len Production. |
| `postcss` | Moderate | Phu thuoc gian tiep qua `next`; xu ly cung ke hoach nang cap Next.js. |
| `xlsx` | High | `npm audit` bao khong co fix available; can danh gia thay the hoac giam pham vi su dung file Excel nhap/xuat. |

Trang thai hien tai: da co bang chung kiem tra, chua xu ly het lo hong. Muc checklist nen danh gia "Dat mot phan" cho den khi co commit nang cap/thay the va ket qua audit moi sach hon.

## 4. Tan suat kiem tra

- Truoc moi lan trien khai Production.
- Dinh ky hang thang doi voi he thong dang van hanh.
- Ngay khi co thong bao lo hong nghiem trong lien quan den Next.js, NextAuth, Prisma, xlsx hoac thu vien upload/file.

## 5. Nguyen tac xu ly

- Critical/High: danh gia trong ngay lam viec tiep theo, lap ke hoach fix hoac bien phap giam thieu.
- Moderate: xu ly trong dot bao tri gan nhat hoac khi nang cap framework.
- Low: theo doi va xu ly khi co dot nang cap phu hop.
- Neu chua the nang cap ngay, phai ghi ro ly do, rui ro con lai va bien phap giam thieu tam thoi.

## 6. Bien phap giam thieu tam thoi

- Gioi han quyen truy cap cac endpoint upload/import theo RBAC.
- Khong upload/import file tu nguon khong tin cay.
- Duy tri gioi han kich thuoc file upload/import.
- Han che `next/image` chi toi domain can thiet khi co du danh sach domain anh thuc te.
- Theo doi audit log va log server sau moi dot trien khai.

## 7. Mau ghi nhan ket qua

```text
Ngay kiem tra:
Nguoi kiem tra:
Lenh kiem tra:
Tong so lo hong:
- Critical:
- High:
- Moderate:
- Low:

Danh sach lo hong chinh:
-

Ke hoach xu ly:
-

Bien phap giam thieu tam thoi:
-

Ket qua sau khi xu ly:
```
