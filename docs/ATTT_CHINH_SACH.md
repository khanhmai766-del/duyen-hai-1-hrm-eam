# Chinh sach ATTT — PowerPlant EAM

Tai lieu gop cac chinh sach kiem soat ATTT theo CS-ATTT-KTAT-21 (gop tu 5 file rieng ngay 2026-09-14; ban cu xem lich su Git).
Ho so thuc hien (release, rollback, bang chung kiem tra) nam o `docs/ATTT_HO_SO_RELEASE.md`.

| Phan | Noi dung | Muc kiem soat |
| --- | --- | --- |
| A | Kiem soat thu vien va dependency | A.8.28 |
| B | Phan tach moi truong Dev, Test va Production | A.8.31 |
| C | Checklist ATTT truoc khi trien khai | A.8.25, A.8.32 |
| D | Ke hoach rollback khi thay doi phan mem | A.8.25 |
| E | Chinh sach du lieu test va file export | A.8.29, A.8.28 |

---

# Phan A — Kiem soat thu vien va dependency

Bang chung cho CS-ATTT-KTAT-21, muc A.8.28: phai kiem tra lo hong cua thu vien ben thu ba truoc khi su dung va trong qua trinh van hanh.

## A.1. Muc tieu

- Phat hien som thu vien co lo hong bao mat.
- Co bang chung dependency check truoc khi nghiem thu/trien khai.
- Co ke hoach xu ly lo hong theo muc do uu tien.

## A.2. Lenh kiem tra

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

## A.3. Ket qua kiem tra gan nhat

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
- Prisma dang 5.22 (ban moi nhat 7.x): khong co lo hong; ke hoach nang cap: `docs/ATTT_HO_SO_RELEASE.md` muc 7.

Lich su: ket qua ngay 2026-07-06 (next Critical, next-auth Moderate, postcss Moderate, xlsx High — danh gia "Dat mot phan") duoc thay the boi ket qua tren.

## A.4. Tan suat kiem tra

- Truoc moi lan trien khai Production co thay doi `package.json`/`package-lock.json`; luu file JSON vao `reports/`.
- Dinh ky hang thang doi voi he thong dang van hanh (ca may dev va Production).
- Ngay khi co thong bao lo hong nghiem trong lien quan den Next.js, NextAuth, Prisma, xlsx, sharp hoac thu vien upload/file.

## A.5. Nguyen tac xu ly

- Critical/High: danh gia trong ngay lam viec tiep theo, lap ke hoach fix hoac bien phap giam thieu.
- Moderate: xu ly trong dot bao tri gan nhat hoac khi nang cap framework.
- Low: theo doi va xu ly khi co dot nang cap phu hop.
- Neu chua the nang cap ngay, phai ghi ro ly do, rui ro con lai va bien phap giam thieu tam thoi.
- Nang cap framework/thu vien lon: lam tren nhanh rieng, so hanh vi truoc/sau (crawl `scripts/verify/`), co ke hoach rollback (Phan D).

## A.6. Bien phap giam thieu tam thoi

- Gioi han quyen truy cap cac endpoint upload/import theo RBAC.
- Khong upload/import file tu nguon khong tin cay.
- Duy tri gioi han kich thuoc file upload/import.
- `next/image` chi toi uu anh tinh noi bo: `images.localPatterns` gioi han `public/brand`, `public/chucvu`, `public/icons3d` (khong query string), `remotePatterns` rong, khong SVG, chi WebP chat luong 75 (xem `next.config.mjs`). Kiem tra bang `node scripts/verify/image-check.mjs <BASE>`.
- Theo doi audit log va log server sau moi dot trien khai.

## A.7. Mau ghi nhan ket qua

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

---

# Phan B — Phan tach moi truong Dev, Test va Production

Bang chung cho CS-ATTT-KTAT-21, muc A.8.31: moi truong phat trien, kiem thu va san xuat phai duoc phan tach ve ha tang va quyen truy cap.

