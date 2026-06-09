import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Be Vietnam Pro is purpose-built for Vietnamese — even diacritics & clean rhythm.
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Duyen Hai 1 Power Plant - HRM & Equipment Asset Management",
  description: "Hệ thống quản lý nhân sự ca kíp & tài sản thiết bị nhà máy nhiệt điện",
  icons: {
    icon: "/brand/4.png",
    shortcut: "/brand/4.png",
    apple: "/brand/4.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={beVietnamPro.variable} suppressHydrationWarning>
      <head>
        {/* Apply the saved (or system) theme before first paint to avoid a flash
            of the wrong theme. `theme-ready` enables color transitions only
            after the initial paint so the first load doesn't animate. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var e=document.documentElement;if(d)e.classList.add('dark');requestAnimationFrame(function(){e.classList.add('theme-ready');});}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
