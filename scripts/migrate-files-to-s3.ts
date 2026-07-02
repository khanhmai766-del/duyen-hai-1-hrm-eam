import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "../lib/prisma";
import { maybeUploadDataUrl, safeEmployeeCode, uploadBufferToS3, uploadImageBufferToS3, uploadS3Object } from "../lib/s3";

type ImagePreset = "avatar" | "signature" | "image" | "document-image";

function isLocalUpload(value: string) {
  return value.startsWith("/uploads/");
}

function localUploadPath(value: string) {
  return path.join(process.cwd(), "public", value.replace(/^\/+/, ""));
}

function contentTypeFromName(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
  };
  return map[ext] ?? "application/octet-stream";
}

async function migrateUrl(value: string | null | undefined, folder: string, preset: ImagePreset) {
  if (!value) return value ?? null;
  if (value.startsWith("data:image/")) return maybeUploadDataUrl({ value, folder, preset });
  if (!isLocalUpload(value)) return value;

  const filePath = localUploadPath(value);
  if (!existsSync(filePath)) {
    console.warn(`Bỏ qua vì không thấy file local: ${value}`);
    return value;
  }

  const buffer = await readFile(filePath);
  const contentType = contentTypeFromName(filePath);
  if (contentType.startsWith("image/")) {
    const uploaded = await uploadImageBufferToS3({ buffer, contentType, folder, preset });
    return uploaded.url;
  }
  const uploaded = await uploadBufferToS3({ buffer, contentType, folder, filename: path.basename(filePath) });
  return uploaded.url;
}

async function migrateJsonImageList(raw: string | null | undefined, folder: string, preset: ImagePreset) {
  const list = raw ? (JSON.parse(raw) as string[]) : [];
  const next = await Promise.all(list.map((value) => migrateUrl(value, folder, preset)));
  return JSON.stringify(next.filter(Boolean));
}

const USER_MEDIA_RE = /^data:([^;,]+);base64,(.+)$/;

const USER_MEDIA_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Avatar/chữ ký user base64 → S3 theo key chuẩn của app (avatars/{mã NV}.{ext},
 * signatures/{mã NV}.{ext} — trùng convention của /api/me và admin-user-media),
 * ghi avatarKey/signatureKey rồi xóa base64. userWithSignedMedia/publicUserRef
 * sẽ tự phục vụ qua proxy /api/files/s3.
 */
async function migrateUsers() {
  const users = await prisma.user.findMany({
    select: { id: true, employeeId: true, avatarUrl: true, signatureUrl: true, avatarKey: true, signatureKey: true },
  });
  for (const user of users) {
    const data: Record<string, unknown> = {};
    for (const kind of ["avatar", "signature"] as const) {
      const value = kind === "avatar" ? user.avatarUrl : user.signatureUrl;
      const existingKey = kind === "avatar" ? user.avatarKey : user.signatureKey;
      if (!value) continue;
      const match = value.match(USER_MEDIA_RE);
      if (!match) continue; // URL thường — giữ nguyên
      if (existingKey) {
        // Đã có key (flow mới) mà base64 cũ vẫn còn — runtime vốn ưu tiên key, chỉ cần dọn base64.
        if (kind === "avatar") data.avatarUrl = null;
        else data.signatureUrl = null;
        continue;
      }
      const ext = USER_MEDIA_EXT[match[1].toLowerCase()];
      if (!ext) {
        console.warn(`Bỏ qua ${kind} của ${user.employeeId}: định dạng ${match[1]} không hỗ trợ`);
        continue;
      }
      try {
        const key = `${kind === "avatar" ? "avatars" : "signatures"}/${safeEmployeeCode(user.employeeId)}.${ext}`;
        await uploadS3Object({ key, body: Buffer.from(match[2], "base64"), contentType: match[1] });
        if (kind === "avatar") {
          data.avatarKey = key;
          data.avatarUrl = null;
        } else {
          data.signatureKey = key;
          data.signatureUrl = null;
        }
      } catch (error) {
        console.warn(`Bỏ qua ${kind} của ${user.employeeId}: ${(error as Error).message}`);
      }
    }
    if (Object.keys(data).length) {
      await prisma.user.update({ where: { id: user.id }, data });
      console.log(`Đã migrate media User ${user.employeeId}`);
    }
  }
}

async function migrateRepairLogs() {
  const rows = await prisma.repairLog.findMany({ select: { id: true, attachments: true } });
  for (const row of rows) {
    const attachments = (
      await Promise.all(row.attachments.map((value) => migrateUrl(value, "repair-logs/attachments", "image")))
    ).filter((value): value is string => !!value);
    if (JSON.stringify(attachments) !== JSON.stringify(row.attachments)) {
      await prisma.repairLog.update({ where: { id: row.id }, data: { attachments } });
      console.log(`Đã migrate RepairLog ${row.id}`);
    }
  }
}

