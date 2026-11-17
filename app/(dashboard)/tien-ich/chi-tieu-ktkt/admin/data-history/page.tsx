import { AppShell } from "@/modules/ctktkt/components/app-shell";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/modules/ctktkt/lib/auth/server";
import { vietnamDateIso } from "@/modules/ctktkt/lib/operating-date";

export const dynamic = "force-dynamic";

export default async function DataHistoryPage({ searchParams }: { searchParams: Promise<{ date?: string; page?: string }> }) {
  const guard = await requirePermission("view_data_history");
  if (!guard.ok) redirect("/tien-ich/chi-tieu-ktkt");
  const params = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date || "") ? params.date! : vietnamDateIso();
  const requestedPage = Number(params.page || 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1;
  let rows: Record<string, unknown>[] = [];
  let failed = false;
  try {
    // 200 thay đổi/trang (lấy 201 để biết còn trang sau), mới nhất trước.
    rows = await prisma.ctktktDailyInputAudit.findMany({ where: { operating_date: date }, orderBy: { id: "desc" }, take: 201, skip: (page - 1) * 200 });
  } catch { failed = true; }
  const display = (value: unknown) => value === null ? "∅" : String(value || "");
  const time = (value: unknown) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "medium" }).format(new Date(String(value).replace(" ", "T") + "Z"));
  return <AppShell active="data-history"><main className="min-w-0 space-y-3">
    {/* Một hàng: tiêu đề + phân trang bên trái, ô tra cứu ngày bên phải (xuống dòng trên điện thoại). */}
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Nhật ký thay đổi dữ liệu</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
          <span>Trang {page} · tối đa 200 thay đổi/trang</span>
          {!failed && page > 1 && <Link className="font-semibold text-blue-700 hover:underline" href={`?date=${date}&page=${page - 1}`}>← Trang trước</Link>}
          {!failed && rows.length > 200 && <Link className="font-semibold text-blue-700 hover:underline" href={`?date=${date}&page=${page + 1}`}>Trang sau →</Link>}
        </p>
      </div>
      <form className="flex items-end gap-2">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">Ngày dữ liệu
          <input name="date" type="date" defaultValue={date} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-base sm:text-sm" />
        </label>
        <button className="min-h-10 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800">Tra cứu</button>
      </form>
    </div>
    {failed ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Không tải được nhật ký. Hãy thử lại.</p> :
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100"><tr>{["Thời điểm", "Tài khoản", "Họ tên", "Nguồn lưu", "Ô", "Thao tác", "Giá trị trước", "Giá trị sau", "Ghi chú trước", "Ghi chú sau"].map(label => <th key={label} className="whitespace-nowrap border-b border-r border-slate-200 bg-slate-100 p-3 text-left font-semibold text-slate-800">{label}</th>)}</tr></thead>
          <tbody>{rows.slice(0, 200).map(row => <tr key={String(row.id)} className="hover:bg-blue-50/50">{[time(row.changed_at), row.actor_username, row.actor_name, row.source, row.field_code, ({ insert: "Thêm", update: "Sửa", delete: "Xóa" } as Record<string, string>)[String(row.action)], display(row.old_value), display(row.new_value), display(row.old_note), display(row.new_note)].map((value, index) => <td key={index} className="border-b border-r border-slate-100 px-3 py-2 align-top whitespace-pre-wrap">{String(value ?? "")}</td>)}</tr>)}</tbody>
        </table>
        {!rows.length && <p className="p-4 text-sm text-slate-600">Chưa có nhật ký cho ngày này.</p>}
      </div>}
  </main></AppShell>;
}
