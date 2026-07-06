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
| Chay `npx tsc --noEmit` | OK / NOK / N/A | |
| Chay `npm run build` | OK / NOK / N/A | |
| Chay `npm audit --omit=dev` | OK / NOK / N/A | |
| Khong commit `.env`, secret, API key | OK / NOK / N/A | |
| Khong commit file export du lieu nguoi dung | OK / NOK / N/A | |
| Thay doi co audit log neu la mutation quan trong | OK / NOK / N/A | |
| Thay doi upload/import co gioi han file | OK / NOK / N/A | |
| Co kiem tra RBAC server-side | OK / NOK / N/A | |

## 3. Neu co thay doi database

| Muc kiem tra | Trang thai | Ghi chu |
| --- | --- | --- |
| Da review `prisma/schema.prisma` hoac SQL | OK / NOK / N/A | |
| Co file SQL tien/rollback neu can | OK / NOK / N/A | |
| Da backup truoc khi chay tren Production | OK / NOK / N/A | |
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
| Log server khong co loi moi | OK / NOK | |

## 5. Ket luan

```text
Ket qua trien khai: Thanh cong / Rollback / Theo doi them
Nguoi xac nhan:
Thoi gian xac nhan:
Ghi chu:
```
