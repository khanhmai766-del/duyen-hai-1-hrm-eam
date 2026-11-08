import { getRawDb } from "@/modules/ctktkt/db";
import { ok, fail } from "@/lib/api";
import { getSessionUser } from "@/modules/ctktkt/lib/auth/server";
import { isAdminUser } from "@/modules/ctktkt/lib/auth/session";
import { canEnterChemical, CHEMICAL_CATALOG, editableChemicalsFor, findChemical } from "@/modules/ctktkt/lib/chemical-usage/catalog";
import { ensureChemicalUsageSchema } from "@/modules/ctktkt/lib/chemical-usage/schema";

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
    const rawDb = getRawDb();
    await ensureChemicalUsageSchema(rawDb);
    const result = await rawDb.prepare(`
      SELECT id, usage_date, chemical_code, material_code, chemical_name, unit, quantity,
             purpose, plant_unit, reference, entered_by_user_id, entered_by_name,
             entered_by_position, updated_by_user_id, updated_by_name, updated_by_position,
             created_at, updated_at
      FROM chemical_usage_logs
      WHERE usage_date >= ? AND usage_date < ? AND deleted_at IS NULL
      ORDER BY usage_date DESC, id DESC
    `).bind(`${month}-01`, `${nextMonth(month)}-01`).all();

    return ok({
      ok: true,
      month,
      records: result.results,
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
    const rawDb = getRawDb();
    await ensureChemicalUsageSchema(rawDb);
    const saved = await rawDb.prepare(`
      INSERT INTO chemical_usage_logs (
        usage_date, chemical_code, material_code, chemical_name, unit, quantity,
        purpose, plant_unit, reference, entered_by_user_id, entered_by_name,
        entered_by_position, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      usageDate,
      chemical.code,
      chemical.materialCode,
      chemical.name,
      chemical.unit,
      quantity,
      purpose,
      "Chung",
      reference,
      user.id,
      user.displayName,
      user.position || "",
    ).run();

    return ok({ ok: true, id: saved.meta.last_row_id });
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

    const rawDb = getRawDb();
    await ensureChemicalUsageSchema(rawDb);
    const existing = await rawDb.prepare("SELECT chemical_code FROM chemical_usage_logs WHERE id = ?").bind(id).first() as { chemical_code: string } | null;
    if (!existing) return fail("Không tìm thấy bản ghi cần sửa.", 404);
    if (!canEnterChemical(user, existing.chemical_code)) {
      return fail("Cương vị hiện tại không được sửa bản ghi hóa chất này.", 403);
    }

    await rawDb.prepare(`
      UPDATE chemical_usage_logs SET
        usage_date = ?, chemical_code = ?, material_code = ?, chemical_name = ?, unit = ?,
        quantity = ?, purpose = ?, plant_unit = 'Chung', reference = ?,
        updated_by_user_id = ?, updated_by_name = ?, updated_by_position = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      usageDate, chemical.code, chemical.materialCode, chemical.name, chemical.unit,
      quantity, purpose, reference, user.id, user.displayName, user.position || "", id,
    ).run();

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
    const rawDb = getRawDb();
    await ensureChemicalUsageSchema(rawDb);
    const deleted = await rawDb.prepare(`
      UPDATE chemical_usage_logs
      SET deleted_at = CURRENT_TIMESTAMP, deleted_by_user_id = ?, deleted_by_name = ?, deleted_by_position = ?
      WHERE id = ? AND deleted_at IS NULL
    `).bind(user.id, user.displayName, user.position || "", id).run();

    if (Number(deleted.meta.changes) === 0) {
      return fail("Không tìm thấy bản ghi cần xóa.", 404);
    }
    return ok({ ok: true, id });
  } catch (error) {
    console.error("Lỗi xóa theo dõi hóa chất:", error);
    return fail("Không thể xóa dữ liệu theo dõi hóa chất.", 500);
  }
}