## B.1. Nguyen tac

- Dev, Test/UAT va Production phai su dung database rieng.
- Khong dung du lieu van hanh that de test neu chua duoc phe duyet va masking.
- Khong commit `.env` vao Git.
- Khong thao tac truc tiep du lieu Production neu chua co phe duyet.
- Moi thay doi Production phai di qua Git, build va quy trinh trien khai.
- Moi moi truong phai dung cung phien ban runtime (muc B.2).

## B.2. Yeu cau phan mem (cap nhat 2026-09-14)

| Thanh phan | Yeu cau | Dev | Production |
| --- | --- | --- | --- |
| Node.js | 24.x — `package.json` `engines` = `>=24 <25`, `.nvmrc` = `24` | 24.16.0 | 24.21.0 (tu 2026-09-13) |
| npm | Di kem Node 24 | 10.8.2 | 11.19.0 |
| Next.js | 16.3.5 (Turbopack; `proxy.ts` thay `middleware.ts`) | 16.3.5 | 16.3.5 |
| React / React DOM | 19.3 | 19.3.0 | 19.3.0 |
| next-auth | 5.0.0-beta.32 | 5.0.0-beta.32 | 5.0.0-beta.32 |
| Prisma | 5.22 | 5.22.0 | 5.22.0 |
| PostgreSQL | Tu 13 tro len | Embedded PostgreSQL (port 5433, `.pgdata`) | PostgreSQL 16 tren may DB rieng |
| Quan ly tien trinh | — | `npm run dev` | pm2 `dh1-app` (fork, `ecosystem.config.js`) sau nginx |

Khong ho tro Node 20/22: cac ban lui Node 20 tren Production chi giu tam de rollback (xem muc D.8.1).
Kiem tra nhanh: `node -v` (Dev), `pm2 describe dh1-app | grep "node.js version"` (Production).

## B.3. Moi truong Dev

- Su dung embedded PostgreSQL tren port 5433 va thu muc `.pgdata` (gitignore).
- Cho phep seed du lieu demo bang `npm run db:seed`.
- Co the reset du lieu Dev khi can, nhung khong dong bo nguoc len Production.
- `.env` Dev chi dung cho may phat trien, khong dua vao Git.
- Bo kiem thu nang cap `scripts/verify/` chi chay voi DB Dev local va site chay tren may nay; script tu tu choi neu `DATABASE_URL` hoac dia chi trang khong phai localhost.

Lenh thuong dung:

```bash
npm run dev          # tu bat embedded PostgreSQL neu chua chay
npx tsc --noEmit
npm run lint
npm run build
npm run db:push
npm run db:seed
```

## B.4. Moi truong Test/UAT

- Nen co database rieng voi Production.
- Du lieu test phai la du lieu demo hoac da masking.
- Chi tai khoan duoc phan cong moi co quyen truy cap.
- Ghi nhan ket qua test truoc khi trien khai Production.

Hien trang (2026-09-14): chua co moi truong UAT rieng. Thay the tam thoi:

- Kiem thu tren may Dev bang ban build Production (`next start`) + crawl 55 trang so moc (`scripts/verify/`).
- Chu du an kiem tay tren localhost truoc moi lan deploy.
- Nang cap runtime/framework duoc chay thu song song tren server Production o thu muc/cong rieng (dung chung cau hinh Production) truoc khi doi thu muc; ban cu duoc giu de lui trong vai giay.
- Rui ro con lai: chay thu song song dung database Production. Khuyen nghi dung moi truong UAT co database rieng (khoi phuc tu ban sao luu) cho cac dot nang cap sau — du kien dung cho dot nang cap Prisma.

## B.5. Moi truong Production

