# Ho so release: nang cap Node 24 / Next.js 16 / React 19 (13–14/09/2026)

Ho so dien theo mau `docs/ATTT_RELEASE_CHECKLIST.md` cho tung bac cua dot nang cap. Ke hoach rollback chi tiet:
`docs/ATTT_ROLLBACK_PLAN.md` muc 8. Bang chung dependency: `docs/ATTT_DEPENDENCY_CHECK.md` muc 3 va `reports/`.

Thong tin chung cho ca dot:

```text
He thong: PowerPlant EAM — https://duyenhai1.vn
Server app: /var/www/dh1-app (pm2 dh1-app, fork 1 instance); DB PostgreSQL rieng (may .81)
Nguoi thuc hien: Quan tri he thong (chu du an) + Claude Code (tro ly lap trinh)
Nguoi phe duyet: Chu du an — duyet tung bac truoc khi len Production
Nhanh Git: main (moi thay doi lam tren nhanh rieng roi fast-forward)
Gio ghi trong ho so: UTC (gio Viet Nam = UTC+7)
```

Lo trinh 3 bac:

| Bac | Noi dung | Commit chinh | Len Production |
| --- | --- | --- | --- |
| 1 | Node.js 20 → 24 | `638b7e9`, `1a8219a` | 13/09 04:27 |
| 2a | Next.js 14.2.16 → 14.2.35, chan `/_next/image` | `d98e7ef` | 13/09 |
| 2b | next-auth beta.25 → beta.32, sua kiem tra token tren https | `af22d1f`, `9792143` | 13/09 |
| 3 | Next.js 14.2.35 → 16.3.5, React 18 → 19.3 | `692efe2`, `9d5d2ae`, `3861d33` | 13/09 09:54 |
| — | Cai tien deploy: build thu muc rieng, giu 3 ban rollback | `0274e87` | 13/09 |
| — | Cac dot tiep theo (va lo hong, ESLint, bat lai toi uu anh) | xem muc 5 | 13–14/09 |

---

## 1. Bac 1 — Node.js 20 → 24

### 1.1. Thong tin chung

```text
Ten thay doi: Nang runtime Production tu Node.js 20.20.2 len 24.21.0 (npm 11.19.0)
Ma commit/release: 638b7e9 (engines ">=24 <25", .nvmrc = 24, ecosystem.config.js dung cau hinh pm2 that)
                   1a8219a (sao luu DB khi deploy bang vai tro dh1_backup — sua loi pg_dump o bang TCMS)
Moi truong trien khai: Production
Thoi gian trien khai: 2026-09-13 04:27 UTC
Cach trien khai: /root/node-upgrade-20260913/cutover.sh — cai Node 24 tu NodeSource (setup_24.x), dung lai pm2 daemon (pm2 update)
```

### 1.2. Kiem tra bat buoc

| Muc kiem tra | Trang thai | Ghi chu |
| --- | --- | --- |
| Code da duoc commit len Git | OK | `638b7e9`, `1a8219a` |
| Co ke hoach rollback | OK | `/root/node-upgrade-20260913/rollback.sh` + thu muc `/var/www/dh1-app-node20` giu nguyen node_modules/.next + goi `nodejs_20.20.2` tai san |
| Chay `npx tsc --noEmit` | OK | |
| Chay `npm run build` | OK | Build/chay thu song song truoc khi chuyen |
| Chay `npm audit --omit=dev` | OK | Chua sach o thoi diem nay (con lo hong cua next/xlsx — xu ly o bac 2, 3) |
| Khong commit `.env`, secret, API key | OK | |
| Khong commit file export du lieu nguoi dung | OK | |
| Thay doi co audit log neu la mutation quan trong | N/A | Khong doi nghiep vu |
| Thay doi upload/import co gioi han file | N/A | |
| Co kiem tra RBAC server-side | N/A | Khong doi RBAC |

### 1.3. Neu co thay doi database

| Muc kiem tra | Trang thai | Ghi chu |
| --- | --- | --- |
| Thay doi schema | N/A | Khong doi schema |
| Da backup truoc khi chay tren Production | OK | Tu `1a8219a`, moi lan deploy sao luu bang `dh1_backup` (BYPASSRLS, chi doc) |

### 1.4. Kiem tra sau trien khai

| Chuc nang | Ket qua | Ghi chu |
| --- | --- | --- |
| Phien ban runtime | OK | `node -v` = v24.21.0; `pm2 describe dh1-app` → node.js version 24.21.0 |
| Dang nhap/dang xuat | OK | |
| Trang Dashboard va cac trang chinh | OK | |
| Log server khong co loi moi | OK | Khong co 5xx sau khi chuyen; loi `reading 'bind'` trong log la ton dong tu thoi Node 20 |

### 1.5. Ket luan

```text
Ket qua trien khai: Thanh cong
Ghi chu: Ban lui Node 20 (/var/www/dh1-app-node20, /opt/node24*, rollback.sh) giu den khi xac nhan on dinh;
         du kien kiem tra suc khoe va xoa sau 2026-09-15 (co phe duyet).
```

---

