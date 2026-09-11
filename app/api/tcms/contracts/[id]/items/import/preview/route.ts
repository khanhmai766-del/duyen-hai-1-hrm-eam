import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { requireContractPermission } from "@/lib/tcms/server/contracts/contract-api";
import { PostgresContractRepository } from "@/lib/tcms/server/contracts/postgres-contract-repository";
import { withSecurityTransaction } from "@/lib/tcms/server/db/security-transaction";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";
import { toImportDrafts, validatePdfSignature, validatePdfUpload } from "@/lib/tcms/server/pdf/contract-item-import";
import { extractPdfPreview } from "@/lib/tcms/server/pdf/pdf-preview";
import { getContractItemPdfProvider } from "@/lib/tcms/server/pdf/provider-factory";

export const runtime = "nodejs";

function uploadError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, [string, number]> = {
    INVALID_FILE_TYPE: ["Chỉ hỗ trợ tệp PDF.", 400],
    EMPTY_PDF: ["Tệp PDF đang trống.", 400],
    PDF_TOO_LARGE: ["Tệp PDF vượt quá giới hạn 20 MB.", 413],
    INVALID_PDF_CONTENT: ["Nội dung tệp không đúng định dạng PDF.", 400],
  };
  const mapped = messages[code];
  return mapped ? Response.json({ error: code, message: mapped[0] }, { status: mapped[1] }) : null;
}

async function POSTHandler(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = await getRequestContext(request);
    const { id } = await params;
    const contractExists = await withSecurityTransaction(context, async (client) => {
      const contract = await new PostgresContractRepository(client).findById(id);
      if (!contract) return false;
      requireContractPermission(context.principal, "contract.identity.update", contract);
      return true;
    });
    if (!contractExists) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "PDF_REQUIRED", message: "Vui lòng chọn một tệp PDF." }, { status: 400 });
    }
    if (formData.get("redactionConfirmed") !== "true") {
      return Response.json({
        error: "REDACTION_CONFIRMATION_REQUIRED",
        message: "Cần xác nhận PDF đã loại thông tin nhạy cảm trước khi gửi tới AI.",
      }, { status: 400 });
    }

    try {
      validatePdfUpload(file);
    } catch (error) {
      return uploadError(error) ?? apiError(error);
    }

    const data = Buffer.from(await file.arrayBuffer());
    try {
      validatePdfSignature(data);
    } catch (error) {
      return uploadError(error) ?? apiError(error);
    }

    try {
      const provider = getContractItemPdfProvider();
      const extraction = await provider.extract({ data, fileName: file.name });
      const drafts = toImportDrafts(extraction.items);
      return Response.json({
        file: { name: file.name, size: file.size, type: file.type || "application/pdf" },
        provider: { id: extraction.providerId, model: extraction.model },
        extraction: { source: "openai", pageCount: null, textLength: null, textPreview: "" },
        drafts,
        message: drafts.length
          ? `AI đã nhận diện ${drafts.length} hạng mục. Hãy kiểm tra và sửa trước khi xác nhận nhập.`
          : "AI không tìm thấy hạng mục có đủ căn cứ trong PDF.",
      }, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      console.error("PDF AI extraction failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        code: error instanceof Error ? error.message : "UNKNOWN",
      });
      if (process.env.TCMS_PDF_LOCAL_OCR_FALLBACK !== "true") {
        return Response.json({
          error: "PDF_AI_UNAVAILABLE",
          message: "Dịch vụ AI chưa sẵn sàng. Tệp chưa được nhập và không có dữ liệu nào được lưu.",
        }, { status: 503 });
      }

      const fallback = await extractPdfPreview(data);
      const previewLength = 15_000;
      return Response.json({
        file: { name: file.name, size: file.size, type: file.type || "application/pdf" },
        provider: { id: "local-ocr-fallback", model: null },
        extraction: {
          source: fallback.source,
          pageCount: fallback.pageCount,
          textLength: fallback.textLength,
          textPreview: fallback.text.length > previewLength
            ? `${fallback.text.slice(0, previewLength)}\n\n[...Nội dung còn tiếp...]`
            : fallback.text,
        },
        drafts: [],
        message: "AI không khả dụng. Hệ thống chỉ đọc nội dung bằng fallback cục bộ và chưa tự tạo hạng mục.",
      }, { headers: { "cache-control": "no-store" } });
    }
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";

export const POST = adaptTcmsRoute(POSTHandler);