- Su dung database rieng, khong dung chung voi Dev/Test.
- Secret nhu `DATABASE_URL`, `AUTH_SECRET`, S3 key phai nam trong cau hinh server/secret manager, khong nam trong Git; file `.env` tren server khong de ban sao luu trong thu muc web (da don 2026-09-14).
- Khong chay script thay doi du lieu neu chua co ke hoach rollback/backup.
- Khong dung `prisma db push --accept-data-loss` tren Production.
- Khong build/cai thu vien/khoi dong lai bang tay trong `/var/www/dh1-app`; chi trien khai bang `./scripts/deploy-server.sh`.

## B.6. Kiem soat quyen truy cap

- Chi nguoi duoc phan cong moi duoc SSH/remote vao server Production.
- Tai khoan Admin trong ung dung phai duoc cap theo nhu cau cong viec.
- Khi nhan su thay doi vai tro/nghi viec, phai khoa hoac thu hoi tai khoan lien quan.
- Sao luu DB dung vai tro rieng `dh1_backup` (chi doc, chi mo tu may app) — `docs/huong-dan-deploy-production.md` phu luc C.

## B.7. Kiem tra bang chung

Bang chung co the gom:

- `.gitignore` co chan `.env`, `.pgdata`, file export nguoi dung, `reports/verify/`.
- File `.env.example` chi chua gia tri mau.
- `package.json` (`engines`), `.nvmrc`, `ecosystem.config.js`.
- Log Git commit/release; ho so `docs/ATTT_HO_SO_RELEASE.md`.
- Bien ban test/UAT; ket qua crawl so moc.
- Log backup va deploy Production (`/root/deploy-*.log`, `/root/backup-dh1db-*.sql.gz`).

## B.8. Mau ghi nhan moi truong

```text
Moi truong:
URL:
Phien ban Node.js / Next.js / React:
Database:
Nguoi quan tri:
Nguoi co quyen truy cap:
Co dung du lieu that khong:
Neu co, du lieu da masking/chua:
Ghi chu:
```

---

# Phan C — Checklist ATTT truoc khi trien khai

Mau kiem soat thay doi truoc khi dua code len moi truong Test/UAT hoac Production. Ho so da dien: `docs/ATTT_HO_SO_RELEASE.md`.

## C.1. Thong tin chung

```text
Ten thay doi:
Ma commit/release:
Nhanh Git:
Nguoi thuc hien:
Nguoi review/phe duyet:
Moi truong trien khai: Dev / Test / Production
Thoi gian trien khai du kien:
```

## C.2. Kiem tra bat buoc

| Muc kiem tra | Trang thai | Ghi chu |
| --- | --- | --- |
| Code da duoc commit len Git | OK / NOK / N/A | |
| Co ke hoach rollback | OK / NOK / N/A | Phan D |
| Moi truong dung dung phien ban (Node 24, xem `.nvmrc`) | OK / NOK / N/A | Muc B.2 |
| Chay `npx tsc --noEmit` | OK / NOK / N/A | |
| Chay `npm run lint` (0 loi) | OK / NOK / N/A | ESLint 9; Next 16 da bo `next lint` |
| Chay `npm run build` (tren may dev) | OK / NOK / N/A | Khong build tai cho tren server Production |
| Chay `npm audit --omit=dev`, luu JSON vao `reports/` | OK / NOK / N/A | Phan A |
| Thay doi framework/thu vien: crawl so moc truoc/sau | OK / NOK / N/A | `scripts/verify/README.md` |
| Khong commit `.env`, secret, API key | OK / NOK / N/A | |
| Khong commit file export du lieu nguoi dung | OK / NOK / N/A | |
| Thay doi co audit log neu la mutation quan trong | OK / NOK / N/A | |
| Thay doi upload/import co gioi han file | OK / NOK / N/A | |
| Co kiem tra RBAC server-side | OK / NOK / N/A | |
| Trien khai Production bang `./scripts/deploy-server.sh` | OK / NOK / N/A | `docs/huong-dan-deploy-production.md` |

