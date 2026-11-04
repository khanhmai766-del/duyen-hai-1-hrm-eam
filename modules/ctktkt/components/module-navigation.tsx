"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { BarChart3, CalendarRange, ClipboardList, Droplets, FileSpreadsheet, Flame, FlaskConical } from "lucide-react";
const base="/tien-ich/chi-tieu-ktkt";
const items=[
  {key:"data",href:"",label:"Dữ liệu các tháng",icon:CalendarRange},
  {key:"ctktkt",href:"/ctktkt-report",label:"Chỉ tiêu KTKT",icon:FileSpreadsheet},
  {key:"bcsx",href:"/bcsx-report",label:"Báo cáo sản xuất",icon:ClipboardList},
  {key:"water",href:"/water-report",label:"Lượng nước",icon:Droplets},
  {key:"chemical-usage",href:"/chemical-usage",label:"Hóa chất",icon:FlaskConical},
  {key:"ppa",href:"/ppa-heat-rate",label:"Suất hao nhiệt PPA",icon:Flame},
  {key:"pmis",href:"/pmis-report",label:"Báo cáo PMIS",icon:BarChart3},
];
export function ModuleNavigation({active}:{active:string;admin?:boolean}) {
  const navigation=useRef<HTMLElement>(null);
  useEffect(()=>{ navigation.current?.querySelector('[aria-current="page"]')?.scrollIntoView({block:"nearest",inline:"nearest"}); },[active]);
  return <nav ref={navigation} aria-label="Các báo cáo chỉ tiêu KTKT" className="flex max-w-full gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
    {items.map(item=><Link key={item.key} href={base+item.href} aria-current={active===item.key?"page":undefined} className={`inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium ${active===item.key?"bg-blue-700 text-white":"text-slate-600 hover:bg-slate-100"}`}><item.icon className="size-4"/>{item.label}</Link>)}
  </nav>;
}
