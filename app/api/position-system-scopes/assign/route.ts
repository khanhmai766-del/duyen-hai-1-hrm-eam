import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";

// Endpoint cũ đã ngừng dùng: phân loại Khối/Cương vị không còn là nguồn phân quyền.
export async function POST() {
  return fail("Chức năng gán quyền tại cây thiết bị đã được thay bằng phân loại thiết bị", 410);
}