## 2. Bac 2a — Next.js 14.2.35 va chan `/_next/image`

### 2.1. Thong tin chung

```text
Ten thay doi: Nang Next.js 14.2.16 → 14.2.35 (ban va cuoi cua nhanh 14); tat Image Optimization API
Ma commit/release: d98e7ef
Moi truong trien khai: Production
Thoi gian trien khai: 2026-09-13
Ly do: next 14 co lo hong Critical (RCE trong Image Optimization API, chi va tu 15.5.24); app chi dung next/image cho logo
Bien phap: next.config.mjs images.unoptimized = true (bo remotePatterns "**"); nginx them location ^~ /_next/image { return 404; }
Sao luu cau hinh nginx: /root/nginx-duyenhai1.vn.bak-20260913-truoc-chan-next-image
```

### 2.2. Kiem tra bat buoc

| Muc kiem tra | Trang thai | Ghi chu |
| --- | --- | --- |
| Code da duoc commit len Git | OK | `d98e7ef` |
| Co ke hoach rollback | OK | `git revert d98e7ef` + deploy; khoi phuc nginx tu ban sao luu |
| Chay `npx tsc --noEmit` / `npm run build` | OK | |
| Chay `npm audit --omit=dev` | OK | Giam lo hong; `next` 14 van con advisory → xu ly o bac 3 |
| Khong commit secret / file export | OK | |
| Co kiem tra RBAC server-side | N/A | |

### 2.3. Kiem tra sau trien khai

| Chuc nang | Ket qua | Ghi chu |
| --- | --- | --- |
| `/_next/image` bi chan (404) ca qua app va nginx | OK | |
| Logo topbar, dang nhap, trang chinh | OK | Anh hien thi ban goc |
| Log server khong co loi moi | OK | |

### 2.4. Ket luan

```text
Ket qua trien khai: Thanh cong
Cap nhat 2026-09-14: sau khi len Next 16.3.5, bat lai toi uu anh co khoa chat (commit 2357768) va go khoi chan nginx
(sao luu: /root/nginx-duyenhai1.vn-truoc-bat-anh-20260914-031527.bak) — xem muc 5.
```

---

## 3. Bac 2b — next-auth beta.32 va sua kiem tra token tren https

### 3.1. Thong tin chung

```text
Ten thay doi: next-auth 5.0.0-beta.25 → 5.0.0-beta.32 (@auth/core 0.41.3, jose 5 → 6);
              sua middleware doc token tren https de chan tai khoan DEFECT_READ_ONLY co hieu luc
Ma commit/release: af22d1f (next-auth), 9792143 (middleware: getToken truyen secureCookie theo cookie __Secure-authjs.session-token)
Moi truong trien khai: Production
Thoi gian trien khai: 2026-09-13
```

### 3.2. Kiem tra bat buoc

| Muc kiem tra | Trang thai | Ghi chu |
| --- | --- | --- |
| Code da duoc commit len Git | OK | `af22d1f`, `9792143` |
| Co ke hoach rollback | OK | `git revert` + deploy; token phien tuong thich hai chieu nen lui khong dang xuat nguoi dung |
| Chay `npx tsc --noEmit` / `npm run build` | OK | |
| Chay `npm audit --omit=dev` | OK | Het lo hong Moderate cua next-auth |
| Tuong thich phien dang nhap | OK | Da ma hoa/giai ma cheo token giua beta.25 va beta.32 |
| Co kiem tra RBAC server-side | OK | Chan DEFECT_READ_ONLY o proxy/middleware; RBAC that van o tung route |

### 3.3. Kiem tra sau trien khai

| Chuc nang | Ket qua | Ghi chu |
| --- | --- | --- |
| Dang nhap mat khau, passkey (WebAuthn), dang xuat | OK | |
| Nguoi dung dang dang nhap khong bi dang xuat khi deploy | OK | 0 loi 401 sau reload |
| Tai khoan chi xem (DEFECT_READ_ONLY) bi gioi han dung | Theo doi | 3 tai khoan chi xem tren Production can chu du an kiem tay |
| Log server khong co loi moi | OK | |

### 3.4. Ket luan

```text
Ket qua trien khai: Thanh cong — theo doi them muc tai khoan chi xem
Ghi chu: next-auth v5 van la ban beta (chua co ban on dinh); theo doi ban phat hanh.
```

---

## 4. Bac 3 — Next.js 16.3.5 + React 19.3

### 4.1. Thong tin chung

```text
Ten thay doi: Next.js 14.2.35 → 16.3.5, React/React DOM 18 → 19.3 (Turbopack)
Ma commit/release: 692efe2 (nang cap), 9d5d2ae (tat agentRules), 3861d33 (deploy chep cache turbopack)
Nhanh Git: chore/next16-react19 → main
Moi truong trien khai: Production
Thoi gian trien khai: 2026-09-13 09:54 UTC
Cach trien khai: build san o /var/www/dh1-app-next16, doi thu muc voi /var/www/dh1-app, pm2 reload; ban Next 14 cat o /var/www/dh1-app-next14
Pham vi code: codemod async request API (params/cookies thanh Promise, 78 file), middleware.ts → proxy.ts,
              ESLint 9 flat config (bo next lint), next.config: serverExternalPackages, agentRules: false
```

