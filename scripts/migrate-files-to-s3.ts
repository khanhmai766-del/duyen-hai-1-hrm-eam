import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "../lib/prisma";
import { maybeUploadDataUrl, uploadBufferToS3, uploadImageBufferToS3 } from "../lib/s3";

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
