// Đồng bộ skill/agent AI giữa hai công cụ: .claude/* (bản gốc — Claude Code đọc)
// → .agents/* (bản sao — Codex và các agent theo chuẩn AGENTS.md đọc).
// Cách dùng: chỉ thêm/sửa trong .claude/skills hoặc .claude/agents, rồi chạy:
//   node scripts/sync-skills.mjs
// Script mirror toàn bộ: mục có ở nguồn sẽ được copy đè, mục không còn ở nguồn
// sẽ bị xóa khỏi đích để hai bên luôn giống hệt nhau.
import { cpSync, rmSync, mkdirSync, readdirSync, existsSync } from "fs";
import path from "path";

const root = process.cwd();

/** Mirror một thư mục con (skills/agents) từ .claude sang .agents. */
function mirror(folder, { required }) {
  const source = path.join(root, ".claude", folder);
  const target = path.join(root, ".agents", folder);

  if (!existsSync(source)) {
    if (required) {
      console.error(`Không tìm thấy thư mục nguồn .claude/${folder} — dừng lại, không xóa gì.`);
      process.exit(1);
    }
    return; // thư mục tùy chọn (vd agents) chưa có thì bỏ qua
  }

  const entries = readdirSync(source, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() || entry.name.endsWith(".md")
  );
  if (entries.length === 0) {
    console.error(`.claude/${folder} đang rỗng — bỏ qua để tránh xóa nhầm .agents/${folder}.`);
    return;
  }
  const sourceNames = entries.map((entry) => entry.name);

  // Xóa mục ở đích không còn trong nguồn
  if (existsSync(target)) {
    for (const entry of readdirSync(target, { withFileTypes: true })) {
      if (!sourceNames.includes(entry.name)) {
        rmSync(path.join(target, entry.name), { recursive: true, force: true });
        console.log(`− Xóa khỏi .agents/${folder} (không còn ở nguồn): ${entry.name}`);
      }
    }
  } else {
    mkdirSync(target, { recursive: true });
  }

  // Copy đè từng mục từ nguồn sang đích
  for (const name of sourceNames) {
    cpSync(path.join(source, name), path.join(target, name), { recursive: true, force: true });
    console.log(`✓ Đồng bộ ${folder}: ${name}`);
  }
  console.log(`Xong — ${sourceNames.length} mục trong .agents/${folder} khớp với .claude/${folder}.`);
}

mirror("skills", { required: true });
mirror("agents", { required: false });
