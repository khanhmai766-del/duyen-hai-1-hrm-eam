import { prisma } from "@/lib/prisma";
import { ktktUtcNow, ktktWrite } from "@/modules/ctktkt/db/prisma";
import { operationalWriteKeysFor } from "@/modules/ctktkt/lib/operational-query-policy";
import { ok, fail } from "@/lib/api";
import { getSessionUser } from "@/modules/ctktkt/lib/auth/server";
import { isAdminUser } from "@/modules/ctktkt/lib/auth/session";
import { canEnterChemical, CHEMICAL_CATALOG, editableChemicalsFor, findChemical } from "@/modules/ctktkt/lib/chemical-usage/catalog";

const TABLE = "chemical_usage_logs";

const monthPattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/;
const datePattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

function isValidIsoDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function nextMonth(month: string): string {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const number = Number(monthText);
  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("Chưa đăng nhập.", 401);

  const month = new URL(request.url).searchParams.get("month") || "";
  if (!monthPattern.test(month)) {
    return fail("Tháng không hợp lệ, cần định dạng YYYY-MM.", 400);
  }

  try {
    const records = await prisma.ctktktChemicalUsageLogs.findMany({
      where: { usage_date: { gte: `${month}-01`, lt: `${nextMonth(month)}-01` }, deleted_at: null },
      orderBy: [{ usage_date: "desc" }, { id: "desc" }],
      select: {
        id: true, usage_date: true, chemical_code: true, material_code: true, chemical_name: true, unit: true, quantity: true,
        purpose: true, plant_unit: true, reference: true, entered_by_user_id: true, entered_by_name: true,
        entered_by_position: true, updated_by_user_id: true, updated_by_name: true, updated_by_position: true,
        created_at: true, updated_at: true,
      },
    });

    return ok({
      ok: true,
      month,
      records,
      catalog: CHEMICAL_CATALOG,
      editableCodes: editableChemicalsFor(user).map(item => item.code),
    });
  } catch (error) {
    console.error("Lỗi đọc theo dõi hóa chất:", error);
    return fail("Không thể đọc dữ liệu theo dõi hóa chất.", 500);
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("Chưa đăng nhập.", 401);

  try {
    const body = (await request.json()) as {
      usageDate?: unknown;
      chemicalCode?: unknown;
      quantity?: unknown;
      purpose?: unknown;
      reference?: unknown;
    };
    const usageDate = String(body.usageDate || "").trim();
    const chemicalCode = String(body.chemicalCode || "").trim();
    const quantity = Number(body.quantity);
    const purpose = String(body.purpose || "").trim().slice(0, 500);
    const reference = String(body.reference || "").trim().slice(0, 300);
    const chemical = findChemical(chemicalCode);

    if (!isValidIsoDate(usageDate)) {
      return fail("Ngày thực hiện không hợp lệ.", 400);
    }
    if (!chemical) {
      return fail("Loại hóa chất không thuộc danh mục được theo dõi.", 400);
    }
    if (!canEnterChemical(user, chemicalCode)) {
      return fail(`Cương vị ${user.position || "chưa xác định"} không được nhập ${chemical.name}.`, 403);
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) {
      return fail("Số lượng phải lớn hơn 0 và không vượt quá 10.000 tấn.", 400);
    }
    if (!purpose) {
      return fail("Vui lòng nhập nội dung công tác/lý do sử dụng.", 400);
    }
    // created_at/updated_at lấy mặc định của cột (= CURRENT_TIMESTAMP giờ UTC như SQL cũ).
    const saved = await ktktWrite(operationalWriteKeysFor(TABLE, [usageDate]), tx => tx.ctktktChemicalUsageLogs.create({
      data: {
        usage_date: usageDate,
        chemical_code: chemical.code,
        material_code: chemical.materialCode,
        chemical_name: chemical.name,
        unit: chemical.unit,
        quantity,
        purpose,
        plant_unit: "Chung",
        reference,
        entered_by_user_id: user.id,
        entered_by_name: user.displayName,
        entered_by_position: user.position || "",
      },
      select: { id: true },
    }));

    return ok({ ok: true, id: saved.id });
  } catch (error) {
    console.error("Lỗi lưu theo dõi hóa chất:", error);
    return fail("Không thể lưu dữ liệu theo dõi hóa chất.", 500);
  }
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("Chưa đăng nhập.", 401);

  try {
    const body = (await request.json()) as {
      id?: unknown; usageDate?: unknown; chemicalCode?: unknown; quantity?: unknown;
      purpose?: unknown; reference?: unknown;
    };
    const id = Number(body.id);
    const usageDate = String(body.usageDate || "").trim();
    const chemicalCode = String(body.chemicalCode || "").trim();
    const quantity = Number(body.quantity);
    const purpose = String(body.purpose || "").trim().slice(0, 500);
    const reference = String(body.reference || "").trim().slice(0, 300);
    const chemical = findChemical(chemicalCode);

    if (!Number.isInteger(id) || id <= 0) return fail("Bản ghi cần sửa không hợp lệ.", 400);
    if (!isValidIsoDate(usageDate)) return fail("Ngày thực hiện không hợp lệ.", 400);
    if (!chemical) return fail("Loại hóa chất không thuộc danh mục được theo dõi.", 400);
    if (!canEnterChemical(user, chemicalCode)) {
      return fail(`Cương vị ${user.position || "chưa xác định"} không được sửa ${chemical.name}.`, 403);
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) {
      return fail("Số lượng phải lớn hơn 0 và không vượt quá 10.000 tấn.", 400);
    }
    if (!purpose) return fail("Vui lòng nhập nội dung công tác/lý do sử dụng.", 400);

    // Như bản cũ: kiểm cả bản ghi đã xoá mềm (không lọc deleted_at).
    const existing = await prisma.ctktktChemicalUsageLogs.findUnique({ where: { id }, select: { chemical_code: true } });
    if (!existing) return fail("Không tìm thấy bản ghi cần sửa.", 404);
    if (!canEnterChemical(user, existing.chemical_code)) {
      return fail("Cương vị hiện tại không được sửa bản ghi hóa chất này.", 403);
    }

    // updateMany (không ném lỗi khi dòng vừa biến mất) — như UPDATE … WHERE id = ? cũ.
    await ktktWrite(operationalWriteKeysFor(TABLE), tx => tx.ctktktChemicalUsageLogs.updateMany({
      where: { id },
      data: {
        usage_date: usageDate, chemical_code: chemical.code, material_code: chemical.materialCode, chemical_name: chemical.name, unit: chemical.unit,
        quantity, purpose, plant_unit: "Chung", reference,
        updated_by_user_id: user.id, updated_by_name: user.displayName, updated_by_position: user.position || "", updated_at: ktktUtcNow(),
      },
    }));

    return ok({ ok: true, id });
  } catch (error) {
    console.error("Lỗi sửa theo dõi hóa chất:", error);
    return fail("Không thể sửa dữ liệu theo dõi hóa chất.", 500);
  }
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("Chưa đăng nhập.", 401);
  if (!isAdminUser(user)) return fail("Chỉ tài khoản quản trị được xóa bản ghi.", 403);

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return fail("Bản ghi cần xóa không hợp lệ.", 400);
  }

  try {
    const deleted = await ktktWrite(operationalWriteKeysFor(TABLE), tx => tx.ctktktChemicalUsageLogs.updateMany({
      where: { id, deleted_at: null },
      data: { deleted_at: ktktUtcNow(), deleted_by_user_id: user.id, deleted_by_name: user.displayName, deleted_by_position: user.position || "" },
    }));

    if (deleted.count === 0) {
      return fail("Không tìm thấy bản ghi cần xóa.", 404);
    }
    return ok({ ok: true, id });
  } catch (error) {
    console.error("Lỗi xóa theo dõi hóa chất:", error);
    return fail("Không thể xóa dữ liệu theo dõi hóa chất.", 500);
  }
}
