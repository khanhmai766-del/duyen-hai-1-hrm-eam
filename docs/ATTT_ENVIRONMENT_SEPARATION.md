# Phan tach moi truong Dev, Test va Production

Tai lieu nay dung lam bang chung cho CS-ATTT-KTAT-21, muc A.8.31: moi truong phat trien, kiem thu va san xuat phai duoc phan tach ve ha tang va quyen truy cap.

## 1. Nguyen tac

- Dev, Test/UAT va Production phai su dung database rieng.
- Khong dung du lieu van hanh that de test neu chua duoc phe duyet va masking.
- Khong commit `.env` vao Git.
- Khong thao tac truc tiep du lieu Production neu chua co phe duyet.
- Moi thay doi Production phai di qua Git, build va quy trinh trien khai.
- Moi moi truong phai dung cung phien ban runtime (muc 2).

## 2. Yeu cau phan mem (cap nhat 2026-09-14)

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

Khong ho tro Node 20/22: cac ban lui Node 20 tren Production chi giu tam de rollback (xem `docs/ATTT_ROLLBACK_PLAN.md` muc 8.1).
Kiem tra nhanh: `node -v` (Dev), `pm2 describe dh1-app | grep "node.js version"` (Production).

## 3. Moi truong Dev

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

## 4. Moi truong Test/UAT

- Nen co database rieng voi Production.
- Du lieu test phai la du lieu demo hoac da masking.
- Chi tai khoan duoc phan cong moi co quyen truy cap.
- Ghi nhan ket qua test truoc khi trien khai Production.

Hien trang (2026-09-14): chua co moi truong UAT rieng. Thay the tam thoi:

- Kiem thu tren may Dev bang ban build Production (`next start`) + crawl 55 trang so moc (`scripts/verify/`).
- Chu du an kiem tay tren localhost truoc moi lan deploy.
- Nang cap runtime/framework duoc chay thu song song tren server Production o thu muc/cong rieng (dung chung cau hinh Production) truoc khi doi thu muc; ban cu duoc giu de lui trong vai giay.
- Rui ro con lai: chay thu song song dung database Production. Khuyen nghi dung moi truong UAT co database rieng cho cac dot nang cap sau.

## 5. Moi truong Production

- Su dung database rieng, khong dung chung voi Dev/Test.
- Secret nhu `DATABASE_URL`, `AUTH_SECRET`, S3 key phai nam trong cau hinh server/secret manager, khong nam trong Git; file `.env` tren server khong de ban sao luu trong thu muc web (da don 2026-09-14).
- Khong chay script thay doi du lieu neu chua co ke hoach rollback/backup.
- Khong dung `prisma db push --accept-data-loss` tren Production.
- Khong build/cai thu vien/khoi dong lai bang tay trong `/var/www/dh1-app`; chi trien khai bang `./scripts/deploy-server.sh`.

## 6. Kiem soat quyen truy cap

- Chi nguoi duoc phan cong moi duoc SSH/remote vao server Production.
- Tai khoan Admin trong ung dung phai duoc cap theo nhu cau cong viec.
- Khi nhan su thay doi vai tro/nghi viec, phai khoa hoac thu hoi tai khoan lien quan.
- Sao luu DB dung vai tro rieng `dh1_backup` (chi doc, chi mo tu may app).

## 7. Kiem tra bang chung

Bang chung co the gom:

- `.gitignore` co chan `.env`, `.pgdata`, file export nguoi dung, `reports/verify/`.
- File `.env.example` chi chua gia tri mau.
- `package.json` (`engines`), `.nvmrc`, `ecosystem.config.js`.
- Log Git commit/release; ho so `docs/ATTT_RELEASE_NANG_CAP_2026-09.md`.
- Bien ban test/UAT; ket qua crawl so moc.
- Log backup va deploy Production (`/root/deploy-*.log`, `/root/backup-dh1db-*.sql.gz`).

## 8. Mau ghi nhan moi truong

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