## C.3. Neu co thay doi database

| Muc kiem tra | Trang thai | Ghi chu |
| --- | --- | --- |
| Da review `prisma/schema.prisma` hoac SQL | OK / NOK / N/A | |
| Co file SQL tien/rollback neu can | OK / NOK / N/A | |
| Da backup truoc khi chay tren Production | OK / NOK / N/A | `deploy-server.sh` tu sao luu bang vai tro `dh1_backup` |
| Khong dung `db push --accept-data-loss` tren Production | OK / NOK / N/A | |
| Da kiem tra nguy co mat du lieu | OK / NOK / N/A | |

## C.4. Kiem tra sau trien khai

| Chuc nang | Ket qua | Ghi chu |
| --- | --- | --- |
| Dang nhap/dang xuat | OK / NOK | |
| Trang Dashboard | OK / NOK | |
| Trang lien quan den thay doi | OK / NOK | |
| API lien quan den thay doi | OK / NOK | |
| Audit log | OK / NOK | |
| Log server khong co loi moi (pm2 error log, nginx 5xx) | OK / NOK | |

## C.5. Ket luan

```text
Ket qua trien khai: Thanh cong / Rollback / Theo doi them
Nguoi xac nhan:
Thoi gian xac nhan:
Ghi chu:
```

---

# Phan D — Ke hoach rollback khi thay doi phan mem

Bang chung kiem soat ATTT theo CS-ATTT-KTAT-21, muc A.8.25: moi thay doi phan mem phai duoc quan ly phien ban va co ke hoach khoi phuc (rollback) ro rang.

## D.1. Pham vi ap dung

- Ap dung cho moi thay doi ma nguon, cau hinh, schema database, script van hanh, runtime (Node.js) va tai lieu trien khai cua he thong PowerPlant EAM.
- Ap dung cho cac moi truong Dev, Test/UAT va Production.
- Moi thay doi dua len Production phai co commit Git xac dinh, nguoi thuc hien, thoi diem trien khai va phuong an rollback.

## D.2. Nguyen tac chung

- Khong sua truc tiep ma nguon tren may chu Production.
- Khong thao tac truc tiep du lieu Production neu chua co phe duyet va ke hoach khoi phuc.
- Uu tien rollback bang commit moi thong qua `git revert`, khong dung `git reset --hard` tren nhanh da push/chia se.
- Neu thay doi co database, rollback code truoc; chi rollback database khi co file SQL rieng va da danh gia nguy co mat du lieu.
- Truoc va sau rollback phai ghi nhan bang chung: commit, lenh da chay, ket qua kiem tra, nguoi thuc hien.
- Nang cap runtime/framework (Node.js, Next.js, React): giu ban lui co the chuyen lai trong vai giay (thu muc cu + script) cho den khi xac nhan on dinh, roi moi xoa (co phe duyet).
- Thay doi thu vien (`package.json`/lock): `./scripts/deploy-server.sh --rollback` chi doi thu muc build `.next`, KHONG lui `node_modules` — rollback bang `git revert` + deploy.

## D.3. Quy trinh trien khai co kiem soat

1. Xac dinh commit se trien khai:

   ```bash
   git log -1 --oneline
   ```

2. Chay kiem tra toi thieu truoc khi trien khai (tren MAY DEV, khong chay tren server Production):

   ```bash
   npx tsc --noEmit
   npm run lint
   npm run build
   ```

   Voi thay doi framework/thu vien: build ban Production, crawl 55 trang truoc va sau thay doi roi so sanh
   (`scripts/verify/crawl.mjs`, `scripts/verify/compare-crawl.mjs` — xem `scripts/verify/README.md`).

3. Ghi nhan thong tin thay doi vao mau o muc D.7 hoac vao ho so release (Phan C; vi du da dien: `docs/ATTT_HO_SO_RELEASE.md`).

