// Đóng gói tiện ích "Cấp số PCT NKVH" để nộp kho Microsoft Edge Add-ons (dùng được cả Chrome Web Store).
//   node chrome-extension/scripts/package-nkvh-pct.mjs
//   node chrome-extension/scripts/package-nkvh-pct.mjs --localhost
//
// Bản nộp kho bỏ mọi quyền localhost (chỉ dùng khi thử trên máy). Nén bằng jszip — không dùng
// Compress-Archive của PowerShell 5.1 vì nó ghi đường dẫn bằng "\" và kho Edge từ chối gói.
import { readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, "../nkvh-pct");
const outputRoot = path.resolve(here, "../dist");
const manifest = JSON.parse(await readFile(path.join(extensionRoot, "manifest.json"), "utf8"));
const local = process.argv.includes("--localhost");

manifest.host_permissions = manifest.host_permissions.filter((host) => local
  ? !host.includes("duyenhai1.vn")
  : !host.includes("localhost"));
if (local) manifest.name += " (localhost)";
for (const script of manifest.content_scripts ?? []) {
  script.matches = script.matches.filter((host) => local
    ? !host.includes("duyenhai1.vn")
    : !host.includes("localhost"));
}

// Danh sách tệp cố định: thêm tệp JS mới vào tiện ích thì phải thêm vào đây, kẻo gói nộp kho thiếu tệp.
const FILES = ["background.js", "content.js", "saved-events.js", "page-reader.js", "list.js", "popup.html", "popup.js", ...[16, 32, 48, 128].map((size) => `icons/icon-${size}.png`)];

const zip = new JSZip();
zip.file("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
for (const file of FILES) {
  let content = await readFile(path.join(extensionRoot, file));
  if (local && file === "background.js") {
    // Chỉ đổi mặc định trong gói thử; mã nguồn và gói nộp kho vẫn dùng máy chủ chính thức.
    const source = content.toString("utf8");
    if ((source.match(/SERVERS\.production/g) ?? []).length !== 2) {
      throw new Error("Cần kiểm tra lại máy chủ mặc định trước khi đóng gói localhost.");
    }
    content = Buffer.from(source.replaceAll("SERVERS.production", "SERVERS.local3030"));
  }
  zip.file(file, content);
}

await mkdir(outputRoot, { recursive: true });
const zipPath = path.join(outputRoot, `nkvh-pct-${local ? "localhost" : "store"}-v${manifest.version}.zip`);
await rm(zipPath, { force: true });
await writeFile(zipPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } }));
console.log(zipPath);
