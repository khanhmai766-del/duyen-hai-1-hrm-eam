import { Manrope, DM_Mono } from "next/font/google";
import { VcAppRoot } from "@/components/vibration/vc-app-root";
import "./vibracontrol.css";

// Be Vietnam Pro đã nạp ở app/layout.tsx (--font-sans). Hai font còn lại web độ rung cũ dùng cho số liệu/tiêu đề.
const manrope = Manrope({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700", "800"], variable: "--vc-font-manrope", display: "swap" });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--vc-font-mono", display: "swap" });

export default function VibrationLayout({ children }: { children: React.ReactNode }) {
  return <VcAppRoot className={`${manrope.variable} ${dmMono.variable}`}>{children}</VcAppRoot>;
}
