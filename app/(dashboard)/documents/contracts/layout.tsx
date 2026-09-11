import { ContractStoreProvider } from "@/lib/tcms/components/contracts/contract-store";
import { requireUser } from "@/lib/api";
import { hasPermissionLevel } from "@/lib/rbac-guard";
import { ContractNavigation } from "@/lib/tcms/components/layout/contract-navigation";
export const metadata = { title: "Quản lý hợp đồng" };
export const dynamic = "force-dynamic";
export default async function ContractLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!await hasPermissionLevel(user, "contract-access", ["read", "personal", "manage", "full"])) {
    return <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">Bạn không có quyền truy cập quản lý hợp đồng.</p>;
  }
  return <div className="min-w-0 space-y-4"><ContractStoreProvider><ContractNavigation/>{children}</ContractStoreProvider></div>;
}