### 4.2. Kiem tra bat buoc

| Muc kiem tra | Trang thai | Ghi chu |
| --- | --- | --- |
| Code da duoc commit len Git | OK | |
| Co ke hoach rollback | OK | `/root/rollback-next16.sh` (doi thu muc nguoc, vai giay) khi con ban Next 14; sau do `deploy-server.sh --rollback` / `git revert` |
| Chay `npx tsc --noEmit` | OK | `next build` bat them loi kieu cua route ma `tsc` khong thay (cookies(), handler PCCC, route TCMS) — da sua truoc khi chuyen |
| Chay `npm run lint` | OK | 0 loi; 170 canh bao cua luat React Compiler moi (xem muc 5) |
| Chay `npm run build` | OK | |
| So hanh vi truoc/sau | OK | Crawl 55 trang so voi ban Next 14 (`scripts/verify/crawl.mjs`, `compare-crawl.mjs`) |
| Chay `npm audit --omit=dev` | OK | Het lo hong cua next/postcss; con lo hong thu vien khac → `0c034f4` |
| Khong commit secret / file export | OK | |
| Co kiem tra RBAC server-side | OK | Proxy giu nguyen logic; kiem tay tai khoan quan tri va trang cong khai |

### 4.3. Neu co thay doi database

| Muc kiem tra | Trang thai | Ghi chu |
| --- | --- | --- |
| Thay doi schema | N/A | Khong doi schema — rollback chi can lui ma nguon |

### 4.4. Kiem tra sau trien khai

| Chuc nang | Ket qua | Ghi chu |
| --- | --- | --- |
| Gian doan khi chuyen | OK | ~1 giay, khong ai bi dang xuat |
| Dang nhap/dang xuat, passkey | OK | |
| Trang Dashboard va cac module chinh | OK | Crawl 55 trang |
| Dong bo n8n (lich 15 phut) | OK | Luot 10:00 UTC chay binh thuong |
| Log server khong co loi moi | OK | Loi "router state header"/"Server Action" sau deploy la cua tab cu/bot (lech phien ban) — khong hong du lieu, dang theo doi |

### 4.5. Ket luan

```text
Ket qua trien khai: Thanh cong
Ghi chu: React #418 (hydrate lech) tren trang chu tung bat duoc 1 lan, khong tai hien duoc — theo doi.
         Ban lui Next 14 (/var/www/dh1-app-next14, /root/rollback-next16.sh, symlink /var/www/dh1-app-next16)
         du kien kiem tra suc khoe va xoa sau 2026-09-15 (co phe duyet).
```

---

## 5. Cac dot tiep theo trong cung dot nang cap

Moi dot deploy bang `./scripts/deploy-server.sh` (sao luu DB → build thu muc rieng → doi thu muc → pm2 reload), kiem
truoc tren may dev (`tsc`, `lint`, `build`, crawl 55 trang so moc) va chu du an kiem tay tren localhost truoc khi deploy.
Ket qua moi lan deploy: gian doan ~1 giay, 0 loi 5xx nginx, 0 dong loi moi trong error log.

| Thoi gian (UTC) | Commit | Noi dung | Kiem tra rieng |
| --- | --- | --- | --- |
| 13/09 11:05 | `0c034f4` | Va 11 lo hong npm audit con lai → 0 (sharp, xlsx, uuid, xmldom) | So hanh vi sharp/exceljs/xlsx/DOCX voi bo thu vien cu |
| 13/09 11:34 | `a8becf8` | Sua 37 canh bao ESLint; chan tich luy dung luong server (sao luu DB, log, cache, timer dh1-disk-guard) | Chay thu that timer tren server |
| 13/09 12:10 – 17:32 | `18fadfc` … `a5e3228` | 8 dot sua 133 canh bao `react-hooks/set-state-in-effect` (ESLint 133 → 0) | Moi dot: crawl so moc + chu du an kiem tay module |
| 14/09 03:15 | `2357768` | Bat lai toi uu anh `/_next/image`: chi anh tinh noi bo `public/brand|chucvu|icons3d`, khong domain ngoai, khong SVG, WebP q75; go khoi chan nginx | `scripts/verify/image-check.mjs` tren https that: anh hop le → WebP (anh nen 2,2 MB → 136 KB), 10/10 yeu cau ngoai khoa → 400 |

Bang chung dependency sau dot nang cap (2026-09-14): `reports/npm-audit-local-omit-dev-20260914.json`,
`reports/npm-audit-local-full-20260914.json`, `reports/npm-audit-production-omit-dev-20260914.json` — tat ca 0 lo hong.

## 6. Viec con theo doi

- Kiem tra suc khoe va xoa cac ban lui (Node 20, Next 14) sau 2026-09-15 — can phe duyet.
- Chu du an kiem 3 tai khoan chi xem tren Production.
- Giam loi lech phien ban sau deploy (router state header, Server Action).
- Theo doi next-auth v5 ban on dinh; lap ke hoach nang Prisma 5.22 → 6/7; theo doi React #418.
