/**
 * ĐỐI CHIẾU tài liệu quy trình ↔ vector đã tạo — CHỈ ĐỌC, KHÔNG GHI, KHÔNG XOÁ.
 *
 *   npx tsx scripts/check/document-ai-index.ts            # bảng tổng hợp + danh sách cần nạp lại
 *   npx tsx scripts/check/document-ai-index.ts --json     # xuất JSON để nạp vào n8n
 *   npx tsx scripts/check/document-ai-index.ts --chi-tiet # liệt kê từng tài liệu, kể cả loại OK
 *
 * CHẠY TRÊN SERVER. DB thật nằm trong mạng nội bộ; chạy ở máy dev sẽ trỏ vào Postgres
 * nhúng cổng 5433 và ra 0 dòng, không có nghĩa là không có vấn đề.
 *
 * VÌ SAO CẦN: OCR cho PDF quét CHƯA BAO GIỜ chạy được trên production — tesseract.js
 * 7.0.0 lấy dữ liệu làm tên ngôn ngữ (xem ghi chú trong lib/tcms/server/pdf/pdf-preview.ts).
 * Mọi PDF không có lớp text đều trích ra rỗng nên KHÔNG sinh vector nào. Script này chỉ ra
 * đúng những tài liệu đó để nạp lại sau khi bản vá đã lên.
 *
 * Script KHÔNG tự nạp lại: mỗi lần nạp tốn quota embedding Gemini. Nó in sẵn câu SQL để
 * bạn chủ động chạy khi quota cho phép.
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { buildDocumentAiIndexVersion } from "../../lib/document-ai-index";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

/** Nhóm tình trạng, xếp từ nặng tới nhẹ — thứ tự này cũng là thứ tự in ra. */
const GROUPS = [
  ["OCR_HONG", "PDF quét, OCR hỏng — CẦN NẠP LẠI sau khi vá tesseract"],
  ["LOI_KHAC", "Nạp lỗi vì lý do khác — đọc thông điệp rồi mới quyết"],
  ["CHUA_NAP", "Chưa nạp lần nào (có thể đang chờ tới lượt, hoặc n8n bỏ sót)"],
  ["RONG", "Có bản ghi tri thức nhưng KHÔNG có đoạn nào"],
  ["VECTOR_HONG", "Có đoạn nhưng vector rỗng — embedding hỏng"],
  ["LECH_PHIEN_BAN", "File Drive đã đổi sau lần nạp — cần nạp lại"],
  ["CHUA_DONG_BO", "Chưa đồng bộ được PDF từ Drive — chưa tới lượt nạp AI"],
  ["OK", "Đã nạp đủ, khớp phiên bản"],
] as const;

type Group = (typeof GROUPS)[number][0];

/**
 * Dấu hiệu lỗi do OCR. Ba nhóm:
 *  - thông điệp 422 của route khi trích xuất ra rỗng — dấu hiệu của PDF quét không cứu được;
 *  - lỗi ném thẳng từ tesseract.js;
 *  - "worker ocr lỗi" — thông điệp do lib/tcms/server/pdf/pdf-preview.ts tự đặt.
 *
 * LƯU Ý LỊCH SỬ: trước 21/09/2026 nhóm này LUÔN bằng 0 dù OCR hỏng liên tục, vì lỗi
 * tesseract là uncaughtException nên khối catch ghi `aiIndexError` không chạy tới —
 * tài liệu hỏng lẫn hết vào CHUA_NAP. Nay pdf-preview.ts đã bắt được (errorHandler +
 * Promise.race), nên từ đây nhóm này mới phản ánh đúng thực tế.
 */
const OCR_MARKERS = [
  "không trích xuất được nội dung chữ",
  "initialization failed",
  "failed loading language",
  "tesseract",
  "error opening data file",
];

function looksLikeOcrFailure(message: string) {
  const lowered = message.toLowerCase();
  return OCR_MARKERS.some((marker) => lowered.includes(marker));
}

