# Checklist ATTT truoc khi trien khai

Tai lieu nay dung lam mau kiem soat thay doi truoc khi dua code len moi truong Test/UAT hoac Production.

## 1. Thong tin chung

```text
Ten thay doi:
Ma commit/release:
Nhanh Git:
Nguoi thuc hien:
Nguoi review/phe duyet:
Moi truong trien khai: Dev / Test / Production
Thoi gian trien khai du kien:
```

## 2. Kiem tra bat buoc

| Muc kiem tra | Trang thai | Ghi chu |
| --- | --- | --- |
| Code da duoc commit len Git | OK / NOK / N/A | |
| Co ke hoach rollback | OK / NOK / N/A | Tham chieu `docs/ATTT_ROLLBACK_PLAN.md` |
| Moi truong dung dung phien ban (Node 24, xem `.nvmrc`) | OK / NOK / N/A | Tham chieu `docs/ATTT_ENVIRONMENT_SEPARATION.md` |
| Chay `npx tsc --noEmit` | OK / NOK / N/A | |
| Chay `npm run lint` (0 loi) | OK / NOK / N/A | ESLint 9; Next 16 da bo `next lint` |
| Chay `npm run build` (tren may dev) | OK / NOK / N/A | Khong build tai cho tren server Production |
| Chay `npm audit --omit=dev`, luu JSON vao `reports/` | OK / NOK / N/A | Tham chieu `docs/ATTT_DEPENDENCY_CHECK.md` |
| Thay doi framework/thu vien: crawl so moc truoc/sau | OK / NOK / N/A | `scripts/verify/README.md` |
| Khong commit `.env`, secret, API key | OK / NOK / N/A | |
| Khong commit file export du lieu nguoi dung | OK / NOK / N/A | |
| Thay doi co audit log neu la mutation quan trong | OK / NOK / N/A | |
| Thay doi upload/import co gioi han file | OK / NOK / N/A | |
| Co kiem tra RBAC server-side | OK / NOK / N/A | |
| Trien khai Production bang `./scripts/deploy-server.sh` | OK / NOK / N/A | `docs/huong-dan-deploy-production.md` |

## 3. Neu co thay doi database

| Muc kiem tra | Trang thai | Ghi chu |
| --- | --- | --- |
| Da review `prisma/schema.prisma` hoac SQL | OK / NOK / N/A | |
| Co file SQL tien/rollback neu can | OK / NOK / N/A | |
| Da backup truoc khi chay tren Production | OK / NOK / N/A | `deploy-server.sh` tu sao luu bang vai tro `dh1_backup` |
| Khong dung `db push --accept-data-loss` tren Production | OK / NOK / N/A | |
| Da kiem tra nguy co mat du lieu | OK / NOK / N/A | |

## 4. Kiem tra sau trien khai

| Chuc nang | Ket qua | Ghi chu |
| --- | --- | --- |
| Dang nhap/dang xuat | OK / NOK | |
| Trang Dashboard | OK / NOK | |
| Trang lien quan den thay doi | OK / NOK | |
| API lien quan den thay doi | OK / NOK | |
| Audit log | OK / NOK | |
| Log server khong co loi moi (pm2 error log, nginx 5xx) | OK / NOK | |

## 5. Ket luan

```text
Ket qua trien khai: Thanh cong / Rollback / Theo doi them
Nguoi xac nhan:
Thoi gian xac nhan:
Ghi chu:
```

## 6. Ho so da ghi

| Dot thay doi | Ho so |
| --- | --- |
| Nang cap Node 24 / Next.js 16 / React 19 (13–14/09/2026): Bac 1, Bac 2a, Bac 2b, Bac 3 va cac dot tiep theo | `docs/ATTT_RELEASE_NANG_CAP_2026-09.md` |