4. Trien khai len moi truong dich theo quy trinh van hanh hien hanh. Production: chi dung
   `./scripts/deploy-server.sh`, theo `docs/huong-dan-deploy-production.md`.

5. Kiem tra sau trien khai:

   - Dang nhap/dang xuat.
   - Cac man hinh chinh lien quan den thay doi.
   - API/mutation lien quan den thay doi.
   - Audit log neu thay doi lien quan den bao mat/du lieu.
   - Error log pm2 va loi 5xx nginx trong 10 phut sau khi deploy.

## D.4. Rollback thay doi chi gom code/cau hinh

Dung khi thay doi khong lam thay doi schema database va khong can khoi phuc du lieu.

1. Xac dinh commit can rollback:

   ```bash
   git log --oneline --decorate -10
   ```

2. Tao commit rollback:

   ```bash
   git revert <commit-id>
   ```

3. Kiem tra:

   ```bash
   npx tsc --noEmit
   npm run lint
   npm run build
   ```

4. Dua rollback len GitHub:

   ```bash
   git push origin main
   ```

5. Trien khai lai tren server: `./scripts/deploy-server.sh` (script tu `npm install` khi `package.json` doi).

## D.5. Rollback thay doi co database

Dung khi thay doi co lien quan den `prisma/schema.prisma`, SQL migration, cot/bang moi hoac script sua du lieu.

Nguyen tac:

- Neu co the, rollback code truoc bang `git revert`.
- Khong tu dong xoa cot/bang neu cot/bang co the dang chua du lieu moi.
- Neu bat buoc rollback database, phai co file SQL rollback rieng, duoc review truoc khi chay.
- Truoc khi chay SQL rollback tren Production phai backup database.

Backup: `./scripts/deploy-server.sh` tu sao luu DB truoc moi lan deploy bang vai tro `dh1_backup`
(BYPASSRLS, chi doc; mat khau trong `/root/.pgpass`), file `/root/backup-dh1db-<ngay-gio>-truoc-<commit>.sql.gz`.
Khong dung `pg_dump "$DATABASE_URL"` bang tai khoan website: cac bang TCMS bat FORCE ROW LEVEL SECURITY nen ban dump se
hong giua chung. Huong dan tao vai tro: `docs/huong-dan-deploy-production.md` phu luc C.

Mau rollback database:

```bash
npx prisma db execute --file scripts/sql/<rollback-file>.sql --schema prisma/schema.prisma
```

Sau rollback database phai kiem tra:

- Ung dung khoi dong duoc.
- Dang nhap duoc.
- Chuc nang lien quan doc/ghi du lieu binh thuong.
- Khong co loi Prisma/SQL trong log server.

## D.6. Rollback khan cap tren server

Chi dung khi Production dang loi va can khoi phuc nhanh.

KHONG chay `npm run build` / `pm2 restart` bang tay tren server: build tai cho xoa `.next` dang
chay, nguoi dung bi loi 500 trong 2-3 phut (xac nhan 13/09/2026). Server giu san 3 ban build
truoc; rollback chi doi ten thu muc + `pm2 reload`, xong trong vai giay:

```bash
cd /var/www/dh1-app
./scripts/deploy-server.sh --rollback --dry-run   # xem se dua ban nao vao
./scripts/deploy-server.sh --rollback             # chay lai lan nua la ve lai ban vua go
```

Neu can dua mot commit revert len Production: push commit do len `main`, sau do chay
`./scripts/deploy-server.sh`. Chi tiet va xu ly su co: `docs/huong-dan-deploy-production.md`.

## D.7. Mau ghi nhan rollback cho tung lan thay doi

