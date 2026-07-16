// Đồng bộ skill AI giữa hai công cụ: .claude/skills (bản gốc — Claude Code đọc)
// → .agents/skills (bản sao — Codex và các agent theo chuẩn AGENTS.md đọc).
// Cách dùng: chỉ thêm/sửa skill trong .claude/skills, rồi chạy:
//   node scripts/sync-skills.mjs
// Script mirror toàn bộ: skill có ở nguồn sẽ được copy đè, skill không còn ở nguồn
// sẽ bị xóa khỏi .agents/skills để hai bên luôn giống hệt nhau.
import { cpSync, rmSync, mkdirSync, readdirSync, existsSync } from "fs";
import path from "path";

const root = process.cwd();
const SOURCE = path.join(root, ".claude", "skills");
const TARGET = path.join(root, ".agents", "skills");

if (!existsSync(SOURCE)) {
  console.error("Không tìm thấy thư mục nguồn .claude/skills — dừng lại, không xóa gì.");
  process.exit(1);
}

const sourceSkills = readdirSync(SOURCE, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

if (sourceSkills.length === 0) {
  console.error(".claude/skills đang rỗng — dừng lại để tránh xóa nhầm .agents/skills.");
  process.exit(1);
}

// Xóa skill ở đích không còn trong nguồn
if (existsSync(TARGET)) {
  for (const entry of readdirSync(TARGET, { withFileTypes: true })) {
    if (entry.isDirectory() && !sourceSkills.includes(entry.name)) {
      rmSync(path.join(TARGET, entry.name), { recursive: true, force: true });
      console.log(`− Xóa skill không còn ở nguồn: ${entry.name}`);
    }
  }
} else {
  mkdirSync(TARGET, { recursive: true });
}

// Copy đè từng skill từ nguồn sang đích
for (const name of sourceSkills) {
  cpSync(path.join(SOURCE, name), path.join(TARGET, name), { recursive: true, force: true });
  console.log(`✓ Đồng bộ skill: ${name}`);
}

console.log(`Xong — ${sourceSkills.length} skill trong .agents/skills khớp với .claude/skills.`);
