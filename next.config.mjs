/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["pg", "pdf-parse", "@napi-rs/canvas", "tesseract.js", "tesseract.js-core", "@tesseract.js-data/eng", "@tesseract.js-data/vie"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
