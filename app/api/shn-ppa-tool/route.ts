import { createHash } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";
import { audit, fail, handle, ok, requireRole, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_HTML_BYTES = 2 * 1024 * 1024;

export async function GET() {
  return handle(async () => {
    await requireUser();
    const versions = await prisma.shnPpaToolVersion.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true, fileName: true, contentHash: true, isActive: true, createdAt: true,
        uploadedBy: { select: { name: true } },
      },
    });
    return ok(versions);
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("Vui lòng chọn file HTML");
    if (!file.name.toLowerCase().endsWith(".html")) return fail("Chỉ chấp nhận file có đuôi .html");
    if (file.size < 100 || file.size > MAX_HTML_BYTES) return fail("File HTML phải nhỏ hơn 2 MB");
    const content = await file.text();
    if (!/<html[\s>]/i.test(content) || !/<script[\s>]/i.test(content)) {
      return fail("File không có cấu trúc HTML hợp lệ");
    }
    const contentHash = createHash("sha256").update(content).digest("hex");
    const existing = await prisma.shnPpaToolVersion.findFirst({ where: { contentHash } });
    if (existing) return fail("Phiên bản HTML này đã được tải lên trước đó");
    const versionCount = await prisma.shnPpaToolVersion.count();
    const defaultContent = versionCount === 0
      ? await readFile(path.join(process.cwd(), "public/tools/so-sanh-shn-ppa.html"), "utf8")
      : null;
    const defaultHash = defaultContent ? createHash("sha256").update(defaultContent).digest("hex") : null;
    if (defaultHash === contentHash) return fail("File này chính là phiên bản mặc định đang sử dụng");
    const version = await prisma.$transaction(async (tx) => {
      if (defaultContent && defaultHash) {
        await tx.shnPpaToolVersion.create({
          data: {
            fileName: "so-sanh-shn-ppa-mac-dinh.html", content: defaultContent,
            contentHash: defaultHash, isActive: false, uploadedById: user.id,
          },
        });
      }
      await tx.shnPpaToolVersion.updateMany({ where: { isActive: true }, data: { isActive: false } });
      return tx.shnPpaToolVersion.create({
        data: { fileName: file.name.slice(0, 255), content, contentHash, isActive: true, uploadedById: user.id },
        select: { id: true, fileName: true, isActive: true, createdAt: true },
      });
    });
    const oldVersions = await prisma.shnPpaToolVersion.findMany({
      where: { isActive: false }, orderBy: { createdAt: "desc" }, skip: 29, select: { id: true },
    });
    if (oldVersions.length) await prisma.shnPpaToolVersion.deleteMany({ where: { id: { in: oldVersions.map((item) => item.id) } } });
    await audit(user.id, "UPLOAD_SHN_PPA_HTML", "ShnPpaToolVersion", version.id,
      `Tải lên và kích hoạt ${version.fileName}`, { actorName: user.name });
    return ok(version);
  });
}

export async function PUT(request: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    requireRole(user, ["ADMIN"]);
    const body = await request.json().catch(() => null) as { id?: string } | null;
    if (!body?.id) return fail("Thiếu phiên bản cần kích hoạt");
    const target = await prisma.shnPpaToolVersion.findUnique({ where: { id: body.id } });
    if (!target) return fail("Không tìm thấy phiên bản HTML", 404);
    await prisma.$transaction([
      prisma.shnPpaToolVersion.updateMany({ where: { isActive: true }, data: { isActive: false } }),
      prisma.shnPpaToolVersion.update({ where: { id: target.id }, data: { isActive: true } }),
    ]);
    await audit(user.id, "ACTIVATE_SHN_PPA_HTML", "ShnPpaToolVersion", target.id,
      `Kích hoạt lại ${target.fileName}`, { actorName: user.name });
    return ok({ id: target.id, fileName: target.fileName });
  });
}