async function migrateEquipmentNodes() {
  const rows = await prisma.equipmentNode.findMany({ select: { id: true, imageUrl: true } });
  for (const row of rows) {
    const imageUrl = await migrateUrl(row.imageUrl, "equipment/images", "image");
    if (imageUrl !== row.imageUrl) {
      await prisma.equipmentNode.update({ where: { id: row.id }, data: { imageUrl } });
      console.log(`Đã migrate EquipmentNode ${row.id}`);
    }
  }
}

async function migrateMaterials() {
  const rows = await prisma.material.findMany({ select: { id: true, imageUrl: true } });
  for (const row of rows) {
    const imageUrl = await migrateUrl(row.imageUrl, "materials/images", "image");
    if (imageUrl !== row.imageUrl) {
      await prisma.material.update({ where: { id: row.id }, data: { imageUrl } });
      console.log(`Đã migrate Material ${row.id}`);
    }
  }
}

async function migrateDefects() {
  const rows = await prisma.defect.findMany({ select: { id: true, imageUrl: true } });
  for (const row of rows) {
    const imageUrl = await migrateUrl(row.imageUrl, "defects/images", "image");
    if (imageUrl !== row.imageUrl) {
      await prisma.defect.update({ where: { id: row.id }, data: { imageUrl } });
      console.log(`Đã migrate Defect ${row.id}`);
    }
  }
}

async function migrateDefectHistories() {
  const rows = await prisma.defectHistory.findMany({ select: { id: true, images: true } });
  for (const row of rows) {
    const images = (await Promise.all(row.images.map((value) => migrateUrl(value, "defect-history/images", "image")))).filter(
      (value): value is string => !!value
    );
    if (JSON.stringify(images) !== JSON.stringify(row.images)) {
      await prisma.defectHistory.update({ where: { id: row.id }, data: { images } });
      console.log(`Đã migrate DefectHistory ${row.id}`);
    }
  }
}

async function migrateAnnouncements() {
  const rows = await prisma.announcement.findMany({ select: { id: true, fileUrl: true } });
  for (const row of rows) {
    const fileUrl = await migrateUrl(row.fileUrl, "announcements/pdf", "document-image");
    if (fileUrl !== row.fileUrl) {
      await prisma.announcement.update({ where: { id: row.id }, data: { fileUrl } });
      console.log(`Đã migrate Announcement ${row.id}`);
    }
  }
}

async function migrateDigitalDocuments() {
  const rows = await prisma.digitalDocument.findMany({ select: { id: true, attachmentUrls: true } });
  for (const row of rows) {
    const attachmentUrls = await migrateJsonImageList(row.attachmentUrls, "digital-documents/attachments", "document-image");
    if (attachmentUrls !== (row.attachmentUrls || "[]")) {
      await prisma.digitalDocument.update({ where: { id: row.id }, data: { attachmentUrls } });
      console.log(`Đã migrate DigitalDocument ${row.id}`);
    }
  }
}

async function migrateRosterSchedule() {
  const localPdf = path.join(process.cwd(), "public", "uploads", "lich-truc-ca-vh1.pdf");
  if (!existsSync(localPdf)) return;
  const existing = await prisma.rbacConfig.findUnique({ where: { key: "roster-schedule" } });
  if (existing?.value) return;
  const uploaded = await uploadBufferToS3({
    buffer: await readFile(localPdf),
    contentType: "application/pdf",
    folder: "roster/pdf",
    filename: "lich-truc-ca-vh1.pdf",
  });
  await prisma.rbacConfig.upsert({
    where: { key: "roster-schedule" },
    create: {
      key: "roster-schedule",
      value: JSON.stringify({
        url: uploaded.url,
        key: uploaded.key,
        name: "lich-truc-ca-vh1.pdf",
        uploadedAt: new Date().toISOString(),
        uploadedBy: "migration",
      }),
    },
    update: {},
  });
  console.log("Đã migrate lịch trực ca");
}

async function main() {
  console.log("Bắt đầu migrate base64/local upload sang S3...");
  await migrateUsers();
  await migrateRepairLogs();
  await migrateEquipmentNodes();
  await migrateMaterials();
  await migrateDefects();
  await migrateDefectHistories();
  await migrateAnnouncements();
  await migrateDigitalDocuments();
  await migrateRosterSchedule();
  console.log("Hoàn tất migrate file sang S3.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
