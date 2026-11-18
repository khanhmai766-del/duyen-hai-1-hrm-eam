// Sinh public/apps/chuan-the-thuc/* từ repo chuan-the-thuc (bản chạy trong trình duyệt, KHÔNG mã hóa/đăng nhập
// vì web chính đã yêu cầu đăng nhập). Dùng: node scripts/build/chuan-the-thuc.mjs [--src <đường dẫn>]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

// realpath: nếu chạy qua ổ ảo subst (P:) thì quay về đường dẫn thật để tìm thư mục cùng cấp
const repo = fs.realpathSync.native(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
const i = process.argv.indexOf("--src");
const src = path.resolve(i > 0 ? process.argv[i + 1] : path.join(repo, "../chuan-the-thuc"));
const out = path.join(repo, "public/apps/chuan-the-thuc");
const read = (p) => fs.readFileSync(path.join(src, p), "utf8");

if (!fs.existsSync(path.join(src, "node_modules"))) throw new Error(`Chưa cài thư viện: chạy npm install --ignore-scripts trong ${src}`);
const sha = execFileSync("git", ["-C", src, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();

// Gộp lib/ (docx, quy tắc, AI) cho trình duyệt — đúng như build/build-standalone.js
const bundle = await esbuild.build({
  entryPoints: [path.join(src, "build/standalone-entry.js")],
  bundle: true, format: "iife", platform: "browser", target: "es2020", minify: true, write: false, charset: "utf8",
  alias: { "@xmldom/xmldom": path.join(src, "build/xmldom-browser.js") },
  absWorkingDir: src,
});

fs.mkdirSync(out, { recursive: true });
const banner = `// Nguồn: repo chuan-the-thuc @ ${sha} — tệp sinh tự động, sửa ở repo chuan-the-thuc rồi chạy lại script\n`;
fs.writeFileSync(
  path.join(out, "app.js"),
  banner + [bundle.outputFiles[0].text, read("node_modules/docx-preview/dist/docx-preview.min.js"), read("public/app.js")].join(";\n"),
);
fs.copyFileSync(path.join(src, "public/styles.css"), path.join(out, "styles.css"));
// Lớp giao diện gọn cho bản nhúng trong web chính, nạp sau styles.css
fs.copyFileSync(path.join(repo, "scripts/build/chuan-the-thuc.embed.css"), path.join(out, "embed.css"));
fs.copyFileSync(path.join(repo, "scripts/build/chuan-the-thuc.embed.js"), path.join(out, "embed.js"));

const html = read("public/index.html")
  .replace('href="/styles.css">', 'href="styles.css">\n<link rel="stylesheet" href="embed.css">')
  .replace(/<script src="\/vendor\/[^"]*"><\/script>\s*/g, "")
  .replace('<script src="/app.js"></script>', '<script src="app.js"></script>\n<script src="embed.js"></script>')
  .replace(/<div id="gate"[\s\S]*?<\/form>\s*<\/div>\s*/, "");
if (/src="\/|href="\/|id="gate"/.test(html)) throw new Error("index.html còn tham chiếu tuyệt đối hoặc khối đăng nhập: " + (html.match(/(src|href)="\/[^"]*"|id="gate"/) ?? [])[0]);
fs.writeFileSync(path.join(out, "index.html"), html);

console.log(`Đã sinh ${path.relative(repo, out)} từ chuan-the-thuc@${sha}`);
