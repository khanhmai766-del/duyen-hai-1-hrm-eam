"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { usePermitEmployees } from "@/hooks/useWorkPermits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** Chọn nhân sự website, giữ tên tại thời điểm ghi nhận trên phiếu. */
export function PermitEmployeePicker({ value, onChange, required = false, label = "Người cho phép làm việc" }: {
  value: string; onChange: (name: string) => void; required?: boolean; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState("");
  useEffect(() => { const timer = setTimeout(() => setTerm(search), 300); return () => clearTimeout(timer); }, [search]);
  const users = usePermitEmployees(term, page, open);
  const matches = users.data?.data ?? [];
  const total = users.data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 20));
  const currentPage = page;
  return <div className="space-y-1.5 text-sm">
    <span className="font-medium">{label}{required ? " *" : ""}</span>
    <Button type="button" variant="outline" className="h-auto min-h-10 w-full justify-between gap-2 whitespace-normal text-left" onClick={() => { setSearch(""); setTerm(""); setPage(1); setOpen(true); }}>
      <span>{value || "Chọn nhân sự phân xưởng"}</span><Search size={16} className="shrink-0" />
    </Button>
    {open && <Dialog open onOpenChange={setOpen}><DialogContent className="max-w-2xl">
      <DialogTitle>Chọn {label.toLocaleLowerCase("vi-VN")}</DialogTitle>
      <DialogDescription>Chọn từ nhân sự đang hoạt động trên website. Có thể tìm không dấu theo tên, mã nhân viên, chức vụ hoặc đơn vị.</DialogDescription>
      <label className="block space-y-1 text-sm"><span>Tìm nhân sự</span><input autoFocus value={search} maxLength={200} onChange={e => { setSearch(e.target.value); setPage(1); }} onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} placeholder="Nhập tên, mã nhân viên, chức vụ hoặc đơn vị…" className="min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring" /></label>
      {users.isPending ? <p role="status">Đang tải nhân sự…</p> : users.isError ? <div role="alert" className="space-y-2 text-red-700"><p>{users.error.message}</p><Button type="button" variant="outline" onClick={() => users.refetch()}>Thử lại</Button></div> : <div className="max-h-80 space-y-2 overflow-y-auto">
        {matches.map(user => <button type="button" key={user.id} className="block w-full rounded-lg border border-border p-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { onChange(user.name); setOpen(false); }}>
          <span className="font-semibold">{user.name}</span><span className="mt-1 block text-xs text-muted-foreground">{[user.employeeId, user.position, user.department].filter(Boolean).join(" · ")}</span>
        </button>)}
        {!matches.length && <p className="py-6 text-center text-muted-foreground">Không có nhân sự phù hợp.</p>}
      </div>}
      <div className="flex items-center justify-between gap-2 text-sm"><span>{total} người · Trang {currentPage}/{pages}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={currentPage <= 1 || users.isFetching} onClick={() => setPage(currentPage - 1)}>Trước</Button><Button type="button" variant="outline" disabled={currentPage >= pages || users.isFetching} onClick={() => setPage(currentPage + 1)}>Sau</Button></div></div>
    </DialogContent></Dialog>}
  </div>;
}
