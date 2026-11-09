import { isCtktktSameOrigin } from "@/modules/ctktkt/lib/request-origin";
import { canEditDailyInput } from "@/modules/ctktkt/lib/auth/daily-input-permissions";
import { writeDailyInputs } from "@/modules/ctktkt/lib/daily-input-store";
import { prisma } from "@/lib/prisma";
import { ktktUtcNow, ktktWrite } from "@/modules/ctktkt/db/prisma";
import { operationalWriteKeysFor } from "@/modules/ctktkt/lib/operational-query-policy";
import { ok, fail } from "@/lib/api";
import { CTKTKT_LINKED_DAILY_CODES } from "@/modules/ctktkt/lib/daily-source-links";
import { requireAnyPermission, requireSession } from "@/modules/ctktkt/lib/auth/server";
import { canEditOperatingDate, vietnamDateIso } from "@/modules/ctktkt/lib/operating-date";
import { isAdminUser } from "@/modules/ctktkt/lib/auth/session";
import { reportQueryRange } from "@/modules/ctktkt/lib/report-read-range";

const allowedCodes = new Set(["B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","AA","AE","AF","AG","AH","AJ","AK","AR","AT","CJ","CX","BN","BO","BP","BQ","BR","BS","BT","BU","BV","BW","BX","BY","CN","BZ","CA","CC","CD","CE","CF","CM","CQ","CR","CS","CT","CU","CV","CW","DA","DB","DC","DD","DE","DF","DG","DH","GRID_RECEIVE_S1","GRID_RECEIVE_S2","BCSX_COAL_STOCK_24H"]);
const periodPattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/;
const datePattern = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const unavailable = () => fail("Chưa truy cập được kho dữ liệu. Nội dung trên màn hình vẫn được giữ để bạn thử lưu lại.", 503);

export async function GET(request: Request) {
  const session = await requireSession(); if (!session.ok) return session.response;
  const params = new URL(request.url).searchParams;
  const range = reportQueryRange(params);
  const scope=params.get("scope");
  if (!range||(scope!==null&&scope!=="non-ktkt")) return fail("Khoảng đọc dữ liệu không hợp lệ.", 400);
  try {
    // Không trả ngày tương lai; scope=non-ktkt bỏ các ô "KTKT:…" (đã có ở Chỉ tiêu KTKT).
    const rows = await prisma.ctktktDailyInputs.findMany({
      where: { operating_date: { gte: range.from, lt: range.next, lte: vietnamDateIso() }, ...(scope === "non-ktkt" ? { NOT: { field_code: { startsWith: "KTKT:" } } } : {}) },
      orderBy: [{ operating_date: "asc" }, { field_code: "asc" }],
      select: { operating_date: true, field_code: true, value: true, note: true },
    });
    return ok({ entries: rows.map(r => ({ operatingDate: r.operating_date, fieldCode: r.field_code, value: r.value, note: r.note })) });
  }
  catch { return unavailable(); }
}

export async function POST(request: Request) {
  const guard = await requireAnyPermission("edit_daily_inputs", "edit_pmis"); if (!guard.ok) return guard.response;
  if (!isCtktktSameOrigin(request)) return fail("Nguồn yêu cầu không hợp lệ.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return fail("Yêu cầu phải là JSON.", 415);
  try { const raw = await request.text(); if (raw.length > 250_000) return fail("Dữ liệu gửi lên quá lớn.", 413);
    const body = JSON.parse(raw) as { period?: unknown; entries?: unknown }; if (typeof body.period !== "string" || !periodPattern.test(body.period) || !Array.isArray(body.entries) || body.entries.length > 1100) throw new Error("Dữ liệu tháng không hợp lệ.");
    const clean = body.entries.map(item => { if (!item || typeof item !== "object") throw new Error("Một ô dữ liệu không hợp lệ."); const e=item as Record<string,unknown>, operatingDate=String(e.operatingDate||""), fieldCode=String(e.fieldCode||""), value=String(e.value??"").trim(), note=String(e.note??"").trim();
      if (!datePattern.test(operatingDate) || !operatingDate.startsWith(`${body.period}-`) || !allowedCodes.has(fieldCode)) throw new Error("Ngày hoặc mã chỉ tiêu không hợp lệ."); if(operatingDate>vietnamDateIso()) throw new Error("Không thể nhập hoặc đồng bộ dữ liệu cho ngày trong tương lai."); if (CTKTKT_LINKED_DAILY_CODES.has(fieldCode)) throw new Error(`Chỉ tiêu ${fieldCode} tự liên kết từ Chỉ tiêu KTKT, không được nhập hoặc đồng bộ lần hai.`); if (value.length>100 || note.length>500) throw new Error("Giá trị hoặc ghi chú quá dài."); const isNumeric=/^-?\d+(?:[.,]\d+)?$/.test(value), isNoAdjustment=fieldCode==="CX"&&value.toLocaleLowerCase("vi")==="không chỉnh"; if(fieldCode!=="CW"&&value!==""&&!isNumeric&&!isNoAdjustment) throw new Error(`Giá trị ${fieldCode} phải là số hoặc trạng thái được hỗ trợ.`); return {operatingDate,fieldCode,value:value.replace(",","."),note}; });
    if (clean.some(entry => !canEditDailyInput(guard.user, entry.fieldCode))) return fail("Tài khoản không có quyền nhập một hoặc nhiều chỉ tiêu được gửi lên.", 403);
    if (clean.some(entry => !canEditOperatingDate(entry.operatingDate, isAdminUser(guard.user)))) return fail("Chỉ tài khoản admin/quản trị được chỉnh sửa dữ liệu trước ngày D-1.", 403);
    // Giá trị và ghi chú đều rỗng = xoá ô; còn lại thêm/sửa (ghi đè ghi chú). Nhật ký sửa + phiên bản đọc cùng giao dịch.
    if (clean.length) {
      const user = guard.user, updatedAt = ktktUtcNow();
      await ktktWrite([...new Set(clean.flatMap(e => operationalWriteKeysFor("daily_inputs", [e.operatingDate])))], tx => writeDailyInputs(tx, user, "daily-inputs",
        clean.map(e => e.value === "" && e.note === "" ? { kind: "delete" as const, operatingDate: e.operatingDate, fieldCode: e.fieldCode } : { kind: "upsert" as const, ...e }), updatedAt));
    }
    return ok({saved:clean.length});
  } catch(error) { return fail(error instanceof SyntaxError?"Dữ liệu JSON không hợp lệ.":error instanceof Error?error.message:"Dữ liệu không hợp lệ.",400); }
}
