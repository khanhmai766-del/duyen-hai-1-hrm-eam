# Phan tach moi truong Dev, Test va Production

Tai lieu nay dung lam bang chung cho CS-ATTT-KTAT-21, muc A.8.31: moi truong phat trien, kiem thu va san xuat phai duoc phan tach ve ha tang va quyen truy cap.

## 1. Nguyen tac

- Dev, Test/UAT va Production phai su dung database rieng.
- Khong dung du lieu van hanh that de test neu chua duoc phe duyet va masking.
- Khong commit `.env` vao Git.
- Khong thao tac truc tiep du lieu Production neu chua co phe duyet.
- Moi thay doi Production phai di qua Git, build va quy trinh trien khai.

## 2. Moi truong Dev

- Su dung embedded PostgreSQL tren port 5433 va thu muc `.pgdata`.
- Cho phep seed du lieu demo bang `npm run db:seed`.
- Co the reset du lieu Dev khi can, nhung khong dong bo nguoc len Production.
- `.env` Dev chi dung cho may phat trien, khong dua vao Git.

Lenh thuong dung:

```bash
npm run dev
npm run db:push
npm run db:seed
```

## 3. Moi truong Test/UAT

- Nen co database rieng voi Production.
- Du lieu test phai la du lieu demo hoac da masking.
- Chi tai khoan duoc phan cong moi co quyen truy cap.
- Ghi nhan ket qua test truoc khi trien khai Production.

## 4. Moi truong Production

- Su dung database rieng, khong dung chung voi Dev/Test.
- Secret nhu `DATABASE_URL`, `AUTH_SECRET`, S3 key phai nam trong cau hinh server/secret manager, khong nam trong Git.
- Khong chay script thay doi du lieu neu chua co ke hoach rollback/backup.
- Khong dung `prisma db push --accept-data-loss` tren Production.

## 5. Kiem soat quyen truy cap

- Chi nguoi duoc phan cong moi duoc SSH/remote vao server Production.
- Tai khoan Admin trong ung dung phai duoc cap theo nhu cau cong viec.
- Khi nhan su thay doi vai tro/nghi viec, phai khoa hoac thu hoi tai khoan lien quan.

## 6. Kiem tra bang chung

Bang chung co the gom:

- `.gitignore` co chan `.env`, `.pgdata`, file export nguoi dung.
- File `.env.example` chi chua gia tri mau.
- Log Git commit/release.
- Bien ban test/UAT.
- Log backup va deploy Production.

## 7. Mau ghi nhan moi truong

```text
Moi truong:
URL:
Database:
Nguoi quan tri:
Nguoi co quyen truy cap:
Co dung du lieu that khong:
Neu co, du lieu da masking/chua:
Ghi chu:
```
