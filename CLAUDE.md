# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

PowerPlant EAM — an HRM & Equipment Asset Management system for the Duyên Hải 1 thermal power plant (Vận hành 1). Next.js 14 App Router, TypeScript (strict), Prisma + PostgreSQL, NextAuth v5, Tailwind + shadcn/ui, TanStack Query. **The entire UI and all user-facing strings (including API error messages) are in Vietnamese** — match that when adding features.

## Commands

```bash
npm run dev          # Starts embedded Postgres (if not already up) AND next dev — one command, see below
npm run db:start     # Start ONLY the bundled local Postgres (port 5433), keep running
npm run db:push      # Sync prisma/schema.prisma → DB (no migrations used locally)
npm run db:seed      # Seed demo data (tsx prisma/seed.ts)
npm run db:studio    # Prisma Studio
npm run build        # prisma generate + next build
npm run lint         # next lint (eslint)
```

There is no test suite. To type-check, run `npx tsc --noEmit`.

`npm run dev` (via `scripts/dev.mjs`) auto-starts the embedded Postgres on port 5433 if nothing is listening there, then runs `next dev`. The preview harness runs `npm run dev -- -p 3030`. You usually do **not** need a separate `db:start` terminal.

## Local database (embedded Postgres)

`embedded-postgres` runs a real Postgres binary on **port 5433**, data persisted in `./.pgdata` (UTF8 — required for Vietnamese). `.env` already points `DATABASE_URL` at it. Demo logins use password `password123` (e.g. `admin@powerplant.vn`).

- **Symptom of a down DB: 500s and empty dropdowns.** Start it with `npm run db:start`.
- If Postgres logs `pre-existing shared memory block is still in use` / the port is open but Prisma reports `P1001`, a previous embedded-postgres process was killed uncleanly (e.g. the dev/preview server was stopped on Windows). Kill the stale `postgres` process, then restart.
- Reset: stop the DB, delete `.pgdata`, then `db:start` → `db:push` → `db:seed`.

## Schema changes — important gotchas

1. Edit `prisma/schema.prisma`, then `npx prisma generate`, then sync the DB.
2. **Stop the dev/preview server before `prisma generate` on Windows** — otherwise the running app locks `query_engine-windows.dll.node` and generate fails with `EPERM`.
3. `npm run db:push` syncs the *entire* schema and will try to **drop tables present in the DB but absent from `schema.prisma`** (it warns about data loss and refuses without `--accept-data-loss`). The dev DB can contain such out-of-schema tables from other branches. To add a single column safely without dropping anything, apply targeted SQL instead, e.g.:
   ```bash
   npx prisma db execute --file <file.sql> --schema prisma/schema.prisma
   # ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "newCol" TEXT;
   ```
4. Verifying through the live preview writes to the **real dev database** (there is no separate test DB) — avoid destructive form-driving tests on real records; prefer isolated API round-trips, or restore data after.

## Architecture

### API route convention (every handler under `app/api/**`)
All handlers follow the same shape using helpers in `lib/api.ts`:
- Wrap the body in `handle(async () => { ... })` — thrown `Response`s (from the helpers) become the HTTP response; anything else becomes a 500.
- `await requireUser()` to get the session user (throws 401), then `requireRole(user, ["ADMIN", ...])` for RBAC (throws 403).
- Return `ok(data, meta?)` or `fail(message, status?)`. Both emit the envelope `{ data, meta, error }`.
- Call `audit(userId, action, entity, entityId?, detail?)` for mutations; failures are non-fatal.
- Most routes set `export const dynamic = "force-dynamic"`.

### Client data flow
`lib/fetcher.ts` (`apiGet` / `apiMutate`) unwraps the envelope and throws `Error(json.error)` on failure. UI never calls `fetch` directly — it uses TanStack Query hooks in `hooks/` (e.g. `useUsers`, `useDevices`). Mutations invalidate query keys (`["users"]`, etc.) on success. Toasts via `sonner`.

### Auth & access control (two layers)
- `middleware.ts` is a lightweight edge guard: it only checks for the presence of a NextAuth session cookie and redirects to `/login`. It does **not** do role checks. Public prefixes: `/login`, `/api/auth`, `/api/webauthn`, `/videos`, `/public`.
- Real RBAC is enforced **server-side in each route/page** via `auth()` + `requireRole`. See the README RBAC matrix for the policy.
- `lib/auth.ts`: NextAuth v5, JWT session strategy. The JWT/session carries only `id, role, position, employeeId, name, email`. **`avatarUrl` is deliberately excluded from the token** — avatars are large base64 data URLs and would overflow the session cookie. Fetch avatar/signature from the DB (`/api/users` or `/api/me`) where needed.
- Two credential paths in `authorize()`: email+password (bcrypt), and a WebAuthn `biometricToken` (passwordless), validated via `lib/webauthn.ts`.

