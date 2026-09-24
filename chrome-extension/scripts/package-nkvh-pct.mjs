// Đóng gói tiện ích "Cấp số PCT NKVH" để nộp kho Microsoft Edge Add-ons (dùng được cả Chrome Web Store).
//   node chrome-extension/scripts/package-nkvh-pct.mjs
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

manifest.host_permissions = manifest.host_permissions.filter((host) => !host.includes("localhost"));
for (const script of manifest.content_scripts ?? []) {
  script.matches = script.matches.filter((host) => !host.includes("localhost"));
}

// Danh sách tệp cố định: thêm tệp JS mới vào tiện ích thì phải thêm vào đây, kẻo gói nộp kho thiếu tệp.
const FILES = ["background.js", "content.js", "popup.html", "popup.js", ...[16, 32, 48, 128].map((size) => `icons/icon-${size}.png`)];

const zip = new JSZip();
zip.file("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
for (const file of FILES) zip.file(file, await readFile(path.join(extensionRoot, file)));

await mkdir(outputRoot, { recursive: true });
const zipPath = path.join(outputRoot, `nkvh-pct-store-v${manifest.version}.zip`);
await rm(zipPath, { force: true });
await writeFile(zipPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } }));
console.log(zipPath);
