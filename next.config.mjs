/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 16.3 `next dev` tự chèn khối "nextjs-agent-rules" vào AGENTS.md mỗi lần chạy. AGENTS.md
  // là hướng dẫn nhóm tự viết cho Codex — không để công cụ ghi đè (và làm bẩn cây làm việc).
  agentRules: false,
  // Next 15+ đổi tên từ experimental.serverComponentsExternalPackages.
  serverExternalPackages: ["pg", "pdf-parse", "@napi-rs/canvas", "tesseract.js", "tesseract.js-core", "@tesseract.js-data/eng", "@tesseract.js-data/vie"],
  // TẮT bộ tối ưu ảnh `/_next/image` (2026-09-13). Next 14 còn lỗ hổng RCE trong Image
  // Optimization API chỉ được vá từ Next 15.5.24, trong khi app chỉ dùng nó cho đúng logo
  // 28px ở topbar — ảnh người dùng đi qua /api/files/s3 (đã nén WebP bằng sharp). nginx cũng
  // chặn /_next/image. Chỉ bật lại (và KHÔNG bao giờ để hostname "**") khi đã lên Next ≥ 15.5.24.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
