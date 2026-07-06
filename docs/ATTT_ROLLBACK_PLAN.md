# Ke hoach rollback khi thay doi phan mem

Tai lieu nay dung lam bang chung kiem soat ATTT theo CS-ATTT-KTAT-21, muc A.8.25: moi thay doi phan mem phai duoc quan ly phien ban va co ke hoach khoi phuc (rollback) ro rang.

## 1. Pham vi ap dung

- Ap dung cho moi thay doi ma nguon, cau hinh, schema database, script van hanh va tai lieu trien khai cua he thong PowerPlant EAM.
- Ap dung cho cac moi truong Dev, Test/UAT va Production.
- Moi thay doi dua len Production phai co commit Git xac dinh, nguoi thuc hien, thoi diem trien khai va phuong an rollback.

## 2. Nguyen tac chung

- Khong sua truc tiep ma nguon tren may chu Production.
- Khong thao tac truc tiep du lieu Production neu chua co phe duyet va ke hoach khoi phuc.
- Uu tien rollback bang commit moi thong qua `git revert`, khong dung `git reset --hard` tren nhanh da push/chia se.
- Neu thay doi co database, rollback code truoc; chi rollback database khi co file SQL rieng va da danh gia nguy co mat du lieu.
- Truoc va sau rollback phai ghi nhan bang chung: commit, lenh da chay, ket qua kiem tra, nguoi thuc hien.

## 3. Quy trinh trien khai co kiem soat

1. Xac dinh commit se trien khai:

   ```bash
   git log -1 --oneline
   ```

2. Chay kiem tra toi thieu truoc khi trien khai:

   ```bash
   npx tsc --noEmit
   npm run build
   ```

3. Ghi nhan thong tin thay doi vao mau o muc 7 cua tai lieu nay hoac vao issue/ho so release noi bo.

4. Trien khai len moi truong dich theo quy trinh van hanh hien hanh.

5. Kiem tra sau trien khai:

   - Dang nhap/dang xuat.
   - Cac man hinh chinh lien quan den thay doi.
   - API/mutation lien quan den thay doi.
   - Audit log neu thay doi lien quan den bao mat/du lieu.

## 4. Rollback thay doi chi gom code/cau hinh

Dung khi thay doi khong lam thay doi schema database va khong can khôi phuc du lieu.

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
   npm run build
   ```

4. Dua rollback len GitHub:

   ```bash
   git push origin main
   ```

5. Trien khai lai tren server theo quy trinh van hanh hien hanh.

## 5. Rollback thay doi co database

Dung khi thay doi co lien quan den `prisma/schema.prisma`, SQL migration, cot/bang moi hoac script sua du lieu.

Nguyen tac:

- Neu co the, rollback code truoc bang `git revert`.
- Khong tu dong xoa cot/bang neu cot/bang co the dang chua du lieu moi.
- Neu bat buoc rollback database, phai co file SQL rollback rieng, duoc review truoc khi chay.
- Truoc khi chay SQL rollback tren Production phai backup database.

Mau lenh backup tham khao:

```bash
pg_dump "$DATABASE_URL" > "backup-before-rollback-$(date +%Y%m%d-%H%M%S).sql"
```

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

```bash
git fetch origin main
git checkout main
git pull origin main
npm install
npm run build
pm2 restart <ten-ung-dung>
```

Neu server khong dung PM2, thay lenh restart bang co che dang dung thuc te, vi du systemd, Docker Compose hoac pipeline CI/CD.

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

## 8. Vi du cho thay doi gan nhat

```text
Ten thay doi: Tang cuong kiem soat reset mat khau va audit dang nhap
Ma commit/release: 44e21b6
Anh huong database: Khong

Ke hoach rollback:
- Chay: git revert 44e21b6
- Chay: npx tsc --noEmit
- Chay: git push origin main
- Trien khai lai tu nhanh main tren server

Kiem tra sau rollback:
- Dang nhap bang mat khau
- Dang xuat thu cong
- Tu dong dang xuat do timeout
- Mo trang Quan tri nguoi dung
- Reset mat khau nguoi dung
```