### Images & signatures
Profile photos (`User.avatarUrl`), signatures (`User.signatureUrl`), device images, defect/announcement attachments are stored **inline as base64 data URLs** in Postgres text columns (client-side downscaled before save, e.g. avatars to 256×256). There is no object storage / upload endpoint for these.

### External read-only syncs via the Chrome extension (`chrome-extension/qlvt-sync`)
Two EVN internal systems are read through a single MV3 extension: the web page posts a same-origin message → `bridge-app.js` → `background.js` finds/opens the source tab → a per-source content script reads data **inside the already-logged-in tab** and returns rows. Cookies never leave the source tab; nothing is ever written back to the source system.
- **QLVT** (`bridge-qlvt.js`) → `POST /api/vat-tu/oil-grouping/stock-import`. Easy case: QLVT exposes a JSON web service, one request returns all inventory.
- **LIMS** (`bridge-lims.js` in ISOLATED world + `bridge-lims-page.js` in MAIN world) → `POST /api/lims/oil-analysis/import`, surfaced at `/tien-ich/phan-tich-dau` (nav section **TIỆN ÍCH**). LIMS is a stateful JSF/PrimeFaces app with **no API**, so the MAIN-world bridge drives PrimeFaces widgets and scrapes the result table while the isolated bridge owns `chrome.runtime` messaging. Read `chrome-extension/qlvt-sync/README.md` before touching it — it records the non-obvious traps (only developer-named widget ids are stable, LIMS's own column filters break its paginator, `pfAjaxComplete` is the only reliable "AJAX done" signal, and `đ`→`d` folding is mandatory or the `Đơn vị`/`Đánh giá` headers never match).

When adding a JS file to the extension, also add it to the file list in `chrome-extension/scripts/package-store.mjs`, or the Web Store package ships broken.

### Self-service vs admin edits
`/api/me` (PUT) lets any logged-in user edit their own `avatarUrl / signatureUrl / phone / email / employeeId`; only ADMIN may additionally change `name / position / department / role`. `/api/users` is the ADMIN-only CRUD for all users. The account page (`app/(dashboard)/account`) uses `/api/me`; `app/(dashboard)/admin/users` uses `/api/users`.

### Domain model (`prisma/schema.prisma`)
Single source of truth; richer than the README. Core entities: `User` (role enum ADMIN/SUPERVISOR/TECHNICIAN/VIEWER) + `WebAuthnCredential`; shift/attendance (`Shift`, `ShiftAssignment`, `CheckIn`, `ShiftHandover`, `HcGroup`/`HcCheckIn` for admin attendance); equipment (`Device`, `RepairLog`, `Material`, `DeviceMaterial`, `MaterialReplacement`/`MaterialReplacementLog`); defects (`Defect`, `DefectHistory` — history is intentionally FK-free so defect tickets can be hidden/purged while history persists); content (`Announcement`/`AnnouncementRead`, `ForumPost`/`ForumReply`, `OperationEvent`); `AuditLog`. `@/*` path alias maps to the repo root.

### Periodic safety registers (PCCC, TBYCNN)
Two modules share one shape: a **period** row per month plus equipment rows scoped to it, positions normalized against `lib/position-catalog.ts` (label without unit suffix + `PositionCode` + `machine`), server-side xlsx export via exceljs, and writes blocked once the period is closed. PCCC (`pccc_*`, `docs/pccc.md`) is the mature one; TBYCNN — thiết bị yêu cầu nghiêm ngặt về ATLĐ (`tbycnn_*`, `docs/tbycnn.md`) was ported from a standalone localStorage HTML app and is at phase 1 (no period rollover yet). Copy the PCCC patterns when extending either.

### Shared conventions
- `lib/constants.ts` holds enum→label maps and ordering (`ROLES`, `REPAIR_STATUS`, `DEFECT_*`, `SHIFT_TYPE`, …) plus shift-window/date helpers — reuse these instead of hardcoding Vietnamese labels.
- `lib/nav.ts` `normalizeText()` does diacritic-insensitive, lowercase folding — used for all search/filter/position matching (e.g. excluding management positions from selects). Reuse it for any Vietnamese text comparison.
- "Position" (chức vụ) is free-text on `User.position`; dropdowns derive a deduped list from existing users (`usePositions`).