```text
Ten thay doi:
Ma commit/release:
Ngay trien khai:
Nguoi trien khai:
Moi truong: Dev / Test / Production

Pham vi thay doi:
- 

Anh huong database: Co / Khong
Neu co database, file SQL tien:
Neu co database, file SQL rollback:

Lenh kiem tra truoc trien khai:
- npx tsc --noEmit
- npm run lint
- npm run build

Ke hoach rollback:
- Commit rollback/revert:
- Lenh rollback:
- Thoi gian du kien rollback:
- Nguoi phe duyet rollback:

Kiem tra sau rollback:
- Dang nhap/dang xuat:
- Chuc nang lien quan:
- Log loi server:
- Audit log:

Ket qua:
Nguoi xac nhan:
```

## D.8. Vi du rollback cho cac thay doi gan nhat

Ho so trien khai day du cua dot nang cap: `docs/ATTT_HO_SO_RELEASE.md`.

### D.8.1. Nang cap Node.js 20 → 24 (Production, 13/09/2026)

```text
Ten thay doi: Nang runtime Production tu Node.js 20.20.2 len 24.21.0 (npm 11.19.0)
Ma commit/release: 638b7e9 (engines ">=24 <25", .nvmrc = 24, ecosystem.config.js)
Anh huong database: Khong
Cach trien khai: /root/node-upgrade-20260913/cutover.sh, 2026-09-13 04:27 UTC

Ke hoach rollback — KHI CON ban lui (den khi xoa, du kien sau 2026-09-15):
- Chay: bash /root/node-upgrade-20260913/rollback.sh
  Script tra thu muc /var/www/dh1-app-node20 (giu nguyen node_modules va .next) ve /var/www/dh1-app,
  cai lai goi nodejs_20.20.2 da tai san (dpkg -i), apt-mark hold nodejs, nap lai pm2.
  Khong can npm ci hay build; thoi gian du kien: vai chuc giay.
- Kiem tra: node -v = v20.x; pm2 describe dh1-app | grep "node.js version"; https://duyenhai1.vn/login = 200

Ke hoach rollback — SAU KHI da xoa ban lui:
- La dot bao tri co ke hoach, khong phai thao tac khan cap: cai Node 20 tu NodeSource (setup_20.x),
  git revert 638b7e9 tren nhanh rieng, cai lai node_modules (goi native nhu sharp phai build lai cho Node 20),
  build va chuyen bang ./scripts/deploy-server.sh; chay thu truoc o thu muc/cong rieng nhu dot cutover.

Kiem tra sau rollback:
- Dang nhap mat khau + passkey, dang xuat
- Trang chu, mot chuc nang xuat Excel/PDF va tai anh len (dung thu vien native)
- pm2 khong khoi dong lai lien tuc; error log va nginx 5xx khong co loi moi
```

### D.8.2. Nang cap Next.js 14 → 16 + React 18 → 19 (Production, 13/09/2026)

```text
Ten thay doi: Next.js 14.2.35 → 16.3.5, React 18 → 19.3 (codemod async request API, middleware.ts → proxy.ts, ESLint 9)
Ma commit/release: 692efe2, 9d5d2ae, 3861d33
                   (cac dot sau cung dot: 0c034f4, a8becf8, 18fadfc … a5e3228, 2357768)
Anh huong database: Khong (khong doi schema)
Cach trien khai: build san o /var/www/dh1-app-next16, doi thu muc 2026-09-13 09:54 UTC, gian doan ~1 giay

Ke hoach rollback — chon theo muc do:
1. Loi o ban deploy gan nhat (van la Next 16, khong doi thu vien):
   ./scripts/deploy-server.sh --rollback --dry-run
   ./scripts/deploy-server.sh --rollback
   Server giu 3 ban build truoc; doi ten thu muc + pm2 reload, vai giay.
2. Can ve han Next 14 — KHI CON ban lui (den khi xoa, du kien sau 2026-09-15):
   bash /root/rollback-next16.sh
   Can symlink /var/www/dh1-app-next16 va thu muc /var/www/dh1-app-next14; chi lui ma nguon, vai giay.
   Luu y: ban Next 14 do la ban truoc cac dot sau 09:54 UTC (va lo hong, ESLint, toi uu anh).
3. Can ve Next 14 — SAU KHI da xoa ban lui:
   git revert theo thu tu nguoc tu 2357768 ve 692efe2 tren nhanh rieng; chay npx tsc --noEmit, npm run lint,
   npm run build va crawl so moc (scripts/verify); push main; ./scripts/deploy-server.sh (script tu npm install).
   Neu lui ve truoc 2357768 thi /_next/image khong duoc dung nua (anh hien ban goc) — binh thuong.

Kiem tra sau rollback:
- Dang nhap mat khau + passkey, dang xuat; tai khoan chi xem (DEFECT_READ_ONLY) van bi gioi han
- Trang chu, khiem khuyet, vat tu, PCCC, TBYCNN, xuat Excel/Word
- Dong bo n8n luot ke tiep (lich 15 phut)
- Error log pm2 va nginx 5xx trong 10 phut
```

