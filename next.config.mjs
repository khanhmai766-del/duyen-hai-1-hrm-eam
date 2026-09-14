/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 16.3 `next dev` tự chèn khối "nextjs-agent-rules" vào AGENTS.md mỗi lần chạy. AGENTS.md
  // là hướng dẫn nhóm tự viết cho Codex — không để công cụ ghi đè (và làm bẩn cây làm việc).
  agentRules: false,
  // Next 15+ đổi tên từ experimental.serverComponentsExternalPackages.
  serverExternalPackages: ["pg", "pdf-parse", "@napi-rs/canvas", "tesseract.js", "tesseract.js-core", "@tesseract.js-data/eng", "@tesseract.js-data/vie"],
  // BẬT LẠI bộ tối ưu ảnh `/_next/image` (2026-09-14). Tắt ngày 13/09 vì Next 14 còn lỗ hổng RCE
  // trong Image Optimization API (vá từ 15.5.24); nay đã chạy Next 16.3.5. Khoá chặt để không bị
  // lợi dụng làm tốn CPU/đĩa hay làm proxy tải ảnh ngoài:
  //  - CHỈ ảnh tĩnh nội bộ trong public/brand|chucvu|icons3d, không query string (localPatterns).
  //  - KHÔNG ảnh domain ngoài (remotePatterns rỗng) — ảnh Wikimedia của thẻ thời tiết vẫn dùng <img>.
  //    Tuyệt đối không thêm hostname "**". Ảnh người dùng vẫn đi qua /api/files/s3 (đã nén WebP).
  //  - Không SVG, chỉ WebP chất lượng 75, bộ kích thước rút gọn (bỏ 2048/3840), cache ổ đĩa có trần.
  images: {
    localPatterns: [
      { pathname: "/brand/**", search: "" },
      { pathname: "/chucvu/**", search: "" },
      { pathname: "/icons3d/**", search: "" },
    ],
    remotePatterns: [],
    formats: ["image/webp"],
    qualities: [75],
    deviceSizes: [640, 828, 1080, 1920],
    imageSizes: [32, 64, 96, 128, 256, 384],
    minimumCacheTTL: 7 * 24 * 60 * 60,
    maximumDiskCacheSize: 200 * 1024 * 1024,
    dangerouslyAllowSVG: false,
    contentDispositionType: "attachment",
  },
};

export default nextConfig;
