import { AppShell } from "@/modules/ctktkt/components/app-shell";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRawDb } from "@/modules/ctktkt/db";
import { requireAdmin } from "@/modules/ctktkt/lib/auth/server";
import { vietnamDateIso } from "@/modules/ctktkt/lib/operating-date";
import { ensureDailyInputAudit } from "@/modules/ctktkt/lib/daily-input-audit";

export const dynamic = "force-dynamic";

export default async function DataHistoryPage({ searchParams }: { searchParams: Promise<{ date?: string; page?: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) redirect("/tien-ich/chi-tieu-ktkt");
  const params = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date || "") ? params.date! : vietnamDateIso();
  const requestedPage = Number(params.page || 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1;
  const db = getRawDb();
  let rows: Record<string, unknown>[] = [];
  let failed = false;
  try {
    await ensureDailyInputAudit(db);
    const result = await db.prepare("SELECT * FROM daily_input_audit WHERE operating_date = ? ORDER BY id DESC LIMIT 201 OFFSET ?").bind(date, (page - 1) * 200).all();
    rows = result.results as Record<string, unknown>[];
  } catch { failed = true; }
  const display = (value: unknown) => value === null ? "∅" : String(value || "");
  const time = (value: unknown) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "medium" }).format(new Date(String(value).replace(" ", "T") + "Z"));
  return <AppShell active="data-history"><main className="space-y-4">
    <Link href="/tien-ich/chi-tieu-ktkt" className="text-blue-700 underline">← Dữ liệu các tháng</Link>
    <h1 className="text-2xl font-bold">Nhật ký thay đổi dữ liệu</h1>
    <p className="text-sm text-slate-600">Chỉ ghi nhận thay đổi từ khi tính năng được triển khai. Dữ liệu cũ không có thông tin người nhập. Thời gian theo giờ Việt Nam.</p>
    <form className="flex items-end gap-3"><label className="grid gap-1">Ngày dữ liệu<input name="date" type="date" defaultValue={date} className="border rounded p-2" /></label><button className="bg-blue-600 text-white rounded px-4 py-2">Tra cứu</button></form>
    {failed ? <p role="alert">Không tải được nhật ký. Hãy thử lại.</p> : <>
      <div className="flex gap-4"><span>Trang {page} · tối đa 200 thay đổi/trang</span>{page > 1 && <Link className="text-blue-700 underline" href={`?date=${date}&page=${page - 1}`}>Trang trước</Link>}{rows.length > 200 && <Link className="text-blue-700 underline" href={`?date=${date}&page=${page + 1}`}>Trang sau</Link>}</div>
      <div className="overflow-auto"><table className="w-full border-collapse text-sm"><thead><tr>{["Thời điểm", "Tài khoản", "Họ tên", "Nguồn lưu", "Ô", "Thao tác", "Giá trị trước", "Giá trị sau", "Ghi chú trước", "Ghi chú sau"].map(label => <th key={label} className="border p-2 text-left bg-blue-50">{label}</th>)}</tr></thead>
      <tbody>{rows.slice(0, 200).map(row => <tr key={String(row.id)}>{[time(row.changed_at), row.actor_username, row.actor_name, row.source, row.field_code, ({ insert: "Thêm", update: "Sửa", delete: "Xóa" } as Record<string, string>)[String(row.action)], display(row.old_value), display(row.new_value), display(row.old_note), display(row.new_note)].map((value, index) => <td key={index} className="border p-2 whitespace-pre-wrap">{String(value ?? "")}</td>)}</tr>)}</tbody></table></div>
      {!rows.length && <p>Chưa có nhật ký cho ngày này.</p>}
    </>}
  </main></AppShell>;
}