### D.8.3. Vi du cu: Tang cuong kiem soat reset mat khau va audit dang nhap

```text
Ten thay doi: Tang cuong kiem soat reset mat khau va audit dang nhap
Ma commit/release: 44e21b6
Anh huong database: Khong

Ke hoach rollback:
- Chay: git revert 44e21b6
- Chay: npx tsc --noEmit
- Chay: git push origin main
- Trien khai lai tu nhanh main tren server (./scripts/deploy-server.sh)

Kiem tra sau rollback:
- Dang nhap bang mat khau
- Dang xuat thu cong
- Tu dong dang xuat do timeout
- Mo trang Quan tri nguoi dung
- Reset mat khau nguoi dung
```

---

# Phan E — Chinh sach du lieu test va file export

Bang chung cho CS-ATTT-KTAT-21, muc A.8.29 va A.8.28: du lieu test khong duoc la du lieu van hanh that neu chua masking, va khong dua du lieu nhay cam vao ma nguon.

## E.1. Nguyen tac

- Khong commit file export nguoi dung, nhan su, anh dai dien, chu ky, du lieu cham cong hoac du lieu van hanh that vao Git.
- Khong dung du lieu Production de test neu chua duoc phe duyet.
- Neu bat buoc dung du lieu that cho test, phai masking cac truong nhay cam.
- File export chi duoc luu tai kho luu tru noi bo duoc phe duyet, khong luu trong repo va khong de trong thu muc web cua server.

## E.2. Cac loai du lieu nhay cam

- Ho ten, email, so dien thoai, ma nhan vien.
- Anh dai dien, chu ky, file dinh kem.
- Lich truc, cham cong, nhat ky van hanh.
- Thong tin tai khoan, role, phan quyen.
- Thong tin thiet bi/van hanh co tinh nhay cam.
- Secret/cau hinh: file `.env` va cac ban sao luu cua no.

## E.3. Kiem soat Git

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

## E.4. Masking du lieu test

Khi tao bo du lieu test tu du lieu that, toi thieu phai masking:

- Email: doi thanh domain noi bo test, vi du `user001@example.test`.
- So dien thoai: thay bang so gia.
- Ho ten: thay bang ten demo.
- Anh/chu ky: xoa hoac thay bang anh/chu ky demo.
- Ma nhan vien: doi thanh ma demo neu khong can doi chieu that.

## E.5. Xu ly khi lo du lieu vao Git

1. Xoa file khoi commit hien tai hoac tao commit xoa file neu da push.
2. Danh gia du lieu co phai du lieu that/nhay cam hay khong.
3. Neu da push du lieu nhay cam len remote, can xem xet lam sach lich su Git bang cong cu chuyen dung va/hoac GitHub sensitive data removal.
4. Neu co password/API key bi lo, phai rotate ngay.
5. Ghi nhan su co va bien phap khac phuc.

## E.6. Bang chung hien tai

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

## E.7. Mau ghi nhan bo du lieu test

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
