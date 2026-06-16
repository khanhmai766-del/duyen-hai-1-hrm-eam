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
        {/* Apply an explicit saved theme before first paint. Public login always
            starts in light mode; dark mode is only available after sign-in via
            the dashboard toggle. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var e=document.documentElement;var isLogin=location.pathname==='/login'||location.pathname.indexOf('/login/')===0;var d=!isLogin&&localStorage.getItem('theme')==='dark';e.classList.toggle('dark',d);requestAnimationFrame(function(){e.classList.add('theme-ready');});}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
