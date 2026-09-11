import { adaptTcmsRoute } from "@/lib/tcms/server/http/route-adapter";
import { requireRolePermission } from "@/lib/tcms/server/contracts/contract-api";
import { apiError } from "@/lib/tcms/server/http/api-response";
import { getRequestContext } from "@/lib/tcms/server/http/request-context";
import {
  toContractFormDraft,
  toContractFieldEvidence,
  toImportDrafts,
  validatePdfSignature,
  validatePdfUpload,
} from "@/lib/tcms/server/pdf/contract-item-import";
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

async function POSTHandler(request: Request) {
  try {
    const context = await getRequestContext(request);
    requireRolePermission(context.principal, "contract.create");

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
      // This is the only provider invocation for the uploaded PDF. The same
      // structured response contains both the contract draft and item drafts.
      const extraction = await provider.extract({
        data,
        fileName: file.name,
        includeContractDraft: true,
      });
      if (!extraction.contract) throw new Error("AI_CONTRACT_OUTPUT_MISSING");
      const drafts = toImportDrafts(extraction.items);
      return Response.json({
        file: { name: file.name, size: file.size, type: file.type || "application/pdf" },
        provider: { id: extraction.providerId, model: extraction.model },
        extraction: { source: "ai", pageCount: null, textLength: null, textPreview: "" },
        contractDraft: toContractFormDraft(extraction.contract),
        contractEvidence: toContractFieldEvidence(extraction.contract),
        drafts,
        message: drafts.length
          ? `AI đã nhận diện thông tin hợp đồng và ${drafts.length} hạng mục. Hãy kiểm tra, sửa trước khi xác nhận tạo.`
          : "AI đã nhận diện thông tin hợp đồng nhưng chưa tìm thấy hạng mục có đủ căn cứ.",
      }, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      console.error("Contract creation PDF extraction failed", {
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
        contractDraft: {},
        contractEvidence: [],
        drafts: [],
        message: "AI không khả dụng. Hệ thống chỉ đọc nội dung cục bộ để tham khảo và chưa tạo bản nháp.",
      }, { headers: { "cache-control": "no-store" } });
    }
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";

export const POST = adaptTcmsRoute(POSTHandler);
