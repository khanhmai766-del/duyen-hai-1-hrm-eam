import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { audit, fail, handle, ok, requireUser } from "@/lib/api";
import { canManageMaterialCatalog, MATERIAL_CATEGORIES } from "@/lib/constants";

export const dynamic = "force-dynamic";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function cleanStock(value: unknown) {
  const next = Math.round(Number(value));
  return Number.isFinite(next) && next > 0 ? next : 0;
}

function cleanCategory(value: unknown) {
  const category = cleanString(value);
  const normalized = normalizeText(category);
  if (normalized === "hoa chat" || normalized === "vat tu tieu hao") return "Hóa Chất";
  if (normalized === "bi nghien than" || normalized === "bi nghien") return "Bi Nghiền Than";
  return MATERIAL_CATEGORIES.find((item) => normalizeText(item) === normalized) ?? MATERIAL_CATEGORIES[0];
}

type ErpMaterialRow = {
  id: string;
  code: string;
  name: string;
  unit: string;
  erpStock: number;
  category: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

async function findErpMaterialById(id: string) {
  const rows = await prisma.$queryRaw<ErpMaterialRow[]>`
    SELECT "id", "code", "name", "unit", "erpStock", "category", "note", "createdAt", "updatedAt"
    FROM "ErpMaterial"
    WHERE "id" = ${id}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function GET() {
  return handle(async () => {
    await requireUser();
    const materials = await prisma.$queryRaw<ErpMaterialRow[]>`
      SELECT "id", "code", "name", "unit", "erpStock", "category", "note", "createdAt", "updatedAt"
      FROM "ErpMaterial"
      ORDER BY "code" ASC
    `;
    return ok(materials, { total: materials.length });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!canManageMaterialCatalog(user)) {
      return fail("Chỉ Quản đốc / Phó Quản đốc / Kỹ thuật viên / Quản trị được thêm vật tư ERP", 403);
    }

    const body = await req.json();
    const code = cleanString(body.code);
    const name = cleanString(body.name);
    const unit = cleanString(body.unit);
    if (!code || !name || !unit) return fail("Thiếu thông tin bắt buộc");

    const exists = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "ErpMaterial" WHERE "code" = ${code} LIMIT 1
    `;
    if (exists.length) return fail("Mã vật tư ERP đã tồn tại");

    const id = randomUUID();
    const erpStock = cleanStock(body.erpStock);
    const category = cleanCategory(body.category);
    const note = cleanString(body.note) || null;
    const rows = await prisma.$queryRaw<ErpMaterialRow[]>`
      INSERT INTO "ErpMaterial" ("id", "code", "name", "unit", "erpStock", "category", "note", "createdAt", "updatedAt")
      VALUES (${id}, ${code}, ${name}, ${unit}, ${erpStock}, ${category}, ${note}, NOW(), NOW())
      RETURNING "id", "code", "name", "unit", "erpStock", "category", "note", "createdAt", "updatedAt"
    `;
    const material = rows[0];
    await audit(user.id, "CREATE_ERP_MATERIAL", "ErpMaterial", material.id, material.code);
    return ok(material);
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!canManageMaterialCatalog(user)) {
      return fail("Chỉ Quản đốc / Phó Quản đốc / Kỹ thuật viên / Quản trị được cập nhật vật tư ERP", 403);
    }

    const body = await req.json();
    if (!body.id) return fail("Thiếu id vật tư ERP");

    const current = await findErpMaterialById(body.id);
    if (!current) return fail("Không tìm thấy vật tư ERP", 404);

    const nextName = body.name !== undefined ? cleanString(body.name) : current.name;
    const nextUnit = body.unit !== undefined ? cleanString(body.unit) : current.unit;
    if (nextName !== undefined && !nextName) return fail("Tên vật tư không được để trống");
    if (nextUnit !== undefined && !nextUnit) return fail("ĐVT không được để trống");

    const nextStock = body.erpStock !== undefined ? cleanStock(body.erpStock) : current.erpStock;
    const nextCategory = body.category !== undefined ? cleanCategory(body.category) : current.category || MATERIAL_CATEGORIES[0];
    const nextNote = body.note !== undefined ? cleanString(body.note) || null : current.note;
    const rows = await prisma.$queryRaw<ErpMaterialRow[]>`
      UPDATE "ErpMaterial"
      SET "name" = ${nextName},
          "unit" = ${nextUnit},
          "erpStock" = ${nextStock},
          "category" = ${nextCategory},
          "note" = ${nextNote},
          "updatedAt" = NOW()
      WHERE "id" = ${body.id}
      RETURNING "id", "code", "name", "unit", "erpStock", "category", "note", "createdAt", "updatedAt"
    `;
    const material = rows[0];
    await audit(user.id, "UPDATE_ERP_MATERIAL", "ErpMaterial", material.id, material.code);
    return ok(material);
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!canManageMaterialCatalog(user)) {
      return fail("Chỉ Quản đốc / Phó Quản đốc / Kỹ thuật viên / Quản trị được xoá vật tư ERP", 403);
    }

    const single = req.nextUrl.searchParams.get("id");
    let ids: string[] = single ? [single] : [];
    if (!ids.length) {
      const body = await req.json().catch(() => ({}));
      if (Array.isArray(body?.ids)) ids = body.ids.filter((x: unknown) => typeof x === "string");
    }
    if (!ids.length) return fail("Thiếu id vật tư ERP");

    const materials = await prisma.$queryRaw<Array<{ id: string; code: string }>>`
      SELECT "id", "code" FROM "ErpMaterial" WHERE "id" = ANY(${ids})
    `;
    if (!materials.length) return fail("Không tìm thấy vật tư ERP", 404);

    const foundIds = materials.map((m) => m.id);
    const count = await prisma.$executeRaw`
      DELETE FROM "ErpMaterial" WHERE "id" = ANY(${foundIds})
    `;
    await audit(user.id, "DELETE_ERP_MATERIAL", "ErpMaterial", foundIds.join(","), materials.map((m) => m.code).join(", "));
    return ok({ ids: foundIds, count });
  });
}
