// Đóng gói riêng các tiện ích được bàn giao cùng CTKTKT; không đụng gói DH1 khác.
import JSZip from "jszip";
import { readFile, writeFile } from "node:fs/promises";
const files = {
  "qlkt-sync-extension": ["manifest.json", "background.js", "content.js", "meter-extract.js", "web-bridge.js", "popup.html", "popup.js", "popup.css", "README.md"],
  "nkvh-ppa-extension": ["manifest.json", "background.js", "web-bridge.js", "app.html", "app.js", "app.css", "page.js", "filter.js", "README.md"],
};
for (const [name, names] of Object.entries(files)) {
  const root = new URL(`../../public/ctktkt/${name}/`, import.meta.url), zip = new JSZip();
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  for (const file of names) zip.file(file, await readFile(new URL(file, root)));
  await writeFile(new URL(`../../public/ctktkt/${name}.zip`, import.meta.url), await zip.generateAsync({type:"nodebuffer",compression:"DEFLATE"}));
  console.log(`${name} v${manifest.version}: ${names.length} tệp`);
}
