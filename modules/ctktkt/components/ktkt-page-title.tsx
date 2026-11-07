"use client";
import { usePathname } from "next/navigation";
export function KtktPageTitle() {
  const isPpa = (usePathname() ?? "").includes("/ppa-heat-rate");
  return <><h1 className="text-xl font-bold uppercase tracking-tight text-slate-900 sm:text-2xl">{isPpa ? "Suất hao nhiệt thực tế & PPA" : "Dữ liệu vận hành · Duyên Hải 1"}</h1>
    {!isPpa && <p className="mt-1 text-sm text-slate-500">Quản lý số liệu hằng ngày, theo dõi chỉ tiêu và đối chiếu kết quả trong tháng.</p>}</>;
}
