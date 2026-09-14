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
| Database   | PostgreSQL + Prisma ORM 5                             |
| Auth       | Auth.js / NextAuth v5 (credentials + passkey, JWT)    |
| Styling    | Tailwind CSS + shadcn/ui                              |
| State      | TanStack Query (server state)                         |
| Charts     | Recharts                                              |
| QR         | qrcode.react                                          |
| Font       | Be Vietnam Pro (next/font/google)                     |
| Lint       | ESLint 9 flat config + eslint-config-next 16          |

Upgraded on 2026-09-13 from Node 20 / Next.js 14 / React 18 — change records, rollback steps and
test evidence: `docs/ATTT_RELEASE_NANG_CAP_2026-09.md`.

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
`docs/huong-dan-deploy-production.md`. Change control and rollback plans: `docs/ATTT_*.md`.

## Upgrade / regression verification

`scripts/verify/` holds the tools used for the Node 24 / Next 16 / React 19 upgrade: a 55-page crawl
compared before/after, a hydration-mismatch check, and image-optimizer checks. They only run against
a local build and the local dev database (they refuse production). See `scripts/verify/README.md`.

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
docs/        Deploy guide, ATTT (information security) controls, module specs
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
