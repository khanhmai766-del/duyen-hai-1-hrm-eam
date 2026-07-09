import path from "path";
import { readFile } from "fs/promises";
import { fail, handle, requireUser } from "@/lib/api";
import { getS3Object, uploadS3Object } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PDF_KEY = "public/material-procedures/luu-do-thuc-hien-vat-tu-vh1.pdf";
const PDF_NAME = "Tờ Trình Phương án công tác lập kế hoạch và lĩnh vật tư sử dụng trong VH1.pdf";
const LOCAL_PDF_PATH = path.join(process.cwd(), "public", "material-procedures", "luu-do-thuc-hien-vat-tu-vh1.pdf");

function pdfHeaders() {
  return {
    "Content-Type": "application/pdf",
    "Cache-Control": "private, max-age=300",
    "Content-Disposition": `inline; filename="luu-do-thuc-hien-vat-tu-vh1.pdf"; filename*=UTF-8''${encodeURIComponent(PDF_NAME)}`,
  };
}

function objectBodyToResponse(body: unknown) {
  if (!body) return null;
  const stream =
    typeof (body as { transformToWebStream?: () => ReadableStream }).transformToWebStream === "function"
      ? (body as { transformToWebStream: () => ReadableStream }).transformToWebStream()
      : (body as ReadableStream);
  return new Response(stream, { headers: pdfHeaders() });
}

export async function GET() {
  return handle(async () => {
    await requireUser();

    try {
      const object = await getS3Object(PDF_KEY);
      const response = objectBodyToResponse(object.Body);
      if (response) return response;
    } catch (error) {
      console.warn("Không đọc được lưu đồ từ S3, thử nạp bản bundle", error);
    }

    try {
      const buffer = await readFile(LOCAL_PDF_PATH);
      try {
        await uploadS3Object({
          key: PDF_KEY,
          body: buffer,
          contentType: "application/pdf",
          originalName: PDF_NAME,
        });
      } catch (error) {
        console.warn("Không thể đồng bộ lưu đồ lên S3", error);
      }
      return new Response(buffer, { headers: pdfHeaders() });
    } catch {
      return fail("Không tìm thấy file lưu đồ thực hiện", 404);
    }
  });
}
