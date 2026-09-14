# Ke hoach rollback khi thay doi phan mem

Tai lieu nay dung lam bang chung kiem soat ATTT theo CS-ATTT-KTAT-21, muc A.8.25: moi thay doi phan mem phai duoc quan ly phien ban va co ke hoach khoi phuc (rollback) ro rang.

## 1. Pham vi ap dung

- Ap dung cho moi thay doi ma nguon, cau hinh, schema database, script van hanh, runtime (Node.js) va tai lieu trien khai cua he thong PowerPlant EAM.
- Ap dung cho cac moi truong Dev, Test/UAT va Production.
- Moi thay doi dua len Production phai co commit Git xac dinh, nguoi thuc hien, thoi diem trien khai va phuong an rollback.

## 2. Nguyen tac chung

- Khong sua truc tiep ma nguon tren may chu Production.
- Khong thao tac truc tiep du lieu Production neu chua co phe duyet va ke hoach khoi phuc.
- Uu tien rollback bang commit moi thong qua `git revert`, khong dung `git reset --hard` tren nhanh da push/chia se.
- Neu thay doi co database, rollback code truoc; chi rollback database khi co file SQL rieng va da danh gia nguy co mat du lieu.
- Truoc va sau rollback phai ghi nhan bang chung: commit, lenh da chay, ket qua kiem tra, nguoi thuc hien.
- Nang cap runtime/framework (Node.js, Next.js, React): giu ban lui co the chuyen lai trong vai giay (thu muc cu + script) cho den khi xac nhan on dinh, roi moi xoa (co phe duyet).

## 3. Quy trinh trien khai co kiem soat

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

3. Ghi nhan thong tin thay doi vao mau o muc 7 cua tai lieu nay hoac vao ho so release
   (`docs/ATTT_RELEASE_CHECKLIST.md`, vi du da dien: `docs/ATTT_RELEASE_NANG_CAP_2026-09.md`).

4. Trien khai len moi truong dich theo quy trinh van hanh hien hanh. Production: chi dung
   `./scripts/deploy-server.sh`, theo `docs/huong-dan-deploy-production.md`.

5. Kiem tra sau trien khai:

   - Dang nhap/dang xuat.
   - Cac man hinh chinh lien quan den thay doi.
   - API/mutation lien quan den thay doi.
   - Audit log neu thay doi lien quan den bao mat/du lieu.
   - Error log pm2 va loi 5xx nginx trong 10 phut sau khi deploy.

## 4. Rollback thay doi chi gom code/cau hinh

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

## 5. Rollback thay doi co database

Dung khi thay doi co lien quan den `prisma/schema.prisma`, SQL migration, cot/bang moi hoac script sua du lieu.

Nguyen tac:

- Neu co the, rollback code truoc bang `git revert`.
- Khong tu dong xoa cot/bang neu cot/bang co the dang chua du lieu moi.
- Neu bat buoc rollback database, phai co file SQL rollback rieng, duoc review truoc khi chay.
- Truoc khi chay SQL rollback tren Production phai backup database.

Backup: `./scripts/deploy-server.sh` tu sao luu DB truoc moi lan deploy bang vai tro `dh1_backup`
(BYPASSRLS, chi doc; mat khau trong `/root/.pgpass`), file `/root/backup-dh1db-<ngay-gio>-truoc-<commit>.sql.gz`.
Khong dung `pg_dump "$DATABASE_URL"` bang tai khoan website: cac bang TCMS bat FORCE ROW LEVEL SECURITY nen ban dump se
hong giua chung. Huong dan tao vai tro: `docs/deploy-backup-role.md`.

Mau rollback database:

```bash
npx prisma db execute --file scripts/sql/<rollback-file>.sql --schema prisma/schema.prisma
```

Sau rollback database phai kiem tra:

- Ung dung khoi dong duoc.
- Dang nhap duoc.
- Chuc nang lien quan doc/ghi du lieu binh thuong.
- Khong co loi Prisma/SQL trong log server.

## 6. Rollback khan cap tren server

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

## 7. Mau ghi nhan rollback cho tung lan thay doi

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

## 8. Vi du rollback cho cac thay doi gan nhat

Ho so trien khai day du cua dot nang cap: `docs/ATTT_RELEASE_NANG_CAP_2026-09.md`.

### 8.1. Nang cap Node.js 20 → 24 (Production, 13/09/2026)

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

### 8.2. Nang cap Next.js 14 → 16 + React 18 → 19 (Production, 13/09/2026)

```text
Ten thay doi: Next.js 14.2.35 → 16.3.5, React 18 → 19.3 (codemod async request API, middleware.ts → proxy.ts, ESLint 9)
Ma commit/release: 692efe2, 9d5d2ae, 3861d33
                   (cac dot sau cung dot: 0c034f4, a8becf8, 18fadfc … a5e3228, 2357768)
Anh huong database: Khong (khong doi schema)
Cach trien khai: build san o /var/www/dh1-app-next16, doi thu muc 2026-09-13 09:54 UTC, gian doan ~1 giay

Ke hoach rollback — chon theo muc do:
1. Loi o ban deploy gan nhat (van la Next 16):
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

### 8.3. Vi du cu: Tang cuong kiem soat reset mat khau va audit dang nhap

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
