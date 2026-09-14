# PowerPlant EAM — HRM & Equipment Asset Management

Hệ thống quản lý nhân sự ca kíp & tài sản thiết bị cho nhà máy nhiệt điện.
Production-grade Next.js 16 (React 19) application with role-based access control, shift
management, equipment lifecycle tracking, repair history, materials inventory,
and reporting.

## Tech stack

| Layer      | Technology                                            |
| ---------- | ----------------------------------------------------- |
| Runtime    | Node.js 24 (`engines` `>=24 <25`, `.nvmrc`)           |
| Framework  | Next.js 16 (App Router, Turbopack, TypeScript strict) |
| UI library | React 19                                              |
| Database   | PostgreSQL + Prisma ORM 5.22 (lộ trình lên 6/7 bên dưới) |
| Auth       | Auth.js / NextAuth v5 (credentials + passkey, JWT)    |
| Styling    | Tailwind CSS + shadcn/ui                              |
| State      | TanStack Query (server state)                         |
| Charts     | Recharts                                              |
| QR         | qrcode.react                                          |
| Font       | Be Vietnam Pro (next/font/google)                     |
| Lint       | ESLint 9 flat config + eslint-config-next 16          |

Upgraded on 2026-09-13 from Node 20 / Next.js 14 / React 18 — change records, rollback steps and
test evidence: `docs/ATTT_HO_SO_RELEASE.md`.

## Features

- **Dashboard** — KPIs, repair donut, device-status bar chart, today's shift, quick actions
- **HR & Shifts** — monthly shift roster, check-in/out + handover, live shift org chart
- **Devices** — 5 view modes (Dashboard / Table / Cards / Form / Deck), status filter chips, debounced search, QR codes
- **Repair history** — filters, slide-over drawer, create/edit modal, Open→In Progress→Resolved→Closed tracker, approval flow
- **Reports** — repair frequency, MTBF, attendance, downtime by category, material consumption, CSV/print export
- **Materials** — stock levels with OK/Low/Critical badges, quick edit
- **Admin** — users + role assignment, RBAC matrix, audit log
- RBAC enforced on every API route, skeleton loaders, empty states, toasts, confirm dialogs, print styles, keyboard shortcuts (`/` search, `n` new device)

## Prerequisites

- Node.js 24 (see `.nvmrc`; production runs 24.x since 2026-09-13). Node 20/22 is not supported.
- A PostgreSQL 13+ database — **or** use the bundled zero-install DB below.

## Quick start (zero-install database)

No Docker or system PostgreSQL required. The `embedded-postgres` dev dependency
downloads a real Postgres binary and runs it on **port 5433**, with data persisted
in `./.pgdata`. `.env` is already pointed at it.

```bash
npm install
npm run db:push   # first time only: create schema
npm run db:seed   # first time only: demo data
npm run dev       # starts the embedded Postgres automatically if it is not running, then next dev
```

Open http://localhost:3000 → `/login`. `npm run db:start` still exists if you want to run only the database.

> The embedded DB initializes with **UTF8** encoding (required for Vietnamese text).
> If you ever need to reset it, stop the dev server, delete `.pgdata`, and re-run
> `db:start` → `db:push` → `db:seed`.

## Setup (your own PostgreSQL)

```bash
npm install
cp .env.example .env       # set DATABASE_URL to your server + a real AUTH_SECRET
npm run db:push
npm run db:seed
npm run dev
```

### Demo accounts (password: `password123`)

| Role        | Email                       |
| ----------- | --------------------------- |
| Admin       | admin@powerplant.vn         |
| Supervisor  | supervisor@powerplant.vn    |
| Technician  | tech@powerplant.vn          |
| Viewer      | viewer@powerplant.vn        |

## Scripts

