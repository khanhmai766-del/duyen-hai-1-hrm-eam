import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, "../qlvt-sync");
const outputRoot = path.resolve(here, "../dist");
const stageRoot = path.join(outputRoot, "qlvt-sync-store");
const manifest = JSON.parse(await readFile(path.join(extensionRoot, "manifest.json"), "utf8"));

manifest.host_permissions = manifest.host_permissions.filter((host) => !host.includes("localhost"));
for (const script of manifest.content_scripts ?? []) {
  script.matches = script.matches.filter((host) => !host.includes("localhost"));
}

await rm(stageRoot, { recursive: true, force: true });
await mkdir(path.join(stageRoot, "icons"), { recursive: true });
for (const file of ["background.js", "bridge-app.js", "bridge-qlvt.js"]) {
  await cp(path.join(extensionRoot, file), path.join(stageRoot, file));
}
for (const size of [16, 32, 48, 128]) {
  await cp(path.join(extensionRoot, `icons/icon-${size}.png`), path.join(stageRoot, `icons/icon-${size}.png`));
}
await writeFile(path.join(stageRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const zipPath = path.join(outputRoot, `qlvt-sync-store-v${manifest.version}.zip`);
await rm(zipPath, { force: true });
execFileSync("zip", ["-qr", zipPath, "."], { cwd: stageRoot });
console.log(zipPath);
