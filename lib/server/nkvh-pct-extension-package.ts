import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const EXTENSION_ROOT = path.join(process.cwd(), "chrome-extension", "nkvh-pct");

// Danh sách cố định để gói tải từ website không vô tình kèm tệp phát triển.
// Khi thêm tệp JS mới cho tiện ích, cập nhật cả danh sách này và package-nkvh-pct.mjs.
const FILES = [
  "background.js",
  "content.js",
  "list.js",
  "popup.html",
  "popup.js",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
];

type ExtensionManifest = {
  version: string;
  host_permissions?: string[];
  content_scripts?: Array<{ matches?: string[] }>;
};

export async function buildNkvhPctExtensionPackage() {
  const manifestPath = path.join(EXTENSION_ROOT, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ExtensionManifest;

  // Gói cấp cho người dùng chính thức chỉ kết nối NKVH và duyenhai1.vn.
  manifest.host_permissions = manifest.host_permissions?.filter(host => !host.includes("localhost"));
  for (const script of manifest.content_scripts ?? []) {
    script.matches = script.matches?.filter(host => !host.includes("localhost"));
  }

  const zip = new JSZip();
  zip.file("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  for (const file of FILES) {
    zip.file(file, await readFile(path.join(EXTENSION_ROOT, file)));
  }

  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  return { bytes, version: manifest.version };
}