| Command              | Description                                       |
| -------------------- | ------------------------------------------------- |
| `npm run dev`        | Start embedded Postgres (if needed) + dev server  |
| `npm run db:start`   | Start only the bundled local PostgreSQL           |
| `npm run build`      | Generate Prisma client + production build         |
| `npm start`          | Run the production build                          |
| `npm run lint`       | ESLint (`eslint .` — Next 16 removed `next lint`) |
| `npx tsc --noEmit`   | Type-check                                        |
| `npm run db:push`    | Sync schema to the database                       |
| `npm run db:migrate` | Create a migration                                |
| `npm run db:seed`    | Seed demo data                                    |
| `npm run db:studio`  | Open Prisma Studio                                |

## Deploying to production

Never run `npm run build`, `npm install` or `pm2 restart` by hand in `/var/www/dh1-app` — an in-place
build wipes the live `.next`. Deploy only with `scripts/deploy-server.sh` (DB backup → build in a
separate directory → swap → `pm2 reload`, keeps 3 builds for `--rollback`). Step-by-step guide:
`docs/huong-dan-deploy-production.md`. Change control and rollback plans: `docs/ATTT_CHINH_SACH.md`.

## Upgrade / regression verification

`scripts/verify/` holds the tools used for the Node 24 / Next 16 / React 19 upgrade: a 55-page crawl
compared before/after, a hydration-mismatch check, and image-optimizer checks. They only run against
a local build and the local dev database (they refuse production). See `scripts/verify/README.md`.

## Tài liệu

Mục lục mọi tài liệu còn dùng (gộp lại ngày 14/09/2026 — các file cũ đã gộp/xoá vẫn xem được trong lịch sử Git).

| Tài liệu | Nội dung |
| --- | --- |
| `docs/huong-dan-deploy-production.md` | Cách deploy bằng `deploy-server.sh`, xử lý sự cố, rollback, dung lượng server. Phụ lục C: dựng vai trò sao lưu `dh1_backup`. Phụ lục D: ràng buộc hạ tầng (pm2 fork, gzip, pool DB) |
| `docs/ATTT_CHINH_SACH.md` | Chính sách ATTT (CS-ATTT-KTAT-21) gộp một file: A kiểm tra dependency · B tách môi trường + yêu cầu phần mềm · C checklist trước deploy · D kế hoạch rollback · E dữ liệu test |
| `docs/ATTT_HO_SO_RELEASE.md` | Hồ sơ đã điền của đợt nâng cấp Node 24 / Next 16 / React 19 (bậc 1, 2a, 2b, 3 và các đợt sau) + kế hoạch nâng Prisma (mục 7) |
| `reports/npm-audit-*.json` | Bằng chứng `npm audit` (máy dev và production). `reports/verify/` là kết quả chạy kiểm thử, không commit |
| `scripts/verify/README.md` | Bộ kiểm thử nâng cấp: crawl so mốc, hydrate, ảnh — chỉ chạy local |
| `docs/pccc.md` | Sổ theo dõi PCCC theo kỳ tháng (module mẫu cho các sổ an toàn) |
| `docs/tbycnn.md` | Sổ thiết bị yêu cầu nghiêm ngặt về ATLĐ (giai đoạn 1) |
| `docs/work-permit-register.md` | Sổ đăng ký phiếu công tác: dữ liệu, API, Word/Excel, kết quả tối ưu tải 10/09/2026 |
| `docs/ton-kho-hoa-chat-spec.md` | Đặc tả tồn kho hoá chất |
| `docs/contract-integration.md` | Tích hợp quản lý hợp đồng TCMS (schema `tcms`, RLS) |
| `docs/n8n-defect-sync/` | Đồng bộ khiếm khuyết hai chiều qua n8n: `README.md`, `BACKUP_RESTORE.md`, `TWO_WAY_COPY_TEST.md`, các workflow JSON |
| `docs/n8n-material-sync/` | Đồng bộ vật tư/hoá chất qua n8n: `README.md`, `README-backup.md`, các workflow JSON |
| `chrome-extension/qlvt-sync/README.md` | Extension đọc QLVT/LIMS — các bẫy kỹ thuật cần biết trước khi sửa |
| `public/material-procedures/huong-dan-quan-ly-vat-tu.pdf` | Hướng dẫn quản lý vật tư, mở từ trang Quy trình thay thế |
| `CLAUDE.md` / `AGENTS.md` | Quy ước code, kiến trúc, bẫy môi trường dev cho trợ lý lập trình |

