"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Save, Search } from "lucide-react";
import { ALWAYS_LOOKUP_MODULES, LOOKUP_MODULES, type LookupModuleId } from "@/lib/lookup-access";
import { useLookupPermissions, useSaveLookupPermissions, type LookupAccount } from "@/hooks/useLookupPermissions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const groups = [...new Set(LOOKUP_MODULES.map(module => module.group))];
export function LookupPermissionsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const query = useLookupPermissions(open);
  const accounts = query.data?.data;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-3xl gap-3 p-4 sm:p-6">
    <DialogHeader><DialogTitle className="flex items-center gap-2"><Search className="h-5 w-5" />Phân quyền tra cứu</DialogTitle><DialogDescription>Chọn các hạng mục tài khoản được đọc. Không cấp quyền thêm, sửa, xoá hoặc thực hiện nghiệp vụ.</DialogDescription></DialogHeader>
    {query.isPending ? <p role="status" className="py-8 text-center">Đang tải tài khoản tra cứu…</p> : query.isError ? <p role="alert" className="text-red-700">{query.error.message}</p> : !accounts?.length ?
      <div className="rounded-lg border border-dashed p-6 text-center"><p>Chưa có tài khoản tra cứu.</p><p className="mt-2 text-sm text-muted-foreground">Trong mục Người dùng, chọn chế độ truy cập “Tài khoản tra cứu”, rồi quay lại cấp quyền.</p><Button asChild variant="outline" className="mt-4"><Link href="/admin/users">Quản lý người dùng</Link></Button></div> : open && <LookupPermissionsEditor accounts={accounts} onClose={() => onOpenChange(false)} />}
  </DialogContent></Dialog>;
}
function LookupPermissionsEditor({ accounts, onClose }: { accounts: LookupAccount[]; onClose: () => void }) {
  const save = useSaveLookupPermissions();
  const [selectedId, setSelectedId] = useState(accounts[0].id);
  const [modules, setModules] = useState<LookupModuleId[]>(accounts[0].modules);
  const [allAccounts, setAllAccounts] = useState(false);
  function selectAccount(id: string) {
    setSelectedId(id);
    setModules(accounts.find(account => account.id === id)?.modules ?? []);
    setAllAccounts(false);
  }
  async function submit() {
    const userIds = allAccounts ? (accounts ?? []).map(user => user.id) : [selectedId];
    try {
      await save.mutateAsync({ userIds, modules });
      toast.success(`Đã lưu quyền tra cứu cho ${userIds.length} tài khoản`);
      onClose();
    } catch (error) { toast.error((error as Error).message); }
  }
  return <>
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <label className="block space-y-2"><span className="text-sm font-semibold">Tài khoản tra cứu</span>
            <Select value={selectedId} onValueChange={selectAccount} disabled={save.isPending}><SelectTrigger className="h-11 text-base sm:text-sm"><SelectValue /></SelectTrigger><SelectContent>{accounts.map(user => <SelectItem key={user.id} value={user.id}>{user.name} · {user.employeeId}{!user.isActive ? " (đã ngừng hoạt động)" : ""}</SelectItem>)}</SelectContent></Select>
          </label>
          <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4" checked={allAccounts} onChange={e => setAllAccounts(e.target.checked)} disabled={save.isPending} />Áp dụng lựa chọn này cho tất cả {accounts.length} tài khoản tra cứu</label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">Được đọc {modules.length}/{LOOKUP_MODULES.length} hạng mục</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" className="h-10" disabled={save.isPending} onClick={() => setModules(LOOKUP_MODULES.map(module => module.id))}>Chọn tất cả</Button><Button type="button" variant="outline" size="sm" className="h-10" disabled={save.isPending} onClick={() => setModules([...ALWAYS_LOOKUP_MODULES])}>Bỏ chọn tất cả</Button></div></div>
        <div className="max-h-[25vh] space-y-4 overflow-y-auto pr-1 sm:max-h-[35vh]">{groups.map(group => <fieldset key={group} className="rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">{group}</legend><div className="grid gap-1 sm:grid-cols-2">{LOOKUP_MODULES.filter(module => module.group === group).map(module => <label key={module.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-muted"><input type="checkbox" className="h-4 w-4 shrink-0" checked={ALWAYS_LOOKUP_MODULES.includes(module.id) || modules.includes(module.id)} disabled={save.isPending || ALWAYS_LOOKUP_MODULES.includes(module.id)} onChange={e => setModules(current => e.target.checked ? [...current, module.id] : current.filter(id => id !== module.id))} /><span className="min-w-0 flex-1">{module.label}</span><span className="text-xs text-muted-foreground">{ALWAYS_LOOKUP_MODULES.includes(module.id) ? "Luôn mở" : "Đọc"}</span></label>)}</div></fieldset>)}</div>
        <p className="text-xs text-muted-foreground">Tài khoản cũ mặc định giữ quyền xem khiếm khuyết. Bỏ chọn một mục để thu hồi quyền đọc. Hạng mục được cấp cho phép tra cứu toàn bộ dữ liệu; hợp đồng vẫn theo phạm vi hồ sơ được phân công.</p>
      <DialogFooter className="grid grid-cols-[auto_1fr] gap-2 sm:flex"><Button className="h-10" variant="outline" onClick={onClose} disabled={save.isPending}>Đóng</Button><Button className="h-10" onClick={() => void submit()} disabled={!selectedId || save.isPending}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Lưu quyền tra cứu</Button></DialogFooter>
  </>;
}
