"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FileSignature, ArrowUpRight, Clock3, CircleAlert } from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { useContracts } from "@/lib/tcms/components/contracts/contract-store";
import { formatRemainingDays, getContractWarning, getRemainingDays } from "@/lib/tcms/lib/contract-utils";
import type { TechnicalIssue, TechnicalIssueSummary } from "@/lib/tcms/types/technical-issue";

const base = "/documents/contracts";
export default function ContractOverview() {
  const { contracts, ready, error, canCreate } = useContracts();
  const issues = useQuery({ queryKey: ["tcms", "/api/tcms/issues"], queryFn: async () => (await apiGet<{ issues: TechnicalIssue[]; summary: TechnicalIssueSummary }>("/api/tcms/issues")).data, retry: false });
  const active = contracts.filter((c) => ["ACTIVE", "IN_PROGRESS", "TECHNICAL_COMPLETION"].includes(c.status));
  const priority = contracts.filter((c) => !["COMPLETED", "CLOSED", "CANCELLED"].includes(c.status))
    .sort((a, b) => (getRemainingDays(a) ?? Infinity) - (getRemainingDays(b) ?? Infinity));
  const attention = priority.filter((c) => ["Theo dõi", "Sắp hết hạn", "Khẩn", "Đã hết hạn"].includes(getContractWarning(c)));
  const openIssues = issues.data?.issues.filter((i) => !["RESOLVED", "CLOSED", "CANCELLED"].includes(i.status)) ?? [];
  const stats = [
    { label: "Tổng hợp đồng", value: ready && !error ? contracts.length : "—", icon: FileSignature },
    { label: "Đang thực hiện", value: ready && !error ? active.length : "—", icon: ArrowUpRight },
    { label: "Cần theo dõi", value: ready && !error ? attention.length : "—", icon: Clock3 },
    { label: "Tồn tại đang mở", value: issues.data ? issues.data.summary.open : "—", icon: CircleAlert },
  ];
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-primary">Tổng quan</h2><p className="mt-1 text-sm text-muted-foreground">Theo dõi tiến độ, thời hạn và hồ sơ trong phạm vi được phân công.</p></div>{canCreate && <Link href={`${base}/list/new`} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white">Thêm hợp đồng</Link>}</div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{stats.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-2 text-sm text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4 text-primary"/></div><p className="mt-3 text-3xl font-bold tabular-nums text-primary">{value}</p></div>)}</div>
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="flex items-center justify-between gap-3 border-b p-4"><h2 className="font-semibold">Hợp đồng cần theo dõi</h2><Link href={`${base}/list`} className="text-sm font-medium text-primary hover:underline">Xem tất cả</Link></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{["Hợp đồng / Gói thầu", "Nhà thầu", "Tiến độ", "Thời hạn", "Đánh giá"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y">{priority.slice(0, 8).map((c) => <tr key={c.id} className="hover:bg-slate-50"><td className="px-4 py-3"><Link href={`${base}/list/${c.id}`} className="font-semibold text-primary hover:underline">{c.contractNumber}</Link><p className="mt-1 max-w-sm text-xs text-muted-foreground">{c.packageName}</p></td><td className="px-4 py-3">{c.contractorName}</td><td className="px-4 py-3 tabular-nums">{c.progressPercent}%</td><td className="px-4 py-3">{formatRemainingDays(c)}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{getContractWarning(c)}</span></td></tr>)}{(!ready || priority.length === 0) && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">{!ready ? "Đang tải hợp đồng..." : error ? "Chưa tải được hợp đồng." : "Chưa có hợp đồng cần theo dõi."}</td></tr>}</tbody></table></div></section>
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="flex items-center justify-between gap-3 border-b p-4"><h2 className="font-semibold">Tồn tại cần xử lý</h2><Link href={`${base}/issues`} className="text-sm font-medium text-primary hover:underline">Xem tất cả</Link></div>{issues.error ? <p role="alert" className="p-4 text-sm text-red-700">{issues.error.message}</p> : issues.isPending ? <p className="p-8 text-center text-sm text-muted-foreground">Đang tải tồn tại...</p> : openIssues.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Chưa có tồn tại đang mở.</p> : <ul className="divide-y">{openIssues.slice(0, 5).map((i) => <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold">{i.title}</p><p className="mt-1 text-xs text-muted-foreground">{i.contractNumber} · {i.assigneeDisplayName || "Chưa phân công"}</p></div><span className="text-xs text-muted-foreground">{i.dueDate ? `Hạn: ${i.dueDate.slice(0,10).split("-").reverse().join("/")}` : "Chưa có hạn xử lý"}</span></li>)}</ul>}</section>
  </div>;
}