## Lộ trình nâng Prisma (chưa thực hiện)

Kế hoạch chi tiết, tiêu chí dừng và rollback: `docs/ATTT_HO_SO_RELEASE.md` mục 7. Chỉ bắt đầu sau khi dọn bản
lùi Node 20/Next 14 và có lệnh của chủ dự án.

| Bậc | Phạm vi | Rủi ro | Việc chính |
| --- | --- | --- | --- |
| P1 | 5.22 → 6.19.3 | Thấp (~nửa ngày) | Các thay đổi phá vỡ của v6 không đụng dự án; chuyển `$use` trong `lib/prisma.ts` sang `$extends`; kiểm tsc/lint/build/crawl, route SQL thô, bench vật tư |
| P2 | 6.19.3 → 7.10.x | Trung bình (1–2 ngày) | Giữ generator `prisma-client-js`; thêm `@prisma/adapter-pg` và `prisma.config.ts`; khai pool/schema tường minh vì adapter bỏ qua `connection_limit`/`pool_timeout`/`schema` trong URL; sửa lệnh `db execute --schema` ở `deploy-server.sh` và tài liệu; diễn tập trên DB UAT khôi phục từ bản sao lưu |

Không làm lúc này: Prisma 8 (đang RC), generator `prisma-client` mới.

## Thư mục lưu trữ — phân quyền và backup theo năm

Trang `/documents/archive` (gộp từ ghi chú 16/06/2026, đã cập nhật theo code 14/09/2026). Quyền mặc định lấy từ
`lib/rbac-defaults.ts`; ADMIN chỉnh lại được trên trang Phân quyền, cấu hình lưu ở bảng `RbacConfig`.

| Quyền | ADMIN | MANAGER | SUPERVISOR | TECHNICIAN | VIEWER |
| --- | :---: | :---: | :---: | :---: | :---: |
| `archive-read` — tra cứu chung | Xem | Xem | Xem | Xem | Xem |
| `archive-grid-separation` — tab Tách lưới (và BGTS tuabin ngừng) | Toàn quyền | Quản lý | Quản lý | Quản lý | Xem |
| `archive-startup-data` — tab Khởi động | Toàn quyền | Quản lý | Quản lý | Quản lý | Xem |
| `archive-boiler-calibration` — tab Hiệu chỉnh lò | Toàn quyền | Quản lý | Quản lý | Quản lý | Xem |
| `archive-oil-gun-data` — tab Vòi dầu | Toàn quyền | Quản lý | Quản lý | Quản lý | Xem |
| `archive-create-delete` — thêm/xoá hồ sơ trong danh mục | Toàn quyền | Không | Không | Không | Không |
| `archive-edit` — sửa hồ sơ đã ghi | Quản lý | Quản lý | Quản lý | Quản lý | Xem |
| `archive-backup` — thanh backup năm (khi không có quyền riêng theo tab) | Toàn quyền | Không | Không | Không | Không |

- **Tab dữ liệu:** Tách lưới (sự cố / có kế hoạch; nguyên nhân, tiến trình dạng dòng thời gian, link xử lý), Khởi động
  (sau sự cố / có kế hoạch; tiến trình dạng dòng thời gian), Hiệu chỉnh lò (nội dung, tối đa 2 ảnh biên bản, người cập
  nhật), Vòi dầu (chỉ hiện cho ADMIN hoặc chức vụ được phép). Lọc chung theo từ khoá, tổ máy S1 (xanh lá)/S2 (cam), năm
  (từ 2024). Quyền `archive-major-repair`, `archive-soot-blower-data` đã bỏ.