function truncate(value: string, max: number) {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const asJson = args.has("--json");
  const verbose = args.has("--chi-tiet");

  const documents = await prisma.digitalDocument.findMany({
    select: {
      id: true,
      title: true,
      category: true,
      driveFileId: true,
      driveFileName: true,
      driveSyncStatus: true,
      driveChecksum: true,
      driveModifiedAt: true,
      aiIndexedAt: true,
      aiIndexVersion: true,
      aiIndexError: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const knowledge = await prisma.aiKnowledgeDocument.findMany({
    where: { sourcePath: { startsWith: "digital-document:" } },
    select: { id: true, sourcePath: true },
  });
  const knowledgeBySourcePath = new Map(knowledge.map((row) => [row.sourcePath, row]));

  // Đếm đoạn bằng raw SQL vì hai lẽ:
  //  - KHÔNG kéo cột `embedding` về (mỗi vector 768 số, vài nghìn đoạn là hàng trăm MB qua dây);
  //  - phải LỌC theo sourcePath, vì bảng này còn chứa kho tri thức markdown
  //    (scripts/ai/knowledge-ingest.ts) — đếm tuốt sẽ ra con số không liên quan tới tài liệu.
  // array_length trả NULL cho mảng rỗng nên phải COALESCE.
  const chunkRows = await prisma.$queryRaw<
    { documentId: string; chunks: bigint; emptyEmbeddings: bigint }[]
  >`
    SELECT c."documentId",
           COUNT(*) AS "chunks",
           COUNT(*) FILTER (WHERE COALESCE(array_length(c."embedding", 1), 0) = 0) AS "emptyEmbeddings"
    FROM "AiKnowledgeChunk" c
    JOIN "AiKnowledgeDocument" d ON d.id = c."documentId"
    WHERE d."sourcePath" LIKE 'digital-document:%'
    GROUP BY c."documentId"
  `;
  const chunkStats = new Map(
    chunkRows.map((row) => [
      row.documentId,
      { chunks: Number(row.chunks), emptyEmbeddings: Number(row.emptyEmbeddings) },
    ]),
  );

  const results = documents.map((document) => {
    const knowledgeDocument = knowledgeBySourcePath.get(`digital-document:${document.id}`);
    const stats = knowledgeDocument ? chunkStats.get(knowledgeDocument.id) : undefined;
    const chunks = stats?.chunks ?? 0;
    const emptyEmbeddings = stats?.emptyEmbeddings ?? 0;
    const desiredVersion = buildDocumentAiIndexVersion(document);
    const error = document.aiIndexError?.trim() ?? "";

    let group: Group;
    if (document.driveSyncStatus !== "SYNCED" || !document.driveFileId) group = "CHUA_DONG_BO";
    else if (error) group = looksLikeOcrFailure(error) ? "OCR_HONG" : "LOI_KHAC";
    else if (!knowledgeDocument) group = "CHUA_NAP";
    else if (chunks === 0) group = "RONG";
    else if (emptyEmbeddings > 0) group = "VECTOR_HONG";
    else if (document.aiIndexVersion !== desiredVersion) group = "LECH_PHIEN_BAN";
    else group = "OK";

    return { document, group, chunks, emptyEmbeddings, desiredVersion, error };
  });

  if (asJson) {
    // Chỉ xuất nhóm cần hành động — nhóm OK và CHUA_DONG_BO không phải việc của n8n.
    const actionable = results.filter(
      (row) => row.group !== "OK" && row.group !== "CHUA_DONG_BO",
    );
    console.log(
      JSON.stringify(
        actionable.map((row) => ({
          id: row.document.id,
          title: row.document.title,
          group: row.group,
          driveFileId: row.document.driveFileId,
          driveFileName: row.document.driveFileName,
          chunks: row.chunks,
          aiIndexError: row.error || null,
        })),
        null,
        2,
      ),
    );
    return;
  }

  const total = results.length;
  const totalChunks = [...chunkStats.values()].reduce((sum, row) => sum + row.chunks, 0);
  console.log(`Tài liệu quy trình: ${total} · đoạn vector CỦA TÀI LIỆU: ${totalChunks}`);

  // Bản ghi tri thức trỏ tới tài liệu đã bị xoá: chatbot vẫn trích dẫn được nhưng người
  // dùng bấm vào thì không mở ra gì. Không thuộc việc nạp lại nên tách riêng.
  const documentIds = new Set(documents.map((row) => row.id));
  const orphans = knowledge.filter(
    (row) => !documentIds.has(row.sourcePath.slice("digital-document:".length)),
  );
  if (orphans.length > 0) {
    console.log(`CẢNH BÁO: ${orphans.length} bản ghi tri thức trỏ tới tài liệu KHÔNG CÒN TỒN TẠI:`);
    for (const row of orphans) console.log(`  ${row.sourcePath}`);
  }
  console.log("");

  console.log("--- Tổng hợp ---");
  for (const [group, label] of GROUPS) {
    const count = results.filter((row) => row.group === group).length;
    if (count === 0) continue;
    console.log(`  ${String(count).padStart(4)}  ${group.padEnd(15)} ${label}`);
  }

  // Nhịp nạp theo ngày: phân biệt 'workflow đang chạy, chỉ là chậm' với 'workflow đã dừng'.
  // Ngày hôm nay bằng 0 mà hàng đợi còn dài là dấu hiệu nó chết chứ không phải đang xếp hàng.
  const indexedByDay = new Map<string, number>();
  for (const row of results) {
    const at = row.document.aiIndexedAt;
    if (!at) continue;
    const day = at.toISOString().slice(0, 10);
    indexedByDay.set(day, (indexedByDay.get(day) ?? 0) + 1);
  }
  if (indexedByDay.size > 0) {
    console.log("\n--- Nhịp nạp thành công theo ngày ---");
    for (const [day, count] of [...indexedByDay].sort().slice(-7)) {
      console.log(`  ${day}  ${String(count).padStart(4)}`);
    }
  }

  // CHUA_DONG_BO không tự khỏi theo thời gian: MISSING là Drive không có file, NEEDS_REVIEW
  // là chờ người chọn. Gộp chung một con số sẽ che mất phần cần người vào làm tay.
  const unsynced = results.filter((row) => row.group === "CHUA_DONG_BO");
  if (unsynced.length > 0) {
    const byStatus = new Map<string, number>();
    for (const row of unsynced) {
      const status = row.document.driveSyncStatus ?? "(chưa thử đồng bộ)";
      byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
    }
    console.log("\n--- CHUA_DONG_BO chia theo trạng thái Drive ---");
    for (const [status, count] of [...byStatus].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(4)}  ${status}`);
    }
    const needsHuman = (byStatus.get("MISSING") ?? 0) + (byStatus.get("NEEDS_REVIEW") ?? 0);
    if (needsHuman > 0) {
      console.log(`  → ${needsHuman} tài liệu cần người vào Drive xử lý, workflow không tự khỏi.`);
    }
  }

  for (const [group, label] of GROUPS) {
    if (group === "OK" && !verbose) continue;
    if (group === "CHUA_DONG_BO" && !verbose) continue;
    const rows = results.filter((row) => row.group === group);
    if (rows.length === 0) continue;

    console.log(`\n--- ${group} (${rows.length}) — ${label} ---`);
    for (const row of rows) {
      const name = truncate(row.document.driveFileName || row.document.title, 62);
      console.log(`  ${row.document.id}  ${name}`);
      if (row.error) console.log(`      lỗi: ${truncate(row.error, 110)}`);
      else if (group === "RONG" || group === "VECTOR_HONG") {
        console.log(`      đoạn: ${row.chunks} · vector rỗng: ${row.emptyEmbeddings}`);
      }
    }
  }

  const needsReindex = results.filter(
    (row) => row.group !== "OK" && row.group !== "CHUA_DONG_BO",
  );
  if (needsReindex.length === 0) {
    console.log("\nKhông có tài liệu nào cần nạp lại.");
    return;
  }

  console.log(`\n--- Nạp lại ${needsReindex.length} tài liệu ---`);
  console.log("Xoá dấu phiên bản để lần chạy n8n kế tiếp coi là tài liệu mới.");
  console.log("CHẠY KHI QUOTA EMBEDDING CHO PHÉP — mỗi tài liệu là một lượt gọi Gemini.\n");
  const ids = needsReindex.map((row) => `'${row.document.id}'`).join(",\n    ");
  console.log(
    `UPDATE "DigitalDocument"\n` +
      `   SET "aiIndexVersion" = NULL, "aiIndexError" = NULL\n` +
      ` WHERE id IN (\n    ${ids}\n  );`,
  );
  // Workflow AI chạy 14:05–15:40, tối đa 20 PDF/ngày, mỗi PDF cách 5 phút để giữ quota
  // Gemini (docs/n8n-document-sync/README.md). Xoá dấu phiên bản hàng loạt KHÔNG làm nó
  // chạy nhanh hơn, chỉ kéo dài số ngày — nói rõ để khỏi tưởng workflow bị treo.
  const days = Math.ceil(needsReindex.length / 20);
  console.log("");
  console.log(
    `Workflow nạp tối đa 20 PDF/ngày → ${needsReindex.length} tài liệu mất khoảng ${days} ngày.`,
  );
  console.log(
    "Muốn chắc ăn thì thử vài tài liệu trước: bớt id trong danh sách trên rồi chạy lại.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
