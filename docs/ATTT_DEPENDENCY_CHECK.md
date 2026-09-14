# Kiem soat thu vien va dependency

Tai lieu nay dung lam bang chung cho CS-ATTT-KTAT-21, muc A.8.28: phai kiem tra lo hong cua thu vien ben thu ba truoc khi su dung va trong qua trinh van hanh.

## 1. Muc tieu

- Phat hien som thu vien co lo hong bao mat.
- Co bang chung dependency check truoc khi nghiem thu/trien khai.
- Co ke hoach xu ly lo hong theo muc do uu tien.

## 2. Lenh kiem tra

Chay lenh sau tu thu muc goc du an (Node 24, xem `.nvmrc`):

```bash
npm audit --omit=dev
```

Xuat JSON de luu ho so vao thu muc `reports/` (duoc phep commit — chi chua ten/phien ban goi, khong co du lieu nguoi dung):

```bash
npm audit --omit=dev --json > reports/npm-audit-local-omit-dev-$(date +%Y%m%d).json
```

Neu can kiem tra ca dependency phuc vu build/dev:

```bash
npm audit --json > reports/npm-audit-local-full-$(date +%Y%m%d).json
```

Kiem tra tren Production (chi doc, chay tu may dev):

```bash
ssh -p 38791 root@<server> 'cd /var/www/dh1-app && npm audit --omit=dev --json' \
  > reports/npm-audit-production-omit-dev-$(date +%Y%m%d).json
```

## 3. Ket qua kiem tra gan nhat

Ngay kiem tra: 2026-09-14 (sau dot nang cap Node 24 / Next.js 16 / React 19)

| Moi truong | Lenh | File bang chung | Ket qua |
| --- | --- | --- | --- |
| May dev (Node 24.16, npm 10.8) | `npm audit --omit=dev --json` | `reports/npm-audit-local-omit-dev-20260914.json` | 0 lo hong |
| May dev | `npm audit --json` (ca goi dev/build) | `reports/npm-audit-local-full-20260914.json` | 0 lo hong |
| Production (Node 24.21, npm 11.19, commit `2357768`) | `npm audit --omit=dev --json` | `reports/npm-audit-production-omit-dev-20260914.json` | 0 lo hong |

Tong so lo hong: Critical 0 · High 0 · Moderate 0 · Low 0 (901 goi: 443 prod, 407 dev, 158 optional, 2 peer).

Trang thai: **DAT**. Cac lo hong ghi nhan ngay 2026-07-06 da xu ly het:

| Goi (2026-07-06) | Muc do | Cach xu ly | Commit |
| --- | --- | --- | --- |
| `next` | Critical | 14.2.16 → 14.2.35 va tat Image Optimization API (13/09); sau do len 16.3.5 (13/09); bat lai toi uu anh co khoa chat (14/09) | `d98e7ef`, `692efe2`, `2357768` |
| `next-auth` | Moderate | 5.0.0-beta.25 → 5.0.0-beta.32 (@auth/core 0.41.3) | `af22d1f` |
| `postcss` | Moderate | Het theo ban Next.js 16 | `692efe2` |
| `xlsx` | High | Bo ban npm 0.18.5 (SheetJS ngung phat hanh tren npm); dung ban chinh chu `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` | `0c034f4` |

Cac lo hong con lai phat hien trong dot nang cap, xu ly o commit `0c034f4` (11 → 0):

- `sharp` ^0.33.5 → ^0.35.4 (CVE libvips/libheif).
- `overrides.uuid` = ^11.1.1: `exceljs` 4.4.0 (ban cuoi) keo `uuid` 8.3.2. Khong len uuid 12 vi uuid 12 bo ban CommonJS.
- `overrides.xmldom` = `npm:@xmldom/xmldom@^0.8.15`: `docxtemplater-image-module-free` (ngung bao tri) keo `xmldom` 0.1.31 (Critical). Dung nhanh LTS 0.8 vi module goi `parseFromString` khong truyen mimeType (nhanh 0.9 bat buoc).
- `npm audit fix` cac goi gian tiep: browserslist, baseline-browser-mapping, brace-expansion, postcss-selector-parser.

Kiem tra truoc khi dua len Production (so voi bo thu vien cu dung rieng): 7 pipeline anh cua `sharp`, doc/ghi `exceljs` va `xlsx`, mau DOCX co chu ky qua ImageModule — ket qua giong nhau; `npx tsc --noEmit`, `npm run build`, crawl 55 trang (`scripts/verify/crawl.mjs`).

Luu y van hanh:

- `xlsx` tai tu CDN SheetJS: server phai truy cap duoc `cdn.sheetjs.com` khi `npm install`.
- `next-auth` v5 van la ban beta (chua co ban on dinh); theo doi ban phat hanh va audit hang thang.
- Prisma dang 5.22 (ban moi nhat 7.x): khong co lo hong; nang cap se lap ke hoach rieng.

Lich su: ket qua ngay 2026-07-06 (next Critical, next-auth Moderate, postcss Moderate, xlsx High — danh gia "Dat mot phan") duoc thay the boi ket qua tren.

## 4. Tan suat kiem tra

- Truoc moi lan trien khai Production co thay doi `package.json`/`package-lock.json`; luu file JSON vao `reports/`.
- Dinh ky hang thang doi voi he thong dang van hanh (ca may dev va Production).
- Ngay khi co thong bao lo hong nghiem trong lien quan den Next.js, NextAuth, Prisma, xlsx, sharp hoac thu vien upload/file.

## 5. Nguyen tac xu ly

- Critical/High: danh gia trong ngay lam viec tiep theo, lap ke hoach fix hoac bien phap giam thieu.
- Moderate: xu ly trong dot bao tri gan nhat hoac khi nang cap framework.
- Low: theo doi va xu ly khi co dot nang cap phu hop.
- Neu chua the nang cap ngay, phai ghi ro ly do, rui ro con lai va bien phap giam thieu tam thoi.
- Nang cap framework/thu vien lon: lam tren nhanh rieng, so hanh vi truoc/sau (crawl `scripts/verify/`), co ke hoach rollback (`docs/ATTT_ROLLBACK_PLAN.md`).

## 6. Bien phap giam thieu tam thoi

- Gioi han quyen truy cap cac endpoint upload/import theo RBAC.
- Khong upload/import file tu nguon khong tin cay.
- Duy tri gioi han kich thuoc file upload/import.
- `next/image` chi toi uu anh tinh noi bo: `images.localPatterns` gioi han `public/brand`, `public/chucvu`, `public/icons3d` (khong query string), `remotePatterns` rong, khong SVG, chi WebP chat luong 75 (xem `next.config.mjs`). Kiem tra bang `node scripts/verify/image-check.mjs <BASE>`.
- Theo doi audit log va log server sau moi dot trien khai.

## 7. Mau ghi nhan ket qua

```text
Ngay kiem tra:
Nguoi kiem tra:
Lenh kiem tra:
File bang chung (reports/...):
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