- **Backup:** thanh backup (chọn năm, Excel, PDF) chỉ hiện khi có quyền **Toàn quyền** ở quyền của tab đang xem (mặc
  định chỉ ADMIN). Xuất tất cả bản ghi của năm trong tab, không chỉ trang đang hiển thị. File:
  `backup-du-lieu-tach-luoi-<năm>.xlsx`, `backup-du-lieu-khoi-dong-<năm>.xlsx`, `backup-du-lieu-hieu-chinh-lo-<năm>.xlsx`,
  `backup-du-lieu-voi-dau-<năm>.xlsx`; PDF mở trang in A4 ngang.
- **Lưu giữ (quy tắc đề xuất):** hệ thống chỉ tạo file để tải về, không tự lưu trên server. Backup mỗi năm một lần sau
  khi chốt dữ liệu, giữ tối thiểu 5 năm (lâu dài với sự cố lớn, khởi động bất thường, biên bản hiệu chỉnh quan trọng),
  lưu song song Excel + PDF theo cấu trúc `Backup/<năm>/Du-lieu-tach-luoi/` … trong kho tài liệu nội bộ.
- **API `/api/rbac`:** GET cho ADMIN hoặc người có `rbac-manage` Toàn quyền / `user-manage` Quản lý trở lên; PUT cần
  `rbac-manage` Toàn quyền. Vai trò hệ thống của user đổi qua `/api/users`.

## Project structure

```
app/
  (auth)/login            Login page
  (dashboard)/            Authenticated shell (sidebar + topbar)
    page.tsx              Dashboard
    hr/                   Overview, shift-roster, check-in, org-chart
    devices/              List (5 views), [id] detail, [id]/qr
    repair-history/       All logs + [deviceId] history
    reports/  materials/  admin/(users|roles)
  api/                    Route handlers (devices, repair-history, shifts,
                          check-in, handover, users, materials, reports, audit)
components/
  ui/        shadcn primitives
  layout/    Sidebar, Topbar, AppShell
  hr/  devices/  repair/  shared/
lib/         prisma, auth, api helpers, constants, utils, fetcher
hooks/       useDevices, useRepair, useShifts, useMaterials, useUsers
prisma/      schema.prisma, seed.ts
scripts/     deploy-server.sh, server-disk-guard.sh, verify/ (upgrade checks)
proxy.ts     Session-cookie guard (Next 16 name for middleware.ts)
docs/        Deploy guide, ATTT (information security) controls, module specs — see "Tài liệu"
reports/     npm audit evidence (JSON)
types/       shared types + NextAuth augmentation
```

## RBAC matrix

| Feature                | ADMIN | SUPERVISOR | TECHNICIAN | VIEWER |
| ---------------------- | :---: | :--------: | :--------: | :----: |
| View all pages         |  ✅   |     ✅     |     ✅     |   ✅   |
| Create repair log      |  ✅   |     ✅     |     ✅     |   ❌   |
| Edit/delete repair     |  ✅   |  ✅ (own)  |  ✅ (own)  |   ❌   |
| Approve repair         |  ✅   |     ✅     |     ❌     |   ❌   |
| Approve check-in       |  ✅   |     ✅     |     ❌     |   ❌   |
| Manage users/roles     |  ✅   |     ❌     |     ❌     |   ❌   |
| Delete device          |  ✅   |     ❌     |     ❌     |   ❌   |
| Manage materials       |  ✅   |     ✅     |     ❌     |   ❌   |

## Notes

- The shift-roster grid renders a deterministic rotation pattern for visualization;
  per-cell edits are wired to a modal (persisting roster edits is a natural next step).
- Exports produce UTF-8 CSV (Excel-compatible); PDF export uses the browser print dialog.
- The QR detail page (`/devices/[id]/qr`) is print-optimized via `@media print`.
- Static images in `public/brand|chucvu|icons3d` are served through `next/image` (`/_next/image`,
  WebP) with a locked-down config in `next.config.mjs`.
