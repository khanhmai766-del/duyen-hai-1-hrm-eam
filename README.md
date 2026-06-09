# PowerPlant EAM — HRM & Equipment Asset Management

Hệ thống quản lý nhân sự ca kíp & tài sản thiết bị cho nhà máy nhiệt điện.
Production-grade Next.js 14 application with role-based access control, shift
management, equipment lifecycle tracking, repair history, materials inventory,
and reporting.

## Tech stack

| Layer      | Technology                                   |
| ---------- | -------------------------------------------- |
| Framework  | Next.js 14 (App Router, TypeScript strict)   |
| Database   | PostgreSQL + Prisma ORM                      |
| Auth       | NextAuth.js v5 (credentials + JWT session)   |
| Styling    | Tailwind CSS + shadcn/ui                      |
| State      | Zustand-ready + TanStack Query (server state) |
| Charts     | Recharts                                     |
| QR         | qrcode.react                                 |
| Font       | Poppins (next/font/google)                   |

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

- Node.js 18.18+ (tested on Node 20/24)
- A PostgreSQL 13+ database — **or** use the bundled zero-install DB below.

## Quick start (zero-install database)

No Docker or system PostgreSQL required. The `embedded-postgres` dev dependency
downloads a real Postgres binary and runs it on **port 5433**, with data persisted
in `./.pgdata`. `.env` is already pointed at it.

Open **two terminals**:

```bash
# Terminal 1 — start the local database (keep it running while developing)
npm run db:start

# Terminal 2 — first time only: create schema + seed, then run the app
npm install
npm run db:push
npm run db:seed
npm run dev
```

Open http://localhost:3000 → `/login`. On later sessions you only need
`npm run db:start` (terminal 1) and `npm run dev` (terminal 2).

> The embedded DB initializes with **UTF8** encoding (required for Vietnamese text).
> If you ever need to reset it, stop `db:start`, delete `.pgdata`, and re-run the
> `db:start` → `db:push` → `db:seed` sequence.

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

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `npm run dev`        | Start the dev server                 |
| `npm run db:start`   | Start the bundled local PostgreSQL   |
| `npm run build`      | Generate Prisma client + build       |
| `npm start`          | Run the production build             |
| `npm run db:push`    | Sync schema to the database          |
| `npm run db:migrate` | Create a migration                   |
| `npm run db:seed`    | Seed demo data                       |
| `npm run db:studio`  | Open Prisma Studio                   |

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
