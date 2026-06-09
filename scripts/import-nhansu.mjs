// One-off import of the DH1 staff roster (NhansuDH1.xlsx → scripts/nhansu.json).
// - Existing users (matched by normalized name) keep their login email + role,
//   but get their real Mã NV (employeeId) and Chức Danh (position) from the file.
// - Everyone else is created as a VIEWER with email derived from the Mã NV and
//   the default password `password123`.
// - Rows without a name were already dropped when building nhansu.json.
// Safe to re-run: it upserts and never duplicates.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

/** Collapse whitespace + lowercase for name matching (diacritics preserved). */
function normName(s) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** ASCII-safe email local part from an employee id, e.g. "NĐDH0156" → "nddh0156". */
function emailFromEmp(emp) {
  const ascii = emp
    .replace(/Đ/g, "D")
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return `${ascii.toLowerCase().replace(/[^a-z0-9]/g, "")}@powerplant.vn`;
}

async function main() {
  const records = JSON.parse(readFileSync(join(__dirname, "nhansu.json"), "utf-8"));
  const pw = await bcrypt.hash("password123", 10);

  const existing = await prisma.user.findMany();
  const byName = new Map(existing.map((u) => [normName(u.name), u]));
  const empToId = new Map(existing.map((u) => [u.employeeId, u.id]));

  let created = 0,
    updated = 0,
    skipped = 0;

  for (const r of records) {
    const name = r.name.replace(/\s+/g, " ").trim();
    const position = r.position?.replace(/\s+/g, " ").trim() || null;
    const employeeId = r.employeeId.trim();
    const match = byName.get(normName(name));

    if (match) {
      // Update real Mã NV + chức danh; keep login email + role + avatar.
      // Only move employeeId if it isn't already owned by a *different* user.
      const empOwner = empToId.get(employeeId);
      const data = { position };
      if (!empOwner || empOwner === match.id) data.employeeId = employeeId;
      await prisma.user.update({ where: { id: match.id }, data });
      updated++;
      continue;
    }

    // New staff member → VIEWER with derived email.
    const email = emailFromEmp(employeeId);
    if (empToId.has(employeeId) || existing.some((u) => u.email === email)) {
      skipped++;
      continue;
    }
    const u = await prisma.user.create({
      data: {
        name,
        employeeId,
        email,
        passwordHash: pw,
        role: Role.VIEWER,
        position,
        department: "Vận hành 1",
      },
    });
    empToId.set(employeeId, u.id);
    existing.push(u);
    created++;
  }

  const total = await prisma.user.count();
  console.log(`Created: ${created}  Updated: ${updated}  Skipped: ${skipped}`);
  console.log(`Total users now: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
