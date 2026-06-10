// Đổi một chức vụ này thành chức vụ khác cho toàn bộ user.
// So khớp NFC + không phân biệt hoa/thường; giữ đúng encoding của bản đích.
import { PrismaClient } from "@prisma/client";

const FROM = "VHV Máy phó";
const TO = "Máy phó";

const prisma = new PrismaClient();
const norm = (s) => (s ?? "").trim().normalize("NFC").toLowerCase();

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, position: true } });
  // Dùng đúng chuỗi "Máy phó" đang có trong dữ liệu (giữ encoding), nếu không có thì dùng literal.
  const canonical =
    users.map((u) => (u.position ?? "").trim()).find((p) => norm(p) === norm(TO)) ?? TO.normalize("NFC");

  let n = 0;
  for (const u of users) {
    if (norm(u.position) === norm(FROM)) {
      await prisma.user.update({ where: { id: u.id }, data: { position: canonical } });
      n++;
    }
  }
  console.log(`✅ Đổi ${n} user "${FROM}" → "${canonical}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
